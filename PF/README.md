# PsForge — Catalogue de commandes PowerShell IT MW

Sous-app de **TenantPulse**. Catalogue et générateur de commandes PowerShell /
shell pour l'administration IT (Windows, Microsoft 365 / Azure AD). Compose des
commandes à partir de templates, les assemble en scripts, et permet de gérer ses
propres commandes — **100 % en local**, aucune donnée transmise à un serveur.

- **Statut** : `Alpha` / `dev`
- **Origine réseau** : aucune (`connect-src 'self'`)
- **Dépendances** : aucune (Vanilla JS, ES2020+)

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `psforge.html` | Shell HTML : sidebar de blocs + 3 vues (commandes / Script Builder / Gestionnaire) + modales. |
| `psforge.js` | IIFE légère : détection iframe + synchro thème (s'exécute depuis le `<head>`). |
| `psforge-app.js` | Logique applicative (~4050 lignes) — encapsulée dans une IIFE `'use strict'`. |
| `psforge.css` | Surcharges spécifiques par-dessus `../tenantpulse.css`. |
| `commandes-psforge.txt` | Notes / référence de commandes (hors runtime). |

`psforge.html` charge `psforge.js` dans le `<head>` (synchro thème avant rendu) et
`psforge-app.js` en fin de `<body>`.

---

## Catalogue de commandes (`PF_COMMANDS`)

Source de vérité : `psforge-app.js:14`. Chaque entrée est `{ s, g, cmd }` :
`s` = section, `g` = groupe, `cmd` = template. Les paramètres se notent `<placeholder>`
(ex. `<upn>`, `<host>`, `<date>`) et deviennent des « chips » éditables.

Deux sections natives :
- **Système Windows** — Intégrité système (sfc/DISM), Réseau (ipconfig, netsh, Test-NetConnection…),
  Services & Processus, Nettoyage & Espace disque, Sécurité locale (gpupdate, whoami…), Windows Update.
- **Microsoft 365 / Azure AD** — Utilisateur (Get-MgUser…), Exchange Online (Connect-ExchangeOnline,
  Get-MailboxStatistics, Get-MessageTrace…), MFA / Sécurité, Licences.

`BUILTIN_GROUPS` (`psforge-app.js:118`) décrit les groupes natifs par section.

---

## Les trois vues

### 1. Vue commandes (`#pfCmdView`)
Liste filtrable (`renderCommandList`) → sélection d'un template → zone de build éditable
(`#pfCmdBuilt`, `renderBuiltCommand`). Les `<placeholder>` deviennent des chips
(`makeParamTag`, `renderParamChips`, `autoConvertParams`). Boutons **Sauvegarder** /
**Copier** / **Effacer** + barre **Description**.

### 2. Script Builder (`#pfScriptView`)
Éditeur multi-lignes (`#pfScriptEditor`) avec gouttière de numéros de ligne, coloration
(`renderHighlighted`), insertion de paramètres (`renderScriptChips`), recherche dépliante
de commandes (`renderScriptSearchDropdown`) et un widget **Rechercher / Remplacer** complet
(`initScriptTools`) : casse, mot entier, regex, navigation, remplacer / tout remplacer.

### 3. Gestionnaire de commandes (`#pfManagerView`)
CRUD des commandes personnelles (`showManagerForm` / `submitManagerForm` /
`renderManagerList`) : commandes maison, favoris, surcharges de commandes natives,
groupes personnalisés. Inclut **Import / Export** de paquets `.json` (voir ci-dessous).

La sidebar gère des **blocs** réordonnables par glisser-déposer (`renderSidebar`,
`initDragDrop`, `DEFAULT_BLOCKS`), avec ajout / réinitialisation de blocs.

---

## Import / Export de paquets

`showManagerView` → boutons **Importer** / **Exporter**. Sérialise une sélection de
commandes vers un fichier `.json` ou un code texte `PSFORGE1:…`
(`buildPackageFromExportSelection`, `renderExportTree`, `renderImportTree`).

Garde-fous de sécurité (`psforge-app.js:1474`) :
- Taille max 1 Mo (`IO_MAX_BYTES`), 500 éléments/type, limites par champ.
- Clés interdites (`IO_FORBIDDEN_KEYS` : `__proto__`, `constructor`, `prototype`) → anti prototype-pollution.
- Marquage **⚠ à vérifier** des motifs à risque ; avertissement explicite : vérifier
  chaque commande importée avant exécution, ne jamais partager d'identifiants réels.

---

## Persistance (localStorage)

Tout est local et opt-in. Clés (`psforge-app.js:109`+) :

| Clé | Contenu |
|---|---|
| `psforge_saved_v1` | Commandes / scripts sauvegardés |
| `psforge_favorites_v1` | Favoris |
| `psforge_blocks_v1` | Configuration des blocs de la sidebar |
| `psforge_custom_cmds_v1` | Commandes personnelles (gestionnaire) |
| `psforge_overrides_v1` | Surcharges de commandes natives |
| `psforge_custom_groups_v1` | Groupes personnalisés |
| `psforge_group_overrides_v1` | Renommage de groupes natifs |

---

## Intégration dans TenantPulse

- **Détection embarqué** : `window.self !== window.top` ou `?embedded=1` → classe `.embedded`.
- **Synchro thème** : lecture directe du `data-theme` parent + `MutationObserver` +
  **polling de secours 200 ms** (Edge ne déclenche pas toujours l'observer cross-frame en
  `file://`), avec repli `postMessage` `{type:'tp-theme'}`. Standalone : `prefers-color-scheme`.

---

## Contraintes d'édition

- **Rester sans réseau** : ne pas ajouter d'appel `fetch` externe — CSP `connect-src 'self'`.
- **Pas d'inline** : aucun `<script>`/`onclick`/`style=` inline ; DOM via `createElement` +
  `textContent`, jamais `innerHTML` sur entrée utilisateur ou contenu importé.
- **Pas de build** : ES2020+ natif, pas de `import`/`export`, pas de framework. Toute la
  logique vit dans une IIFE dans `psforge-app.js`.
- **Français** : commentaires, libellés UI et messages en français.
- **Sécurité I/O** : conserver les garde-fous d'import (taille, clés interdites, marquage des risques).
