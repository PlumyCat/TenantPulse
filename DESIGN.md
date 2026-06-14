# TenantPulse — Design de l'interface

> Référence visuelle du shell TenantPulse (`index.html` + `tenantpulse.css`).
> Tout le langage visuel repose sur le **glassmorphisme** : surfaces translucides,
> `backdrop-filter`, reflets internes et bordures dégradées masquées.

---

## 1. Structure générale

Single-page app à 3 colonnes, encadrée par une topbar noire et une nav violette.

```
┌─────────────────────────────────────────────────────────┐
│  TOPBAR  #121212 — Report Bug | tagline | Admin | Déco  │
├─────────────────────────────────────────────────────────┤
│  NAV  #4B3FBE                                            │
│  [TP] [Diagnostic M365] [Mhaelle dev] [PsForge Alpha]   │
│            [cache] [v1.5] [Profils ▾] [Paramètres ▾]    │
├──────────────┬──────────────────────┬───────────────────┤
│  SIDEBAR     │  CENTRE (Résultats)  │  PANNEAU DÉTAIL   │
│  300 px      │  flex:1, scrollable  │  380 px coulissant│
├──────────────┴──────────────────────┴───────────────────┤
│  FOOTER — rôle utilisateur · Prototype Interne RUNMW N1 │
└─────────────────────────────────────────────────────────┘
```

- **Mhaelle** (`ML/`) et **PsForge** (`PF/`) sont des iframes lazy-loaded qui
  remplacent `.app` au changement d'onglet (`body.view-ml` / `body.view-pf`).
  Elles partagent `../tenantpulse.css` et reçoivent le thème par `postMessage`.

---

## 2. Le système Glass — 3 intensités

| Niveau | Recette | Composants |
|---|---|---|
| **Pill nav** | `blur(10px) saturate(160%)` + dégradé blanc `.22 → .08` | `.nav-drop-btn` (Profils, Paramètres), `.btn-go` (violet `.95`), `.btn-full-analysis` (noir `.85`) |
| **Tuile hero** | `blur(10px) saturate(140%)` + dégradé blanc `.1 → .03` | `.hero-partner-btn` (9 tuiles admin), `.hero-tag-add`, `.hero-btn-chevron` (`blur(6px)`) |
| **Menu frosted** | `blur(40px) saturate(200%)` + fond translucide `.5` | `.drop-menu`, `.hero-shortcut-menu`, `.hero-tag-menu`, `.profiles-modal`, `.admin-modal` |

### La signature récurrente de chaque surface verre

```css
/* 1. Fond dégradé translucide */
background: linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,.08));

/* 2. Flou de l'arrière-plan */
backdrop-filter: blur(10px) saturate(160%);

/* 3. Triple ombre : anneau lumineux + reflet interne haut + profondeur */
box-shadow: 0 0 0 1px rgba(255,255,255,.2),
            0 1px 0 rgba(255,255,255,.12) inset,
            0 2px 6px rgba(0,0,0,.1);

/* 4. Bordure dégradée via ::before + mask XOR —
      brillante en haut, fondue en bas (réfraction du verre) */
.glass::before{
  content:''; position:absolute; inset:0; border-radius:inherit; padding:1px;
  background:linear-gradient(180deg, rgba(255,255,255,.25), transparent);
  -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite:xor; mask-composite:exclude;
}
```

Le point 4 est la technique la plus distinctive du projet : la bordure n'est
**pas** un `border` CSS mais un pseudo-élément dégradé masqué. Présent sur
`.nav-drop-btn`, `.btn-go`, `.btn-full-analysis`, `.hero-partner-btn`.

---

## 3. Le hero « Aurora » (`.tenant-hero`)

Pièce maîtresse de la colonne Résultats. Ce n'est **pas** un dégradé violet :

- Base sombre `#1F1C26`
- **7 radial-gradients superposés** : jaune/orange bas-gauche
  (`rgba(255,180,55,.7)`), orange/rouge haut (`rgba(230,75,45,.72)`),
  bleu/indigo droite (`rgba(95,100,200,.7)`), bleu clair centre (profondeur)
- `::before` — voile vitreux (clair en haut, sombre en bas)
- `::after` — logo Microsoft en filigrane blanc, opacité `.1`, haut-droite
- `border-radius: var(--r-xl)` (16 px), ombre portée profonde + liseré
  `inset 0 1px 0 rgba(255,255,255,.08)`

Ce fond riche est ce qui fait fonctionner le glassmorphisme : le
`backdrop-filter` des tuiles admin floute l'aurora derrière elles.

### Contenu du hero

1. **Label** "Tenant ID détecté" (uppercase, letter-spacing .16em)
2. **GUID** en `JetBrains Mono` + pill verre **Copier** (`.hero-copy-btn`,
   devient verte à l'état `copied`)
3. **Badge de confiance** (`.confidence-badge`) — pill verre teintée :
   `.high` vert / `.medium` ambre / `.low` rouge, avec bouton « i » (tooltip détail)
4. **Badges de classification** (Direct / Indirect / GDAP actif / custom)
   + bouton `+` (`.hero-tag-add`, croix en pseudo-éléments) → menu frosted
   de proposition de tag
5. **Grille des 9 tuiles admin** (`auto-fill minmax(110px,1fr)`) :
   Partner Center · Entra ID · M365 Admin · Exchange · Intune · Teams ·
   SharePoint · Azure · Defender

### États des tuiles admin

| État | Style |
|---|---|
| Normale | verre blanc, hover = `translateY(-1px)` + anneau renforcé |
| `.recommended` | teinte verte `rgba(146,195,83,…)` + ruban `#107C10` flottant (avec « i ») |
| `.disabled` | `opacity:.45` (ex. SharePoint sans tenant détecté) — le **chevron reste actif** |

Chaque tuile porte un **chevron** `▾` (micro-pill verre 40×11 px en bas) qui
ouvre le menu de raccourcis du centre d'administration (`ADMIN_SHORTCUTS`) :
« Accueil » en entrée primaire, puis les pages profondes (Utilisateurs,
Accès conditionnel, etc.). Un raccourci dont un jeton (`{tenantId}`,
`{domain}`, `{spTenant}`) manque est rendu désactivé.

---

## 4. Menus frosted (famille `blur(40px)`)

Tous calqués sur `.drop-menu` :

- **Sombre** (défaut) : `rgba(46,44,42,.5) → rgba(34,32,30,.5)`, texte forcé blanc
- **Clair** : `rgba(255,255,255,.55)`, overrides `[data-theme="light"]`
- **Section ouverte** (`.drop-section-btn.open`) : dégradé violet opaque à 85 % —
  seul élément saturé du menu, sert de repère visuel
- **Animation** `menuIn` : `scale(.82) translateY(-8px) → 1`,
  `cubic-bezier(.16,1,.3,1)` (zoom depuis le déclencheur),
  fermeture `menuOut`, respect de `prefers-reduced-motion`

Membres : dropdown Paramètres & Confidentialité, menus raccourcis des tuiles,
menu de tags, modal Profils (560 px, 3 onglets TP/ML/PF), modal Administration
(plein écran, overlay `rgba(0,0,0,.58)` + `blur(8px)`).

---

## 5. Colonne gauche — Sidebar (300 px, fond `--surface`)

1. Titre « Diagnostic **Microsoft 365** » + bouton ⓘ (guide 10 étapes)
2. Champ domaine/email (focus = halo violet `0 0 0 4px rgba(75,63,190,.18)`)
3. **Tenant ID** (glass violet) / **Analyse** (glass noir) + hints
4. **Copier le rapport** (bouton bordé plat)
5. Étapes de progression (`.p-step`) : Microsoft 365 → Google Workspace →
   DNS → Sécurité → Autres services → Hébergeur ; chaque étape a
   Annuler / Relancer (AbortController par étape)
6. Collapsibles **Historique des Tenant ID** (localStorage opt-in) et
   **Confidentialité** (liste des APIs, endpoint prévisualisé)

## 6. Colonne centrale — sous le hero

- **Carte Sécurité DNS** (fond `--surface`, plate) : anneau de score SVG
  (`stroke-dashoffset` animé `.9s`) + lignes SPF / DKIM / DMARC / DNSSEC /
  MTA-STS / BIMI avec dot + badge d'état (vert/ambre/rouge)
- **Carte DNS** : enregistrements MX / TXT / NS, type en chip violet

## 7. Colonne droite — Panneau détail (380 px)

Coulissant (`width 0 → 380px`, transition `.28s`). Sections : Identité
(Tenant ID, domaine, plateforme), Hébergement (registrar, NS, dates RDAP),
Services détectés (chips).

---

## 8. Tokens & thèmes

| Token | Clair | Sombre |
|---|---|---|
| `--bg` | `#f4f5f9` | `#383630` |
| `--surface` | `#ffffff` | `#2e2c2a` |
| `--text` | `#1a1a2e` | `#f0ede8` |
| `--blue` | `#4B3FBE` | inchangé (accents `#8b80f8` / `#a5b4fc`) |
| `--border` | `#e5e7eb` | `#4a4845` |

- Rayons (base) : `--r-xs` 4 px → `--r-sm` 6 → `--r-md` 8 → `--r-lg` 12 →
  `--r-xl` 16 → `--r-pill` 999 px. **Relevés par la Modernisation 2026** (voir §10)
  à `--r-sm` 7 / `--r-md` 10 / `--r-lg` 14 / `--r-xl` 18 → valeurs effectives.
- Typo fluide via `clamp()` (`--text-xs` → `--text-xl`), police Inter ;
  GUID et URLs en mono (JetBrains Mono / Courier)
- Sombre : `[data-theme="dark"]` sur `<html>` + fallback
  `@media (prefers-color-scheme: dark)` (source unique, non recopié dans ML/PF)
- Icônes PNG adaptatives : `.icon-adaptive` (invert en sombre),
  `.icon-adaptive-inv` (invert en clair), `.icon-plain` (jamais)

> Note : le hero Aurora, la topbar et la nav restent **toujours sombres/saturés**
> dans les deux thèmes — seuls les fonds, cartes et menus basculent.

---

## 9. Invariants à respecter

- **CSP `style-src 'self'`** : aucun style inline — tout passe par les classes
- DOM construit en `createElement` + `textContent` (jamais `innerHTML`)
- Toute nouvelle surface flottante doit reprendre la recette frosted
  (`blur(40px) saturate(200%)` + variantes clair/sombre + `menuIn`/`menuOut`
  + `prefers-reduced-motion`)
- Tout nouveau bouton sur fond violet/aurora doit reprendre la signature
  4 couches (fond dégradé, blur, triple ombre, bordure masquée `::before`)

---

## 10. Modernisation 2026

Affinage **purement visuel** (aucune logique modifiée), regroupé dans un **bloc
isolé** en fin de `tenantpulse.css` (`/* MODERNISATION 2026 */`) → retirable d'un
seul tenant. Un bloc miroir existe en fin de `ML/mhaelle.css` pour l'alignement des
boutons de la sous-app.

### Tokens ajoutés
- **Easing** : `--ease-spring: cubic-bezier(.16,1,.3,1)`, `--ease-out: cubic-bezier(.22,1,.36,1)`.
- **Élévation multi-couches** : `--shadow-sm` / `--shadow-md` / `--shadow-lg`
  (versions claires douces + versions sombres plus profondes via `[data-theme="dark"]`
  et le fallback `@media (prefers-color-scheme:dark)`).
- **Anneau d'accent** : `--ring-accent` (liseré violet pour le survol des cartes).

### Rondeur & air
- Échelle `--r-*` relevée (cf. §8) → tout le shell **et** les sous-apps ML/PF
  deviennent plus ronds d'un seul levier (nav, onglets, input, boutons, étapes,
  collapsibles, dropdowns, modales).
- `.result-card` → `--r-xl` (18) ; `.tenant-hero` → 20 px ; `.card-icon-wrap` → `--r-lg`.
- Plus d'air : `.center{gap:18px}`, `.card-row` padding 15/17, `.p-step` un poil plus aéré.

### Accents & élévation
- `.result-card` : ombre `--shadow-sm`, **survol** = `--shadow-md` + `--ring-accent`
  + tinte `--acc-hover` + lift `translateY(-2px)`.
- `.card-badge` : voile dégradé blanc (hue sémantique préservée) + poids 600.
- `.score-ring` : léger `drop-shadow` pour le relief ; `.hero-guid` 1.24 rem, titres resserrés.

### Bloc de recherche & boutons
- **Champ de recherche** (`.input-wrap input`) : capsule `--r-pill`, fine (padding `6px 16px`).
- **Boutons de recherche** (`.btn-go`, `.btn-full-analysis`) : padding vertical 11→8 px
  pour s'aligner sur la finesse de la barre. `.btn-go` étant partagé, le bouton
  « Analyser » de **Mhaelle** hérite automatiquement de cette finesse.
- **Mhaelle** (`ML/mhaelle.css`) : `.btn-sec` / `.ml-sec` amincis (padding vertical 8→6 px).

### Motion
- `@keyframes tpRise` (fade + translateY 8→0) en `backwards` sur `.tenant-hero`,
  `.result-card`, `.empty-state` (le `backwards` évite de bloquer le `translate` du
  hover une fois l'anim terminée).
- Garde `@media (prefers-reduced-motion:reduce)` : coupe animations + lift de survol.
