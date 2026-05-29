# TenantPulse

Outil interne de diagnostic **Microsoft 365 / Google Workspace** et d'hygiène DNS, pour le
support MW N1. Application **100 % côté client** : aucun backend, aucune dépendance, aucune
donnée transmise à un serveur. Tout le traitement se fait dans le navigateur, qui interroge
directement des APIs publiques (Microsoft, Google DNS, RDAP).

## Fonctionnalités

L'app regroupe trois outils dans une même interface :

| Onglet | Dossier | Rôle | Réseau |
|---|---|---|---|
| **Diagnostic M365** | `/` (racine) | Tenant ID Microsoft, détection Google Workspace, DNS (MX/SPF/DKIM/DMARC), WHOIS/RDAP, hébergeur | APIs publiques externes |
| **En-têtes email** | `ML/` | Analyse d'en-têtes (SPF/DKIM/DMARC/EOP, chaîne SMTP, URLs), import `.eml`, rapports client & technique | 100 % local |
| **Commandes (PsForge)** | `PF/` | Catalogue de commandes PowerShell/CMD support N1, favoris, Script Builder | 100 % local |

Deux profondeurs d'analyse pour le diagnostic M365 :
- **Rapide** : Tenant ID + DNS de base
- **Complète** : ajoute la sécurité DNS (scoring SPF/DKIM/DMARC) et le WHOIS/hébergeur

Historique optionnel des Tenant ID, stocké uniquement dans le `localStorage` du navigateur
(opt-in, purge automatique configurable, jamais transmis).

## Lancer en local

Servir le dossier en HTTP — ne pas ouvrir `index.html` en `file://` (les requêtes DoH/fetch
et la synchro de thème inter-iframes nécessitent une vraie origine) :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Aucune étape de build : ce sont des fichiers statiques (HTML + CSS + JS + images).

## Architecture (résumé)

- `index.html` + `tenantpulse.js` + `tenantpulse.css` : le shell (Diagnostic M365).
- `ML/` et `PF/` : sous-apps chargées en `<iframe ...?embedded=1>` dans le shell. Elles
  partagent `tenantpulse.css` et communiquent avec le shell par `postMessage` (synchro de
  thème `tp-theme`, profil Mhaelle `ml-profile`). Elles fonctionnent aussi en autonome.
- **CSP stricte** (`script-src 'self'`, pas de `unsafe-inline`) : aucun script inline, aucun
  handler `onclick`, aucun `innerHTML` sur entrée — le DOM est construit via
  `createElement`/`textContent`.

Détails complets dans [`CLAUDE.md`](CLAUDE.md).

## Déploiement — Azure Static Web Apps

Le site est conçu pour **Azure Static Web Apps** (souscription dédiée).

- `staticwebapp.config.json` (à la racine) délivre les **en-têtes HTTP de sécurité** en prod :
  CSP réelle (miroir du `<meta>` + `frame-ancestors 'self'`), HSTS, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP.
- Groupe de ressources : `gr-tenantpulse-prod` (West Europe).
- Le déploiement se fait depuis la branche `main` via GitHub Actions (workflow généré par
  Azure lors de la création de la ressource Static Web App).

Paramètres de build Static Web Apps :

| Paramètre | Valeur |
|---|---|
| App location | `/` |
| Api location | _(vide — pas de backend)_ |
| Output location | _(vide — pas de build)_ |
