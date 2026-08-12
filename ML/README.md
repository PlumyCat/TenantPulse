# Diagnostic Messagerie — Analyseur d'en-têtes email (V9 PRO)

Sous-app de **TenantPulse**. Analyse les en-têtes complets d'un message email
(SPF, DKIM, DMARC, EOP/Forefront, chaîne SMTP, URLs) **100 % en local** dans le
navigateur. Aucune donnée n'est transmise à un serveur.

- **Statut** : `dev`
- **Origine réseau** : aucune (`connect-src 'self'`)
- **Dépendances** : aucune (Vanilla JS, ES2020+)

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `messagerie.html` | Shell HTML : sidebar de saisie + zone de résultats. CSP stricte inline. |
| `messagerie.js` | Toute la logique (~1300 lignes) : parsing, scoring, rendu DOM. |
| `messagerie.css` | Surcharges spécifiques par-dessus `../tenantpulse.css`. |

`messagerie.html` charge d'abord `../tenantpulse.css` (layout, nav, tokens) puis
`messagerie.css`. Le `<script>` est dans le `<head>` pour que la détection d'iframe
et la synchro thème s'exécutent avant le rendu du `<body>` (évite le flash navbar/FOUC).

---

## Utilisation

1. Coller les en-têtes complets du message dans la zone de saisie.
   - Outlook : *Fichier → Propriétés → En-têtes Internet*
   - Gmail : *Afficher l'original*
   - Ou bouton **Import .eml** (fichier `.eml` / `.txt`).
2. **Analyser** (ou `Ctrl+Entrée`).
3. Récupérer un **Rapport client** (vulgarisé) ou **Rapport technique** via les boutons de copie.

Boutons annexes : **Effacer**, **Exemple** (jeu de données de démo via `loadSample`),
**Boîte à outils** (liens externes d'analyse) et **Glossaire des en-têtes**.

---

## Ce qui est analysé

Pipeline central dans `analyse()` (`messagerie.js:778`) :

- **Authentification** — `parseAuthResults` extrait SPF / DKIM / DMARC / CompAuth
  depuis `Authentication-Results`. `statusClass` colore pass / fail / neutre.
- **Chaîne SMTP** — `parseReceived` reconstruit les hops `Received` (du bas = origine
  vers le haut = destination), `isPrivateIP` distingue les IP internes.
- **EOP / Forefront** — `parseForefront`, `interpretSCL`, `interpretCAT` décodent les
  scores anti-spam Exchange Online Protection (SCL / CAT / SFV).
- **URLs** — `extractUrls` + `analyseUrls` repèrent raccourcisseurs (`URL_SHORTENERS`),
  punycode (`hasPunycode`), homoglyphes (`hasHomoglyph`) et usurpation de marque
  (`BRAND_KEYWORDS`, `OFFICIAL_DOMAIN_PATTERN`).
- **Signaux de phishing** — usurpation du nom d'affichage (`displayNameDeception`),
  incohérence d'auth (`authResultsConflict`), décalage temporel des hops
  (`temporalDelta`), formules d'urgence (`URGENCY_PATTERNS`).
- **Sujet** — `analyseSubject` décode le MIME encodé (`decodeMime`) et scanne les motifs d'urgence.

Le résultat est rendu en blocs configurables (auth, ms, signals, message, smtp, urls, reports)
via `el()` / `row()` / `makeAxisChip()` / `makeSignalRow()` — DOM construit exclusivement
en `createElement` + `textContent` (jamais `innerHTML` sur entrée utilisateur).

---

## Intégration dans TenantPulse

- **Détection embarqué** : `window.self !== window.top` ou `?embedded=1` → classe
  `.embedded` sur `<html>` pour masquer la navbar.
- **Synchro thème** : lecture directe du `data-theme` du parent (même origine) +
  `MutationObserver`, avec repli sur `postMessage` `{type:'tp-theme'}` (fiable sur `file://`).
  En standalone, suit `prefers-color-scheme`.
- **Layout des blocs** : le shell pousse `{type:'ml-profile', profile}` ; la disposition
  est persistée localement.

## Persistance (localStorage)

Une seule clé : **`messagerie_profile_v1`** — ordre / visibilité des blocs de résultats
(`ML_PROFILE_KEY`, défaut dans `ML_BLOCKS_DEFAULT`). Aucune donnée d'email n'est stockée.

---

## Contraintes d'édition

- **Rester sans réseau** : ne pas ajouter d'appel `fetch` externe — CSP `connect-src 'self'`.
- **Pas d'inline** : aucun `<script>`/`onclick`/`style=` inline ; tous les listeners
  sont enregistrés au `DOMContentLoaded` (`messagerie.js:1279`).
- **Pas de build** : ES2020+ natif, pas de `import`/`export`, pas de framework.
- **Français** : commentaires, libellés UI et messages en français.
