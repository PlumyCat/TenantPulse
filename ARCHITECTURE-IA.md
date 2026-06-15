# Architecture IA — Assistant de support PsForge

> Document de conception. Aucun code n'est encore écrit ; ceci fige les décisions
> prises avant l'implémentation. Toutes les valeurs sensibles (endpoint, clé,
> identifiants d'abonnement, noms de ressources internes) sont volontairement
> remplacées par des placeholders : elles vivent dans les variables
> d'environnement de l'Azure Function, **jamais** dans le dépôt.

---

## 1. Objectif

Doter PsForge d'un **assistant de support technique** qui aide les techniciens à
résoudre des incidents en leur retournant une **procédure CONNUE** (pas une réponse
générée). Le système comprend un ticket en langage naturel, identifie le type
d'incident, extrait les entités techniques, et retrouve la procédure exacte dans la
base existante (`/api/process`).

**Principe directeur : l'IA récupère, elle n'invente pas.** Si aucune procédure ne
correspond précisément, le système le dit clairement — il ne propose jamais une
procédure « approchante » déguisée en bonne réponse.

---

## 2. Vue d'ensemble — deux flux IA

| Flux | Sens | Rôle minimum | Rôle de l'IA |
|---|---|---|---|
| **Diagnostic** | ticket → procédure | tech | comprendre + récupérer |
| **Import** | Word (.docx) → procédure PsForge | tech | convertir + structurer |

L'**import** alimente la base de procédures ; le **diagnostic** la consomme.
Les deux partagent le même modèle de langage (`gpt-4.1-mini`).

```
  Word .docx ──[Import]──▶  Base procédures  ◀──[Diagnostic]── ticket technicien
                            (/api/process :
                             Table + Blob,
                             indexée AI Search)
```

---

## 3. Services Azure

| Couche | Service | Rôle | État |
|---|---|---|---|
| Frontend | Static Web Apps | PsForge, onglet Assistant | existant |
| Auth | Entra ID (SWA) | `x-ms-client-principal` → rôle | existant |
| Backend | Azure Functions (Node) | `/api/diagnose`, `/api/feedback`, `/api/process-import` | à créer |
| LLM | Azure AI Foundry | déploiement `gpt-4.1-mini` | déployé |
| Embeddings | Azure AI Foundry | déploiement `text-embedding-3-large` | déployé |
| Recherche | Azure AI Search | index sur les procédures | à créer |
| Procédures | Blob + Table Storage | source de vérité (`/api/process`) | existant |
| Feedback | Table Storage | table `Feedback` (TTL 7 j) | à créer |

### Choix des modèles (rapport qualité/prix)

- **`gpt-4.1-mini`** pour l'analyse (étape 1) et la réponse (étape 3) : excellent
  suivi de consignes JSON, bon ancrage RAG, multimodal (lecture d'images),
  grande fenêtre de contexte, coût faible. Un modèle plus gros (gpt-4.1 complet,
  o-series) n'apporterait aucun gain visible sur cette tâche cadrée.
- **`text-embedding-3-large`** pour la recherche sémantique : transforme procédures
  et tickets en vecteurs pour retrouver « la bonne procédure » même quand les mots
  diffèrent (« mail » ≈ « messagerie »).

### Variables d'environnement (Function App / `local.settings.json` gitignoré)

```
FOUNDRY_ENDPOINT      = https://<ressource>.services.ai.azure.com/...
FOUNDRY_KEY           = <secret>
FOUNDRY_DEPLOY_CHAT   = gpt-4.1-mini
FOUNDRY_DEPLOY_EMBED  = text-embedding-3-large
SEARCH_ENDPOINT       = https://<service>.search.windows.net
SEARCH_KEY            = <secret>
SEARCH_INDEX          = procedures
```

---

## 4. Flux diagnostic (RAG à ancrage strict)

Trois étapes côté `POST /api/diagnose` :

1. **Analyse** — appel LLM n°1 : extraction d'un JSON (catégorie + entités).
   Le texte du ticket n'est **jamais** écrit sur disque.
2. **Recherche** — Azure AI Search interrogé avec les mots-clés/entités → top
   procédures + score. Si `score < seuil` (≈ 0,5), aucune procédure n'est transmise.
3. **Réponse** — appel LLM n°2 : on fournit au modèle **uniquement** les procédures
   récupérées + le JSON ; il rédige la réponse cadrée, ou déclare « aucune ».

### Contrat API

**`POST /api/diagnose`** — rôle minimum `tech`

Requête :
```json
{ "ticket": "<texte libre du ticket>" }
```

Réponse :
```json
{
  "analysis": {
    "categorie": "VPN",
    "sousCategorie": "connexion",
    "entites": {
      "utilisateur": "utilisateur1",
      "ip": ["10.20.3.14"], "email": [], "domaine": [],
      "serveur": [], "identifiantTechnique": ["erreur 809"]
    },
    "motsCles": ["vpn", "809", "connexion"]
  },
  "resultat": {
    "statut": "trouve",
    "procedureId": "<uuid|null>",
    "titre": "Résolution VPN — erreur 809",
    "confiance": 0.86,
    "resume": "Échec d'établissement du tunnel VPN (erreur 809).",
    "etapes": ["...", "..."],
    "alternatives": [{ "procedureId": "...", "titre": "VPN — MTU", "confiance": 0.41 }],
    "informationsManquantes": ["Type de client VPN non précisé"]
  },
  "diagnosticId": "tmp-7e21"
}
```

`statut` ∈ `trouve` | `aucune` | `ambigu`. Quand `aucune`, `procedureId` vaut
`null` et `resume` explique pourquoi.

**`POST /api/feedback`** — rôle minimum `tech`
```json
{ "diagnosticId": "tmp-7e21", "procedureId": "<uuid>", "verdict": "ok|mauvais" }
```
Écrit dans la table `Feedback` avec `expiresAt = now + 7 j`.

### Prompts

**Prompt 1 — analyse** (system) : moteur d'extraction, NE résout PAS l'incident,
renvoie UNIQUEMENT le JSON du schéma `entites`, pseudonymise les personnes en
`utilisateur1/2…`, n'invente aucune entité absente, `"Autre"` si catégorie incertaine.
Réglages : `temperature: 0`, `response_format: json_object`.

**Prompt 2 — réponse cadrée** (system) : répond EXCLUSIVEMENT à partir des procédures
fournies, n'invente jamais d'étapes, renvoie `statut:"aucune"` + ce qui manque si rien
ne correspond précisément. Sortie JSON `{statut, procedureId, resume, etapes,
confiance, alternatives, informationsManquantes}`. User : le JSON analysé + les
procédures candidates (id, titre, score, contenu markdown).

La règle « exacte sinon le dire » est portée à la fois par le prompt **et** par le
code (seuil de score côté backend).

---

## 5. Flux import (Word → procédure PsForge)

**`POST /api/process-import`** — rôle minimum `tech`

1. **Upload** — le `.docx` est déposé depuis PsForge (même origine, conforme CSP).
2. **Extraction** — le backend lit le Word avec `mammoth` (dépendance ajoutée dans
   `api/`, autorisé car backend) → texte + liste d'images.
3. **Images** — chaque image va dans le Blob, servie via `/api/process-image`
   (img-src 'self'). Les liens du markdown sont réécrits vers ces URLs.
4. **Mise en forme** — `gpt-4.1-mini` reformate le texte brut dans le template
   PsForge (titre, catégorie, description courte, étapes, blocs de code). Option :
   pass multimodal sur les captures pour OCR / texte alternatif → contenu cherchable.
5. **Brouillon** — résultat renvoyé comme brouillon éditable. Le tech relit, corrige,
   puis enregistre via `POST /api/process` existant.
6. **Indexation** — une fois enregistrée, la procédure est indexée par Azure AI Search
   et devient trouvable par le flux diagnostic.

Humain dans la boucle : la conversion n'est jamais enregistrée automatiquement.

---

## 6. Frontend — onglet « Assistant »

PsForge fonctionne avec des vues empilées (`<div hidden>`) + boutons-onglets
(`pfScriptToggle`/`pfProcToggle`/`pfManagerToggle`) qui affichent une vue et masquent
les autres (pattern `showProcessView()`).

**Ajouts :**
- Bouton-onglet `pfAssistToggle` dans la barre du haut.
- Vue `pfAssistView` : zone de saisie (« Décrivez l'incident » + bouton Analyser)
  + zone résultat.
- Contrôleur dédié `psforge-assist.js` (isolé, comme `psforge-process.js`).

**Onglet par défaut :** mettre `hidden` sur `pfCmdView`, retirer `hidden` de
`pfAssistView`, et appeler `showAssistView()` à l'init.

**Découpage JS :**
```
bindAssist()        branche Analyser + feedback
runDiagnostic()     lit le texte → état chargement → POST /api/diagnose → render…
renderTrouve(res)   réutilise le rendu de psforge-process.js
renderAucune(res)   état "aucune procédure exacte"
renderErreur()      état erreur réseau
fillLeftColumn(ent) injecte les entités via injectIntoActive()
sendFeedback(v)     POST /api/feedback
setState(s)         repos | chargement | trouvé | aucune | erreur
```

**Cinq états d'affichage :** repos · chargement · trouvé · aucune · erreur.
L'état « aucune » est un affichage à part entière (contrainte « exacte sinon le dire »).

**Réutilisation :** rendu de procédure (`appendScriptBlock`, jetons `<param>`),
colonne gauche (`pfMakeParamTag`, `injectIntoActive`), rôle (`loadProcRole`/`procRole`),
helper `apiFetch()`.

---

## 7. Rôles & sécurité

Hiérarchie existante : `user < tech < moderator < manager < admin`.

| Action | Rôle minimum |
|---|---|
| Diagnostic (`/api/diagnose`) | tech |
| Feedback (`/api/feedback`) | tech |
| Import Word (`/api/process-import`) | tech (donc tech, moderator, manager, admin) |
| Correction de procédure après feedback | moderator |

Toujours `getAuthContext()` → `hasRole()` en tête de handler ; jamais de bypass.
Le navigateur (PsForge) n'appelle **que** `/api/…` (même origine) — il ne parle
jamais à Foundry ni à AI Search directement. Les clés restent côté Function.

---

## 8. Conformité

- **Pseudonymisation** : personnes → `utilisateur1/2…` dans le JSON analysé, les logs
  et les feedbacks. La vraie valeur peut s'afficher au technicien (volatile, en
  mémoire navigateur) pour remplir la colonne gauche.
- **Aucune conservation du ticket** : le texte n'est jamais passé à une opération
  d'écriture (`upload`/`upsert`).
- **Logs minimaux** : `context.log` ne reçoit que `diagnosticId` + `categorie` +
  `statut` — jamais le texte ni les entités brutes.
- **Feedback ≤ 7 jours** : purge quotidienne (Function timer) des entrées expirées.
- **Pas de réentraînement** : le modèle Foundry ne bouge jamais. On améliore l'index
  et des règles de correspondance, pas les poids.

---

## 9. Amélioration continue

- **Index sémantique** : un *indexer* Azure Search branché sur le Blob des procédures
  se rafraîchit automatiquement à chaque écriture via `/api/process`. Vectorisation
  via `text-embedding-3-large`.
- **Boucle de feedback** : ✅/❌ du technicien → table `Feedback` → un modérateur
  corrige (édite la procédure ou crée une règle « incident X → procédure Y » dans une
  éventuelle table `Mappings` consultée avant la recherche).
- **Montée en charge** : Functions SWA scalent automatiquement ; surveiller le quota
  tokens/minute du déploiement Foundry.
- **Coût** : 2 appels `gpt-4.1-mini` + 1 requête Search par diagnostic ; embeddings
  quasi gratuits ; AI Search tier Free pour prototyper (puis Basic si « semantic
  ranker » souhaité).

---

## 10. Ordre d'implémentation recommandé

1. Créer la ressource **Azure AI Search** + index sur le Blob des procédures.
2. `POST /api/diagnose` en mode étapes 2+3 (recherche + réponse) avec un ticket déjà
   propre → valider le RAG ancré.
3. Ajouter l'étape 1 (extraction / pseudonymisation).
4. Frontend : onglet **Assistant** par défaut → saisie → appel → injection colonne
   gauche → feedback.
5. Purge feedback 7 j (Function timer).
6. Flux **import Word** (`mammoth` + reformatage LLM + brouillon).
