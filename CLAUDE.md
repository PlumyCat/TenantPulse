# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TenantPulse is a **100% client-side static web app** (no backend, no build step, no
dependencies, no package manager). It does Microsoft 365 / Google Workspace tenant
diagnostics and DNS hygiene checks by calling public APIs **directly from the browser**.
All UI and code comments are in **French**. Internal prototype ("RUNMW N1").

There is no `package.json`, no test suite, no linter, and no CI. The repo is just HTML +
CSS + JS + image assets.

## Running locally

Serve the folder over HTTP — do **not** just open `index.html` from `file://` (DoH/fetch
and iframe same-origin theme sync need a real origin):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

`file://` partially works because the sub-apps fall back to `postMessage` for theme sync,
but network calls and direct cross-frame DOM access will be unreliable. Always test over
http(s).

## Architecture

### Three apps in one shell, wired by iframes + postMessage
- **TenantPulse** (root): `index.html` + `tenantpulse.js` + `tenantpulse.css` — the M365/DNS
  diagnostic tool. This is the shell.
- **En-têtes email / "Mhaelle"** (`ML/`): email-header analyzer. Loaded into `#mhaelleFrame`
  as `ML/mhaelle.html?embedded=1`. Marked `dev`.
- **Commandes / "PsForge"** (`PF/`): PowerShell command catalog. Loaded into `#psforgeFrame`
  as `PF/psforge.html?embedded=1`. Marked `dev`/`Alpha`.

Tab switching (`switchAppTab` in `tenantpulse.js`) lazily sets the iframe `src` on first
open. The shell talks to the frames via `postMessage`:
- `{type:'tp-theme', theme}` → push light/dark theme into frames.
- `{type:'ml-profile', profile}` → push Mhaelle block layout into the ML frame.

The sub-apps detect embedding (`window.self !== window.top` or `?embedded=1`) to hide their
own navbar, and sync theme two ways: direct parent-DOM read when same-origin, `postMessage`
fallback otherwise (see `PF/psforge.js`). **Sub-apps share the root `tenantpulse.css`**
(`../tenantpulse.css`) plus their own override sheet (`mhaelle.css`, `psforge.css`).

### Network model — all direct browser → public API, no proxy, no server
`tenantpulse.js` fetch helpers: `fetchWithAbort`/`fetchJsonC`/`fetchTextC` (per-step
`AbortController` stored in `stepControllers`, supports cancel + retry via `stepRetryFns`)
and a simpler `fetchJson`. External endpoints used:
- `login.microsoftonline.com/<domain>/.well-known/openid-configuration` → tenant ID;
  `validateTenantGuid` re-queries with the GUID and rejects generic MSA tenants
  (`MS_GENERIC_GUIDS`).
- `dns.google/resolve` (DNS-over-HTTPS JSON) → MX/TXT/etc via `dnsQuery`.
- `accounts.google.com` → Google Workspace detection.
- `rdap.org` + many registry RDAP servers → WHOIS / hoster detection (`detectHostFromNS`).
- `google.com/s2/favicons` → service icons.

### Two analysis depths
- `checkFast()` — tenant ID + basic DNS (steps: ms, google, dns).
- `checkFull()` / `runFullFromState()` — adds DNS security/health (`checkHealth`, DMARC/SPF/
  DKIM scoring) and WHOIS/hoster (`checkHost`).
Confidence score for the tenant result comes from `computeConfidence(ms)` (weighted on
tenantId / validated GUID / issuer / token endpoint). Personal MSA domains
(`MSA_DOMAINS`) are short-circuited and never queried against the tenant endpoint.

### Persistence — localStorage only, nothing leaves the browser
Opt-in by design. Keys:
- History: `tenantIdHistory_v1`, plus `tenantIdHistory_enabled`, `tenantIdHistory_max`,
  `tenantIdHistory_retentionMs`. Retention uses the discrete `RETENTION_STEPS` ladder;
  `pruneExpiredHistory` runs on open, on each save, and on retention change (never while the
  app is closed).
- Profiles: `tenantpulse_profile_v1` (TP), `mhaelle_profile_v1` (ML).
- PsForge: `psforge_saved_v1`, `psforge_favorites_v1`, `psforge_blocks_v1` (`PF_LS_KEYS`).
The "Inspecter les données stockées" modal (`showStoragePanel`) enumerates and lets the user
clear localStorage.

## Hard constraints when editing

**CSP compliance is non-negotiable.** CSP is declared via `<meta http-equiv>` in each HTML
file with `script-src 'self'` and `style-src 'self'`. Therefore:
- **No inline `<script>`, no inline event handlers (`onclick=...`), no inline `style`
  attributes** that would need `unsafe-inline`. Build DOM with `createElement` +
  `textContent`; never assign `innerHTML` from user/network input (`replaceChildren()` is
  used to clear nodes).
- **Adding any new external API/origin requires editing the `connect-src` (or `img-src`)
  list in `index.html`'s CSP meta.** The sub-apps (`ML/`, `PF/`) are `connect-src 'self'`
  only — they must stay network-free; do not add external calls there.

## Known issues to be aware of

- **Version string is duplicated and currently inconsistent**: `index.html` `<title>` says
  `v0.8.5` but the nav badge (`index.html:216`) says `v0.8.1`. Update both when bumping.
- CSP is delivered as `<meta>` tags, not HTTP headers — fine for the prototype, but a
  production host should also send real response headers (see deployment notes if/when added).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
