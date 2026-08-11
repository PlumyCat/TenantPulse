# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# What this is

TenantPulse is an **M365 / Google Workspace tenant diagnostic tool** built as a static web app
with an optional Azure Functions backend. It analyses domains via public APIs called directly
from the browser and adds a role-based tenant-tagging/classification system backed by Azure
Table Storage. All UI text and code comments are in **French**. Internal prototype ("RUNMW N1").

There is no `package.json` at the root, no test suite, no linter, and no CI for the frontend.
The frontend is just HTML + CSS + Vanilla JS + image assets — no build step.

---

## Directory structure

```
Project App tenant pulse push to github/
├── index.html               # Main shell
├── tenantpulse.js           # Core app logic (~3940 lines)
├── tenantpulse.css          # Shared stylesheet (root + sub-apps)
├── staticwebapp.config.json # Azure Static Web Apps: routes, auth, CSP headers
├── assets/                  # PNG/JPEG logos and icons
├── ML/                      # Mhaelle sub-app (email header analyzer)
│   ├── mhaelle.html
│   ├── mhaelle.js
│   └── mhaelle.css
├── extension/               # Chromium browser extension (MV3) — Tenant ID + shortcuts
│   ├── manifest.json
│   ├── popup.html / popup.css / popup.js
│   ├── tp-core.js           # config COPIED from tenantpulse.js (keep in sync)
│   ├── sync.js              # content script mirroring app localStorage
│   └── assets/              # subset of ../assets
└── api/                     # Azure Functions v2.0 (Node.js) — optional backend
    ├── host.json
    ├── shared/
    │   ├── auth.js          # getAuthContext(), hasRole(), role hierarchy
    │   ├── tableClient.js   # Azure Table Storage clients
    │   ├── tagUtils.js      # tag grouping helpers
    │   └── defaults.js      # fallback config
    ├── me/                  # GET /api/me
    ├── banner/              # GET + POST + DELETE /api/banner — bandeau d'info
    ├── classification/      # GET + DELETE /api/classification
    ├── request/             # POST /api/request
    ├── requests/            # GET /api/requests
    ├── review/              # POST + DELETE /api/review
    ├── tags/                # GET + POST + DELETE /api/tags
    ├── lock/                # POST + DELETE /api/lock
    └── roles/               # GET + POST /api/roles
```

---

## Running locally

Serve over HTTP — do **not** open `index.html` from `file://` (DoH/fetch and iframe
same-origin theme sync need a real origin):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

`file://` partially works because the sub-apps fall back to `postMessage` for theme sync,
but network calls and direct cross-frame DOM access will be unreliable.

For the Azure Functions backend:
```bash
# Requires Azure Functions Core Tools + connection strings in local.settings.json
cd api && func start
```

---

## Architecture

### Three apps in one shell, wired by iframes + postMessage

- **TenantPulse** (root): `index.html` + `tenantpulse.js` + `tenantpulse.css` — the M365/DNS
  diagnostic tool and shell.
- **Mhaelle** (`ML/`): email-header analyzer. Loaded into `#mhaelleFrame` as
  `ML/mhaelle.html?embedded=1`. Status: `dev`.
Tab switching (`switchAppTab`) lazily sets the iframe `src` on first open. The shell talks to
frames via `postMessage`:
- `{type:'tp-theme', theme}` → push light/dark theme into frames.
- `{type:'ml-profile', profile}` → push Mhaelle block layout into the ML frame.

Sub-apps detect embedding (`window.self !== window.top` or `?embedded=1`) to hide their
navbar and sync theme two ways: direct parent-DOM read when same-origin, `postMessage`
fallback otherwise. **Sub-apps share `../tenantpulse.css`** plus their own override sheet.

### Network model — browser → public APIs, no proxy

`tenantpulse.js` fetch helpers: `fetchWithAbort`/`fetchJsonC`/`fetchTextC` use a per-step
`AbortController` (stored in `stepControllers`), supporting cancel + retry via `stepRetryFns`.

External endpoints:
- `login.microsoftonline.com/<domain>/.well-known/openid-configuration` → tenant ID;
  `validateTenantGuid` re-queries the GUID and rejects generic MSA tenants (`MS_GENERIC_GUIDS`).
- `cloudflare-dns.com/dns-query` puis `dns.google/resolve` en secours (DNS-over-HTTPS JSON,
  header `Accept: application/dns-json`) → MX/TXT/etc via `dohResolve`/`dnsQuery`. Tous deux
  gratuits, usage commercial autorisé, même schéma de réponse. `DOH_RESOLVERS` porte la liste,
  `dohActif` l'index retenu : on ne change de résolveur qu'après un échec avéré, et seulement
  si le suivant a réellement répondu — une panne passagère ne condamne pas la session.

> [!IMPORTANT]
> **Ne jamais faire transiter les résolutions DNS par le backend.** Un relais same-origin a été
> écrit puis retiré délibérément (voir l'historique git). Les raisons valent d'être rappelées,
> car la tentation revient à chaque incident réseau :
> - **Coût.** Une analyse complète enchaîne **51 résolutions** (mesuré, la récursion SPF
>   réinterroge les mêmes `include:`). Côté navigateur c'est gratuit et ça le reste quel que
>   soit le nombre d'utilisateurs ; côté serveur, la facture croît linéairement avec l'usage.
> - **Sous-traitance RGPD.** Aujourd'hui l'application ne traite aucune donnée pour le compte
>   de ses utilisateurs. Faire transiter les domaines analysés changerait ce statut — et pour
>   un outil MSP, le flux de domaines révèle la liste des clients de l'utilisateur.
> - **Argument produit.** « Aucun serveur intermédiaire ne reçoit ces requêtes » est affiché
>   dans la page Confidentialité et se vend. Ça ne se dépense pas pour contourner un pare-feu.
- `accounts.google.com` → Google Workspace detection.
- `rdap.org` + many registry RDAP servers → WHOIS / hosting detection (`detectHostFromNS`).
- `google.com/s2/favicons` → service icons.

### Two analysis depths

- **Fast** (`checkFast`): tenant ID + basic DNS — steps: `ms`, `google`, `dns`.
- **Full** (`checkFull` / `runFullFromState`): adds `checkHealth` (DMARC/SPF/DKIM scoring,
  DNSSEC, MTA-STS, BIMI) and `checkHost` (WHOIS/RDAP, registrar, hoster detection).

Confidence score for the tenant result: `computeConfidence(ms)` — weighted on tenantId,
validated GUID, issuer, token endpoint. Personal MSA domains (`MSA_DOMAINS`) are
short-circuited and never queried against the tenant endpoint.

### Persistence — localStorage only on the frontend

Opt-in by design. Keys:
- History: `tenantIdHistory_v1`, plus `tenantIdHistory_enabled`, `tenantIdHistory_max`,
  `tenantIdHistory_retentionMs`. Retention uses `RETENTION_STEPS` ladder (13 intervals);
  `pruneExpiredHistory` runs on open, on each save, and on retention change.
- Profiles: `tenantpulse_profile_v1` (TP button order), `mhaelle_profile_v1` (ML block layout).
- Résolveur DoH : `tenantpulse_doh_v1` (`cloudflare` | `google`). Absente = mode automatique,
  et choisir « Automatique » supprime la clé plutôt que d'y écrire une valeur par défaut.
- Bandeau : `tenantpulse_banner_hidden_v1` — identifiant du dernier message masqué par
  l'utilisateur. Masquer ne vaut donc que pour **ce** message : l'`id` renvoyé par l'API change
  à chaque publication, si bien qu'une nouvelle annonce réapparaît chez tout le monde.

### Optional backend — Azure Functions + Azure Table Storage

Deployed as Azure Static Web Apps with Entra ID authentication (AAD_CLIENT_ID / AAD_CLIENT_SECRET
env vars). Auth context is injected by the SWA runtime as the `x-ms-client-principal` header
(base64 JWT) and decoded in `api/shared/auth.js` via `getAuthContext()`.

**Tables in Azure Table Storage:**
| Table | Contents |
|---|---|
| `Roles` | `email → {role, blocked}` |
| `Classifications` | `tenantId + tagType → approved tag + approver` |
| `Requests` | Pending tag proposals from users |
| `Tags` | Custom tag definitions (`PartitionKey` = `tag`), balises par défaut (`default`), et le bandeau d'information sur sa ligne unique (`banner`/`current`) — trois partitions cloisonnées dans une même table, pour ne pas imposer une table Azure de plus pour une seule ligne |
| `Locks` | Per-tenant or global modification locks |

**Role hierarchy** (ascending permissions):
```
user < tech < moderator < manager < admin
```
`hasRole(ctx, 'moderator')` returns true for moderator, manager, and admin.
`tech` grants write access to internal procedures (`POST /api/process`) without
moderation powers; managers and admins can assign it via `/api/roles`.

**API endpoints:**

| Method | Route | Min role | Description |
|---|---|---|---|
| GET | `/api/me` | any auth | `{email, name, role, blocked}` |
| GET | `/api/banner` | any auth | Bandeau d'information courant ou `null`. L'expiration est évaluée **côté serveur** (l'horloge du poste n'est pas une référence) et la ligne périmée est supprimée au passage |
| POST | `/api/banner` | admin | Publie/remplace le bandeau : `{message, color, icon, durationMinutes}`. `icon` ∈ `warning`\|`info`, durée ≤ 7 jours |
| DELETE | `/api/banner` | admin | Retire le bandeau (idempotent) |
| GET | `/api/classification?tenantId=` | any auth | Approved tags + pending count + lock status |
| GET | `/api/classification?all=1` | any auth | Read-only directory: all assigned tags across tenants |
| DELETE | `/api/classification` | moderator | Remove an approved tag |
| POST | `/api/request` | any auth | Propose a tag (`action:"add"`) **or request its removal** (`action:"remove"`) |
| GET | `/api/requests` | moderator | List pending proposals (each carries `action`: `add`/`remove`) |
| POST | `/api/review` | moderator | Approve a proposal |
| DELETE | `/api/review` | moderator | Reject a proposal |
| POST | `/api/tags` | manager | Create/update a tag definition |
| DELETE | `/api/tags` | admin | Delete a tag definition |
| POST | `/api/lock` | manager | Lock a tenant (prevent modifications) |
| DELETE | `/api/lock` | manager | Unlock a tenant |
| GET | `/api/roles` | admin | List user roles |
| POST | `/api/roles` | admin | Assign/update user role |

**Tag workflow:**
1. User/moderator calls `POST /api/request` (`action:"add"`, default) to propose a tag
   (`direct`, `indirect`, `gdap_actif`).
2. Moderator/admin calls `POST /api/review` to approve → entry written to Classifications table.
3. Manager/admin can apply tags directly (skips the proposal step).
4. `DELETE /api/review` rejects; `DELETE /api/classification` removes an approved tag (moderator+).

**Tag removal-request workflow** (lets a plain `user` ask for a tag to be removed):
1. User calls `POST /api/request` with `action:"remove"` on an already-approved tag → creates a
   pending request (the tag must exist; idempotency/anti-dup enforced server-side).
2. Moderator/admin approves via `POST /api/review` → `removeApprovedTag()` deletes the
   classification (idempotent) and clears the pending removal request(s).
3. Manager/admin calling `POST /api/request action:"remove"` removes the tag directly.
4. `GET /api/classification?tenantId=` returns `pendingRemovals` (per-type) so the UI can mark
   approved badges awaiting removal; pending *add* aggregation excludes removal requests.
5. **24 h cooldown**: once a removal request is *rejected*, any new removal request for the same
   `tenantId`+`type` is blocked for 24 h (`POST /api/request` returns 429). The cooldown is
   tracked from the rejected request's `reviewedAt`; `GET /api/classification?tenantId=` also
   returns `removalCooldowns` (`[{type, until}]`) so the UI disables the removal button.

---

## Hard constraints when editing

### CSP compliance is non-negotiable

CSP is declared via `<meta http-equiv>` in each HTML file with `script-src 'self'` and
`style-src 'self'` (production HTTP headers mirror this in `staticwebapp.config.json`):

- **No inline `<script>`, no inline event handlers (`onclick=...`), no inline `style`
  attributes.** Build DOM with `createElement` + `textContent`; never assign `innerHTML`
  from user/network input. Use `replaceChildren()` to clear nodes.
- **Adding any new external API/origin requires editing the `connect-src` (or `img-src`)
  list in `index.html`'s CSP meta AND in `staticwebapp.config.json`.**
- **`ML/` is `connect-src 'self'` only — it must stay network-free.**
  Do not add external fetch calls to `mhaelle.js`.

### No build step — no bundlers, no transpilation

The frontend has no build pipeline. Keep the code as standard ES2020+ that runs in modern
browsers without transformation. Do not introduce `import`/`export` module syntax (not used
in this codebase) or `require`.

### The browser extension duplicates config — keep both sides in sync

`extension/tp-core.js` is a **copy** of blocks from `tenantpulse.js` (Manifest V3 forbids
remote code, so the extension cannot load `tenantpulse.js` at runtime).

- **Any change to `REDIRECT_BUTTONS`, `ALLOWED_REDIRECT_HOSTS` or `ADMIN_SHORTCUTS` in
  `tenantpulse.js` must be replicated in `extension/tp-core.js`.** The header of that file
  lists every copied block and its source line.
- The extension reads the app's `localStorage` through the `extension/sync.js` content script,
  which mirrors it into `chrome.storage.local`. Renaming `tenantpulse_profile_v1`,
  `tenantIdHistory_v1`, `tenantIdHistory_enabled` or `tenantAdminAccounts_v1` breaks that
  mirror — update `sync.js` in the same commit.
- Extension pages have their own CSP (`script-src 'self'`), so the no-inline rules above apply
  there too. New external origins go in `manifest.json`'s `host_permissions`, not in the meta
  CSP.
- `extension/` is stripped from the SWA deployment by a dedicated step in
  `.github/workflows/azure-static-web-apps.yml` (`app_location` is `/`).
- **Never add `update_url` to the committed `extension/manifest.json`** — it is injected by
  `extension/build.mjs` into the self-hosted variant only, from `local-config.json`, and the
  script refuses to build if the field is already present. Bump `version` in that manifest
  before every release; a version already published is rejected.
- **The app's origin must never be committed.** It is a production domain, which the
  Confidentialité section below forbids. `manifest.json` only targets the generic
  `https://*.azurestaticapps.net/*`; the exact origin lives in the gitignored
  `extension/app-origin.js`, generated by `build.mjs` from the gitignored
  `extension/local-config.json` (which also holds the SAS-bearing hosting URLs). `sync.js`
  guards on `location.origin === TP_APP_ORIGIN` so the wildcard never leaks behaviour to
  another Azure Static Web App.
- **The extension is gated on a server-verified attestation.** `sync.js` calls `GET /api/me`
  same-origin and mirrors `{authenticatedAt, role, blocked}` — never the email. `popup.js`
  refuses to search, and emits no network request, without a fresh (< 7 days) attestation.
  Do not weaken this gate, and do not mirror additional identity fields.
- Distribution is **enterprise policy first** — no store can restrict an extension to one
  organisation, and no web page can install one (`chrome.webstore.install()` was removed in
  Chrome 71). Hidden store listings are a convenience for unmanaged devices only; the
  attestation gate is what actually keeps the extension org-only.
- The app's topbar shows extension status. Detection is the `data-tp-extension` attribute
  `sync.js` sets on `<html>`. The Chrome Web Store listing URL **is committed**, as
  `TP_EXTENSION_STORE_URL` in `tenantpulse.js` — deliberate: the unlisted listing was never
  the access control (the `/api/me` attestation is), so publishing the address costs
  obscurity, not security. `GET /api/me` still overrides it from the `EXTENSION_STORE_URL` /
  `EXTENSION_STORE_URL_EDGE` app settings when they are set, and `safeStoreUrl()` validates
  every candidate against `ALLOWED_STORE_HOSTS`. This is the one documented exception to the
  confidentiality rules below — it covers the store listing only, never the app origin, a
  real domain, or anything SAS-bearing.
- The signing key (`*.pem`) fixes the extension ID and is gitignored — losing it forces a
  reinstall for every user. See `extension/README.md`.

### Backend changes require Azure Table Storage awareness

- Always check lock status (`Locks` table) before applying classification changes.
- Never bypass `getAuthContext()` / `hasRole()` in API handlers.
- The `x-ms-client-principal` header is only present when deployed on Azure SWA; local `func
  start` won't inject it — auth checks fail gracefully (return 401) in that case.

---

## Code conventions

### JavaScript

- **Vanilla JS only**, no framework, no dependencies at the root.
- **Functional + procedural** — not OOP; use plain functions, not classes.
- **French everywhere**: all variable names may be English, but comments, UI strings, error
  messages, and `console.log` output are in French.
- `const` for config constants, `let` for mutable state; `var` is not used.
- Arrow functions for callbacks and short utilities; named `function` declarations for
  top-level features.
- `async/await` for all API calls; `AbortController` pattern for cancellable fetches.
- DOM built exclusively via `document.createElement` + `.textContent`/`.appendChild` —
  never `innerHTML` from external data.
- All event listeners registered in `bindEvents()` or at init time — no inline handlers.
- Feature grouping: helper functions are co-located with the feature they serve, not
  extracted into separate files (monolithic `tenantpulse.js` is intentional).

### HTML

- Semantic elements: `<nav>`, `<aside>`, `<main>`, `<footer>`.
- `data-*` attributes drive component logic (`data-theme`, `data-app-tab`, `data-drop-section`).
- ARIA attributes for accessibility: `role`, `aria-label`, `aria-expanded`, `aria-selected`.
- No inline event handlers; no inline styles.

### CSS

- CSS custom properties for all tokens (`--text`, `--bg`, `--blue`, etc.).
- Fluid typography via `clamp()`.
- Dark mode via `[data-theme="dark"]` selector on `<html>`.
- BEM-style naming for complex component states.
- Layout: Flexbox + CSS Grid; no external CSS framework.

### Azure Functions (backend)

- Each function is a single `index.js` exporting an `async function` handler.
- Auth is always checked first: `getAuthContext()` → `hasRole()` → reject or proceed.
- Table operations use the initialized clients from `api/shared/tableClient.js`.
- Return shape: always `{ status: <number>, body: <JSON string> }`.

---

## Confidentialité — mentions interdites

Le dépôt est public. Les éléments suivants ne doivent **jamais** apparaître dans le code source, les commentaires, les messages de commit, la documentation ou tout autre fichier versionné :

- **Le nom de l'entreprise**, sous toutes ses formes : en clair, abrégé, accolé, avec ou sans tiret, quelle que soit la casse
- Tout nom de client, de tenant ou de domaine réel utilisé en production
- Toute adresse e-mail professionnelle interne
- Toute clé, secret, token ou chaîne de connexion

La liste littérale des termes à bannir vit dans `.claude/mentions-interdites.md`, **hors dépôt** — l'écrire ici reviendrait à publier ce qu'on cherche à taire.

Si une référence à l'entreprise est nécessaire dans la documentation, utiliser le terme générique **"l'organisation"** ou **"l'équipe support"**.

### GUID du tenant Entra — écart connu, non résolu

`staticwebapp.config.json` contient le GUID du tenant Entra en clair dans `auth.identityProviders.azureActiveDirectory.registration.openIdIssuer`. Il identifie l'organisation et tombe donc sous la règle ci-dessus, mais il est **assumé pour l'instant** — ne pas le retirer sans avoir lu ce qui suit.

Pourquoi il est encore là :

- SWA impose une valeur littérale. Contrairement à `clientIdSettingName`, `openIdIssuer` n'accepte aucune référence à un paramètre d'application (Azure/static-web-apps#589). La seule voie propre est une substitution dans `.github/workflows/azure-static-web-apps.yml` depuis un secret repo — **et créer un secret exige le rôle admin sur le dépôt**, que les contributeurs habituels n'ont pas. Une tentative a été faite puis annulée pour cette raison : elle rendait le déploiement impossible.
- Le GUID est de toute façon déjà présent dans l'historique git public. Le sortir du HEAD seul n'apporte qu'un bénéfice partiel.

Deux issues possibles, toutes deux à la main du propriétaire du dépôt :

1. Ajouter le secret `AAD_TENANT_ID`, puis rétablir la substitution au déploiement (avec un garde-fou qui interrompt le job **avant** l'upload si le secret manque, pour ne jamais publier une authentification cassée).
2. Passer l'issuer à `https://login.microsoftonline.com/organizations/v2.0`. Ni secret ni GUID, mais la restriction à l'organisation ne repose alors plus que sur le `signInAudience` de l'app registration Entra — **à ne faire qu'après avoir vérifié qu'elle est bien en « comptes de cet annuaire uniquement »**, sinon tout compte professionnel externe peut se connecter et lire l'annuaire de tags.

---

## Prérequis réseau côté client (note de déploiement)

Sur un poste géré (Intune ou équivalent), le pare-feu d'entreprise laisse souvent passer le
handshake QUIC vers un résolveur DoH puis coupe la session UDP. Le navigateur ayant mis en
cache l'`Alt-Svc: h3` du résolveur, il retente en QUIC à chaque requête au lieu de retomber
en TCP. Symptôme caractéristique : `ERR_QUIC_PROTOCOL_ERROR.QUIC_NETWORK_IDLE_TIMEOUT` en
boucle, l'analyse ressort vide (DMARC/SPF/DKIM), **mais la recherche de Tenant ID fonctionne**
— elle ne tape que `login.microsoftonline.com`, presque toujours en dérogation de proxy.

La cause n'est pas toujours le pare-feu périmétrique : un **agent de sécurité sur le poste**
produit le même effet. Cas observé en production — *Acronis Cyber Protect* avec le filtrage
réseau actif. Ces modules interceptent le HTTPS via un proxy TLS local, or QUIC n'est pas
interceptable ainsi : le produit bloque l'UDP 443 ou abandonne la session en cours.

Le repli sur `dns.google` couvre une partie des cas. Le remède de fond est côté client, et
c'est un **prérequis à documenter pour l'utilisateur**, pas un défaut de l'application.

Deux pannes distinctes se cachent derrière le même symptôme, et elles n'appellent pas la même
correction. Le test qui les sépare : appliquer la policy ci-dessous, filtrage toujours actif.

> **a. QUIC seul est cassé** → Intune → Catalogue de paramètres → Microsoft Edge →
> « Allow QUIC protocol » = **Disabled** (équivalent Chrome : policy `QuicAllowed`). Le
> navigateur repasse en HTTP/2 sur TCP 443, que le proxy d'interception sait traiter.
>
> **b. Ça échoue encore en TCP** → le filtrage bloque les **résolveurs DoH eux-mêmes**.
> C'est délibéré et courant : le DNS-over-HTTPS contourne le filtrage DNS du produit, donc
> les éditeurs le coupent par principe. La policy ne sert alors à rien, et la seule voie est
> une exception dans le filtrage d'URL sur `cloudflare-dns.com` **et** `dns.google` — les
> deux figurent sur les mêmes listes, d'où l'inutilité du repli dans ce cas de figure.

Ne pas traiter ce cas en ajoutant de l'infrastructure côté serveur — voir l'encadré du modèle
réseau plus haut.

## Known issues

- **Version string duplicated and inconsistent**: `index.html` `<title>` says `v0.8.5` but
  the nav badge says `v0.8.1`. Update both when bumping.
- CSP is delivered as `<meta>` tags in the prototype; a production host should also send real
  HTTP response headers (see `staticwebapp.config.json` for the production-side config).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
