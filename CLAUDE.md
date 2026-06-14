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
├── PF/                      # PsForge sub-app (PowerShell command catalog)
│   ├── psforge.html
│   ├── psforge.js
│   ├── psforge-app.js       # 150+ command templates
│   └── psforge.css
└── api/                     # Azure Functions v2.0 (Node.js) — optional backend
    ├── host.json
    ├── shared/
    │   ├── auth.js          # getAuthContext(), hasRole(), role hierarchy
    │   ├── tableClient.js   # Azure Table Storage clients
    │   ├── tagUtils.js      # tag grouping helpers
    │   └── defaults.js      # fallback config
    ├── me/                  # GET /api/me
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
- **PsForge** (`PF/`): PowerShell command catalog. Loaded into `#psforgeFrame` as
  `PF/psforge.html?embedded=1`. Status: `dev`/`Alpha`.

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
- `dns.google/resolve` (DNS-over-HTTPS JSON) → MX/TXT/etc via `dnsQuery`.
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
- PsForge: `psforge_saved_v1`, `psforge_favorites_v1`, `psforge_blocks_v1` (`PF_LS_KEYS`).

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
| `Tags` | Custom tag definitions |
| `Locks` | Per-tenant or global modification locks |

**Role hierarchy** (ascending permissions):
```
user < moderator < manager < admin
```
`hasRole(ctx, 'moderator')` returns true for moderator, manager, and admin.

**API endpoints:**

| Method | Route | Min role | Description |
|---|---|---|---|
| GET | `/api/me` | any auth | `{email, name, role, blocked}` |
| GET | `/api/classification?tenantId=` | any auth | Approved tags + pending count + lock status |
| GET | `/api/classification?all=1` | manager | All assigned tags across tenants |
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
- **Sub-apps (`ML/`, `PF/`) are `connect-src 'self'` only — they must stay network-free.**
  Do not add external fetch calls to `mhaelle.js` or `psforge*.js`.

### No build step — no bundlers, no transpilation

The frontend has no build pipeline. Keep the code as standard ES2020+ that runs in modern
browsers without transformation. Do not introduce `import`/`export` module syntax (not used
in this codebase) or `require`.

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

- **"Be Cloud"** (nom de l'entreprise) — ni en clair, ni abrégé, ni en variante de casse (`be cloud`, `BeCloud`, `BE CLOUD`, etc.)
- Tout nom de client, de tenant ou de domaine réel utilisé en production
- Toute adresse e-mail professionnelle interne
- Toute clé, secret, token ou chaîne de connexion

Si une référence à l'entreprise est nécessaire dans la documentation, utiliser le terme générique **"l'organisation"** ou **"l'équipe support"**.

---

## Known issues

- **Version string duplicated and inconsistent**: `index.html` `<title>` says `v0.8.5` but
  the nav badge says `v0.8.1`. Update both when bumping.
- CSP is delivered as `<meta>` tags in the prototype; a production host should also send real
  HTTP response headers (see `staticwebapp.config.json` for the production-side config).
