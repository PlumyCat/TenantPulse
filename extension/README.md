# Extension navigateur TenantPulse

Extension Chromium (Manifest V3) qui met la recherche de Tenant ID et les raccourcis vers les
centres d'administration Microsoft à un clic, en réutilisant le profil déjà configuré dans
l'application TenantPulse.

- **Périmètre** : recherche par domaine, adresse e-mail ou Tenant ID → GUID validé + tuiles de
  redirection + sous-menus de raccourcis.
- **Hors périmètre** : DNS, santé du domaine (DMARC/SPF/DKIM), WHOIS/RDAP, hébergeur, tags.
  Le lien de pied de page renvoie vers l'app pour l'analyse approfondie.
- **Réservée à l'organisation** : l'extension est inerte sans attestation d'appartenance, et
  n'est distribuée que par politique d'entreprise.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `manifest.json` | Manifest V3 — permissions, popup, script de contenu |
| `popup.html` / `popup.css` | Interface (420 px de large) |
| `popup.js` | Recherche, rendu des tuiles et des raccourcis, verrou d'appartenance |
| `tp-core.js` | Config et helpers **copiés** de `../tenantpulse.js` |
| `tp-net.js` | Résolution du Tenant ID — les seuls appels réseau, portés par le service worker |
| `tp-client.js` | Plomberie commune popup / scripts de contenu : verrou d'appartenance, pont vers le worker |
| `background.js` | Service worker : routeur des résolutions, enregistrement des scripts Dynamics, icône |
| `sync.js` | Script de contenu : miroir du profil + attestation d'appartenance |
| `d365/ctx-main.js` | Monde `MAIN` : lit l'enregistrement affiché via les API client de Dynamics |
| `d365/ctx.js` | Monde isolé : domaine du client (Dataverse) puis Tenant ID |
| `d365/panel.js` / `panel.css` | Le panneau : Shadow DOM, ancrage sur la section, repli |
| `assets/` | Sous-ensemble des icônes de `../assets` |
| `build.mjs` | Génère les paquets de distribution |
| `local-config.example.json` | Modèle de la configuration locale à créer |
| `STORE.md` | Textes de publication en magasin — **voie non retenue**, conservés en repli |

Deux fichiers sont **générés et hors dépôt** (voir `.gitignore`) :

| Fichier | Contenu |
|---|---|
| `local-config.json` | Origine réelle de l'app + URL d'hébergement avec jeton SAS |
| `app-origin.js` | `const TP_APP_ORIGIN = …`, écrit par `build.mjs` depuis la config |

L'origine de l'application est un domaine de production : la section « Confidentialité » de
`../CLAUDE.md` interdit de la versionner. Le manifest ne cible donc que le motif générique
`https://*.azurestaticapps.net/*`, et `sync.js` restreint lui-même son exécution à l'origine
configurée.

## Configuration initiale

```bash
cp extension/local-config.example.json extension/local-config.json
# renseigner appOrigin (obligatoire), puis updateUrl / crxUrl quand l'hébergement existe
node extension/build.mjs
```

`build.mjs` écrit `extension/app-origin.js`, sans quoi l'extension ne peut pas se charger.

---

## Bouton « Ajouter l'extension » dans l'application

La barre supérieure de l'application affiche l'état de l'extension :

| Situation | Affichage |
|---|---|
| Extension installée | Pastille verte « Extension active », infobulle avec la version |
| Absente, fiche configurée | Bouton « Ajouter l'extension » vers la fiche du magasin |
| Absente, aucune fiche | Rien |

La détection repose sur l'attribut `data-tp-extension` que `sync.js` pose sur `<html>` :
les mondes JavaScript sont isolés entre page et script de contenu, mais le DOM est partagé.
L'application le lit et surveille son apparition (le script de contenu s'exécute à
`document_idle`, parfois après le chargement de la page).

> **Rappel** : aucune page web ne peut installer une extension. `chrome.webstore.install()` a
> été retiré de Chrome 71 en décembre 2018. Le bouton ne fait qu'ouvrir la fiche du magasin,
> où l'utilisateur clique sur « Ajouter ». Sur un poste géré, la politique d'entreprise fait
> mieux : l'extension arrive sans aucun clic.

### Paramètres d'application à définir

Les URL des fiches ne sont **pas** dans le dépôt (les fiches sont en visibilité masquée). Elles
sont servies par `GET /api/me` depuis deux paramètres d'application du Static Web App
(*Configuration → Paramètres d'application*) :

| Paramètre | Couvre |
|---|---|
| `EXTENSION_STORE_URL` | Chrome Web Store → Chrome, Vivaldi, Brave, Opera |
| `EXTENSION_STORE_URL_EDGE` | Edge Add-ons → Edge uniquement |

L'application choisit la fiche correspondant au navigateur courant, avec repli sur l'autre si
une seule est définie. Les deux sont facultatifs : sans eux, aucun bouton n'apparaît. Les URL
sont validées côté client contre une liste d'hôtes de magasin autorisés
(`ALLOWED_STORE_HOSTS` dans `tenantpulse.js`) — un paramètre erroné n'affiche rien plutôt que
de produire un lien arbitraire.

**Les deux magasins ne se couvrent pas l'un l'autre** : une extension publiée sur Edge Add-ons
ne s'installe pas dans Chrome, et Edge n'accepte le Chrome Web Store que si l'utilisateur
autorise « les extensions d'autres magasins ». Couvrir tous les navigateurs Chromium par le
bouton suppose donc de publier sur les deux — l'inscription Edge est gratuite, celle du Chrome
Web Store demande des frais uniques.

---

## Réservation à l'organisation

Deux mécanismes se cumulent.

### 1. Attestation d'appartenance (vérifiée par le serveur)

`sync.js`, injecté sur l'origine de l'application, appelle `GET /api/me` en **même origine**,
avec le cookie de session. C'est donc le serveur, derrière l'authentification Entra, qui décide.
Le résultat est réduit à une attestation minimale — `{ authenticatedAt, role, blocked }`,
**jamais l'adresse e-mail** — recopiée dans le miroir.

La popup refuse toute recherche, et n'émet **aucune requête réseau**, si l'attestation est :

| Situation | Comportement |
|---|---|
| absente | « Extension verrouillée : ouvrez TenantPulse et connectez-vous une fois pour l'activer. » |
| plus vieille que 7 jours | « Accès expiré : rouvrez TenantPulse pour vous réauthentifier… » |
| `blocked: true` | « Votre compte est bloqué dans TenantPulse. » |

Quelqu'un d'extérieur à l'organisation ne peut pas ouvrir l'application, n'obtient donc aucune
attestation, et se retrouve avec une extension qui ne fait rien.

> **Portée réelle de ce garde-fou.** Il empêche l'usage opportuniste et rend une copie égarée
> inutile. Il n'arrête pas quelqu'un qui modifierait le code — aucun contrôle côté client ne le
> peut. Mais cette personne n'obtiendrait alors que ce que des endpoints publics Microsoft et
> Cloudflare donnent déjà à tout le monde : la recherche de Tenant ID n'est pas un secret. Les
> données de l'organisation — annuaire partagé, tags, rôles — restent hors d'atteinte, derrière
> l'API authentifiée du SWA.

Une panne réseau ou une session expirée ne détruit pas une attestation encore valide : elle est
conservée telle quelle et expire d'elle-même.

### 2. Diffusion restreinte

**Aucun magasin ne permet de restreindre une extension à une organisation.** Edge Add-ons
n'offre que *Public* et *Masqué* — et « masqué » signifie seulement retiré de la recherche et de
la navigation : quiconque a le lien de la fiche peut l'installer. Le Chrome Web Store propose
une visibilité privée, mais restreinte à un domaine *Google Workspace*, inutile ici.

La visibilité masquée n'est donc **pas** la barrière ; c'est l'attestation ci-dessus qui l'est.
La fiche masquée n'est qu'un canal de diffusion discret, dont le lien est distribué par le
bouton de l'application.

**Voie retenue : publication sur Edge Add-ons en visibilité masquée** (voir [STORE.md](STORE.md)),
complétée du bouton dans l'application. Le déploiement par politique d'entreprise reste possible
et couvre tous les navigateurs Chromium sans aucun clic — voir plus bas.

---

## Empaqueter

```bash
node extension/build.mjs --pem tenantpulse-ext.pem
```

| Artefact | Usage |
|---|---|
| `dist/tenantpulse-extension.crx` | Paquet signé, à héberger |
| `dist/updates.xml` | Manifeste de mise à jour interrogé par le navigateur |
| `dist/selfhosted/` | Même contenu décompressé, avec le champ `key` — chargeable en mode développeur avec l'identifiant définitif, pour tester une politique |
| `dist/tenantpulse-extension-store-<version>.zip` | Repli magasin, non utilisé |

Sans `--pem`, seuls `app-origin.js` et le ZIP de repli sont produits. Le script échoue avec un
message explicite si `updateUrl` / `crxUrl` ne sont pas renseignés.

Identifiant de l'extension, celui qui sert dans les politiques :

```bash
node extension/build.mjs --id --pem tenantpulse-ext.pem
```

Le paquet ne contient que les fichiers d'exécution : ni ce README, ni `STORE.md`, ni le script de
build, ni `local-config.json`. La signature du CRX est déléguée au navigateur
(`--pack-extension`), seule méthode produisant un CRX3 valide ; `build.mjs` localise Edge ou
Chrome automatiquement.

### La clé de signature

Générer la clé une seule fois, puis **la conserver hors du dépôt** (`*.pem` est dans
`.gitignore`) et la sauvegarder dans un coffre :

```bash
node -e "const{generateKeyPairSync}=require('node:crypto'),fs=require('node:fs');fs.writeFileSync('tenantpulse-ext.pem',generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey)"
```

> Cette clé **fixe l'identifiant** de l'extension. La perdre oblige à réinstaller chez tous les
> utilisateurs et à réécrire les politiques.

---

## Héberger le CRX

Le navigateur interroge le manifeste de mise à jour **anonymement** : l'URL doit être joignable
sans authentification. Comme toutes les routes du SWA exigent l'authentification Entra, il faut
un hébergement distinct.

**Conteneur Azure Blob privé + jeton SAS.** Le conteneur n'a aucun accès public ; l'URL, jeton
compris, ne circule que dans la politique Intune. Ce n'est pas un secret cryptographique — un
utilisateur du poste peut la lire dans `edge://policy` — mais elle n'est pas découvrable
publiquement, et le jeton se révoque en le régénérant.

1. Créer un compte de stockage et un conteneur **sans accès public**.
2. Y déposer `tenantpulse-extension.crx` et `updates.xml`, **sous ces noms exacts** : ils sont
   inscrits dans les URL et ne doivent jamais changer.
3. Générer un jeton SAS en **lecture seule**, portée conteneur, avec une échéance lointaine.
4. Reporter les deux URL complètes dans `local-config.json`, puis relancer `build.mjs --pem`.

Points de vigilance : le `updates.xml` doit être servi sur une URL **stable** d'une version à
l'autre, et la date d'expiration du jeton SAS doit être surveillée — passée cette date, les
mises à jour cessent silencieusement.

### Publier une version

1. incrémenter `version` dans `manifest.json` — une version déjà publiée est refusée ;
2. `node extension/build.mjs --pem tenantpulse-ext.pem` ;
3. remplacer les deux fichiers dans le conteneur Blob, sans les renommer.

Le navigateur détecte la nouvelle version en quelques heures, ou immédiatement via le bouton
« Mettre à jour » de la page des extensions.

---

## Déploiement par politique

Politique `ExtensionInstallForcelist` (Intune : *Paramètres du catalogue* → Microsoft Edge ;
GPO : modèles d'administration), avec l'identifiant **et** l'URL du manifeste de mise à jour,
séparés par un point-virgule :

```
dbjaoikaholfppmbioclkllaigpmafog;https://<compte>.blob.core.windows.net/<conteneur>/updates.xml?<jeton-sas>
```

L'identifiant `dbjaoikaholfppmbioclkllaigpmafog` correspond à la clé `tenantpulse-ext.pem`. Si la
clé est régénérée, l'identifiant change : le relire avec `build.mjs --id`.

Selon la configuration du parc, deux politiques complémentaires peuvent être nécessaires pour
autoriser une source hors magasin : `ExtensionInstallSources` (URL depuis lesquelles une
installation est permise) et `ExtensionInstallAllowlist` si une liste de blocage globale
(`ExtensionInstallBlocklist = *`) est en place.

La même politique existe côté Chrome et Vivaldi, qui lisent les politiques Chromium.

---

## Charger en développement

1. `node extension/build.mjs` — indispensable, il génère `app-origin.js` ;
2. ouvrir `edge://extensions` (ou `chrome://extensions`) ;
3. activer **Mode développeur** ;
4. **Charger l'élément décompressé** → sélectionner ce dossier `extension/` ;
5. ouvrir l'application TenantPulse et s'y connecter — sans quoi l'extension reste verrouillée.

Pour tester avec l'identifiant définitif (celui des politiques), charger `dist/selfhosted/` plutôt
que `extension/`.

En environnement managé, le mode développeur peut être bloqué par la politique
(`ExtensionInstallBlocklist`, `BlockExternalExtensions`, `DeveloperToolsAvailability`).

Après toute modification des fichiers : bouton **Recharger** sur la carte de l'extension. Le
script de contenu n'est réinjecté qu'au rechargement des onglets de l'application.

---

## Permissions demandées, et pourquoi

| Permission | Raison |
|---|---|
| `storage` | Conserver le miroir du profil, l'attestation d'appartenance et la dernière recherche |
| `scripting` | Enregistrer les scripts du panneau Dynamics **après** octroi de la permission optionnelle |
| `https://login.microsoftonline.com/*` | Endpoint OIDC public — détection et validation du Tenant ID |
| `https://cloudflare-dns.com/*` | Une requête DoH ciblée (CNAME DKIM `selector1`) pour le lien SharePoint direct |
| `https://*.dynamics.com/*` **(optionnelle)** | Panneau dans Dynamics 365 — non demandée à l'installation |

Ni `tabs`, ni `scripting`, ni `activeTab`, ni `<all_urls>` : les raccourcis sont de simples liens
`target="_blank"`, qui ne demandent aucune permission. L'origine de l'application n'est pas dans
`host_permissions` — un script de contenu tire son droit d'injection de son `matches`. Aucune API
propre à Chrome ou à Edge : l'extension fonctionne sur tout navigateur Chromium.

Le service worker `background.js` ne demande aucune permission propre : `chrome.action.setIcon` est
accessible du seul fait que le manifest déclare une `action`, et les résolutions qu'il porte
s'appuient sur les `host_permissions` ci-dessus.

### Pourquoi le réseau passe par le service worker

Les appels à `login.microsoftonline.com` et à la DoH Cloudflare vivent dans `tp-net.js`, chargé par
`background.js` via `importScripts`. La popup ne fait plus de `fetch` : elle envoie un message
`{ type: 'tp-lookup', kind, value }` et reçoit `{ ok, data }`.

La raison n'est pas cosmétique. Un `fetch` émis depuis un **script de contenu** part avec l'origine
de la page hôte : il est donc soumis au CORS et à la politique de sécurité de contenu de cette page.
Depuis le service worker, ce sont les `host_permissions` du manifest qui s'appliquent, et l'appel
aboutit quelle que soit la page à l'origine de la demande. Tout contexte de l'extension partage
ainsi une seule implémentation, et un seul endroit liste les endpoints publics interrogés.

## Panneau Dynamics 365

Affiche le Tenant ID du client directement sur la fiche incident, sans aucun droit de
personnalisation sur l'environnement : tout se passe côté navigateur.

**L'accès est optionnel.** `https://*.dynamics.com/*` est déclaré en
`optional_host_permissions` : rien n'est demandé à l'installation, et tant que l'interrupteur
« Panneau dans Dynamics 365 » de la popup n'est pas coché, l'extension n'est injectée sur aucune
page Dynamics. `background.js` enregistre les scripts (`chrome.scripting.registerContentScripts`)
à l'octroi de la permission et les retire à son retrait.

**Deux mondes, deux rôles.** `d365/ctx-main.js` est injecté en monde `MAIN`, donc dans le contexte
JavaScript de Dynamics : c'est la seule façon d'atteindre les API client (`Xrm`, `Microsoft.Apm`),
invisibles depuis un monde isolé. Il ne fait que publier l'identité de l'enregistrement affiché.
`d365/ctx.js`, isolé, porte les garde-fous et la logique.

**Trois garde-fous, dans cet ordre :**

1. **origine exacte** — le `matches` d'un script de contenu ne peut être qu'un joker, et
   `*.dynamics.com` couvre toutes les organisations du monde. `d365-origin.js` (généré hors dépôt
   depuis `d365Origin`) restreint l'exécution réelle à la seule instance configurée ;
2. **attestation d'appartenance** — la même que pour la popup, aucune requête sans elle ;
3. **droits de l'utilisateur** — la lecture Dataverse (`/api/data/v9.2/`, même origine, cookie de
   session) passe par l'API OData officielle : elle refuse ce que l'utilisateur n'a pas le droit
   de voir. Aucune personnalisation, aucun privilège supplémentaire.

**Domaine du client**, par ordre de fiabilité : site web du compte → domaine de l'adresse du
contact principal → adresse du compte. Les domaines de comptes personnels Microsoft sont écartés.
Le résultat est mis en cache par enregistrement, donc une session rouverte ne redéclenche rien.

**Sessions Omnicanal.** Chaque session vit dans une iframe : les scripts sont injectés dans toutes
les frames, et chacune signale si elle est visible (une session en arrière-plan est masquée, son
viewport mesure 0). Seule la frame visible déclenche une résolution.

**Coût sur Omnicanal.** Pas de `MutationObserver` — un observateur large sur le DOM de Dynamics est
la façon classique de plomber la page. Le seul travail périodique est une lecture d'objet en mémoire
toutes les secondes, suspendue dès que l'onglet passe en arrière-plan. Elle est conservée même quand
les événements `Microsoft.Apm` sont disponibles : ouvrir un autre enregistrement **dans** un onglet
de session déjà ouvert ne déclenche ni bascule de session ni navigation d'onglet.

`minimum_chrome_version` est passé à **111** : c'est la version qui introduit `world: "MAIN"` pour
les scripts enregistrés à l'exécution.

### Le panneau

Il se **superpose** à la section « Santé du client », il ne la remplace pas : le contrôle est rendu
et re-rendu par le framework de Dynamics, tout nœud inséré dans son arbre finirait écrasé au
premier cycle. Le panneau vit donc dans un élément attaché à `<body>`, en position fixe, calé sur
le rectangle de la section — et repliable d'un clic, ce qui redonne la section visible en dessous.
L'état replié est mémorisé.

L'ancrage ne s'appuie sur aucun sélecteur interne de Dynamics : la section est repérée par le
**texte de son titre**, puis on remonte jusqu'à un conteneur de taille plausible. Un identifiant
interne survit rarement à une mise à jour, un libellé visible oui. Si aucun titre ne correspond
après une douzaine de tentatives, le panneau bascule en **tiroir ancré à droite** — mieux vaut un
placement approximatif qu'un panneau absent.

Le suivi de position se fait par `ResizeObserver` sur la section, plus le redimensionnement et le
défilement (en capture, car le défilement utile est celui des conteneurs internes de Dynamics et ne
remonte pas jusqu'à `window`), le tout throttlé en `requestAnimationFrame`. Section masquée — une
session en arrière-plan — et le panneau s'efface avec elle.

**Deux registres visuels, volontairement.** Le *conteneur* imite une carte de formulaire Dynamics —
fond uni, bordure d'un pixel, coins à 4 px, **aucune ombre portée** : il doit passer pour une
section du formulaire, pas pour une fenêtre posée dessus. Le *résultat*, lui, reprend le hero de
TenantPulse à l'identique (dégradés radiaux, GUID en monospace blanche, pastille de confiance,
tuiles de redirection), repris de `popup.css`.

Le contenu reprend celui de la popup : domaine et provenance, Tenant ID avec bouton de copie,
indice de confiance, puis la grille des centres d'administration dans l'ordre du profil synchronisé
depuis l'application, chaque tuile ouvrant son menu de raccourcis. Un clic ouvre **un** onglet,
jamais plusieurs — les postes gérés bloquent les pop-ups. Les icônes sont servies depuis
`web_accessible_resources`.

Quand la fiche ne donne aucun domaine exploitable, un champ de saisie prend le relais ; la valeur
est **mémorisée par compte**, vaut pour tous ses incidents, et prime ensuite sur ce que dit
Dataverse — c'est l'utilisateur qui a raison. Elle accepte aussi bien une URL complète qu'une
adresse e-mail.

**Découpe au défilement.** Le panneau garde la taille et la position de la section : il défile avec
elle et ce qui dépasse de la zone est **masqué par une découpe** (`clip-path`), pas retiré.
Redimensionner ferait sauter la mise en page à chaque cran de molette ; la découpe donne ce qu'on
attend d'un panneau ordinaire — il glisse sous le bandeau. Un élément en position fixe ne se
laissant rogner par aucun ancêtre, elle est calculée à la main. Le conteneur défilant est résolu
une fois par ancrage — jamais dans la boucle de positionnement, `getComputedStyle` sur toute une
lignée d'ancêtres n'ayant rien à faire à 60 Hz.

**Alignement.** Le premier conteneur assez grand est souvent la boîte *interne* de la carte, ce qui
laisse le panneau en retrait de quelques pixels, visiblement désaligné avec les cartes voisines. On
remonte donc tant que le parent reste « la même carte, en un peu plus large » — plafonds sur l'écart
de taille et sur la moitié de la largeur de fenêtre, pour ne jamais sauter à la colonne entière.

**Source du domaine : l'adresse d'abord.** Un tenant Microsoft 365 se rattache au domaine de
messagerie ; le site web d'un compte est souvent une vitrine hébergée ailleurs, parfois un domaine
commercial sans rapport. L'ordre est donc : courrier du contact → courrier du compte → site web.

**Hors d'une fiche** — vue de liste, tableau de bord, accueil — ou **quand la fiche ne donne aucune
adresse ni site web exploitable, le panneau s'efface** au lieu d'encombrer le formulaire pour dire
qu'il n'a rien trouvé. Conséquence assumée : la saisie manuelle d'un domaine n'est alors plus
atteignable ; elle ne l'est que lorsqu'un domaine a été trouvé mais qu'aucun tenant n'y répond.
Le panneau s'efface aussi plutôt que de rester affiché avec le tenant de la fiche précédente. L'effacement n'est honoré que s'il vient de
la frame qui a produit l'état courant : dans Omnicanal, la frame principale peut afficher une liste
pendant qu'une session ouverte, dans sa propre frame, tient toujours son incident.

Le panneau ne peut vivre que dans la frame principale, alors que l'enregistrement est détecté par
la frame qui héberge `Xrm` — celle d'une session Omnicanal, le cas échéant. Deux scripts de contenu
ne pouvant pas se parler directement, le service worker relaie : l'état vers la frame 0, la saisie
manuelle vers toutes les frames, dont seule celle qui détient l'enregistrement concerné réagit.

### Icône adaptée au thème

Chromium n'a pas d'équivalent au `theme_icons` de Firefox : une icône déclarée dans le manifest
est figée, et un glyphe monochrome devient illisible sur la moitié des barres d'outils. D'où le
montage suivant :

1. la popup et le script de contenu observent `prefers-color-scheme` — ce sont les seuls contextes
   de l'extension à disposer d'un DOM ;
2. ils écrivent `tp_theme_v1` dans `chrome.storage.local` ;
3. `background.js` applique la variante correspondante via `chrome.action.setIcon`, au démarrage
   du navigateur, à l'installation et à chaque changement.

| Jeu d'icônes | Usage |
|---|---|
| `assets/icon-*.png` | Glyphe **noir**, barre d'outils claire — défaut du manifest |
| `assets/icon-white-*.png` | Glyphe **blanc**, barre d'outils sombre |

Sans le service worker, l'icône reviendrait au défaut à chaque redémarrage du navigateur, jusqu'à
la prochaine ouverture de la popup.

## Limites connues

- **GUID → domaine** : Microsoft n'expose aucune API publique anonyme faisant l'inverse. Une
  recherche par Tenant ID ne résout le domaine que si le tenant figure dans l'historique
  miroir. L'annuaire partagé (`/api/classification`) est hors d'atteinte depuis l'extension :
  le cookie d'authentification SWA n'est pas transmis sur une requête inter-site.
  Sans domaine, les centres qui l'exigent (M365 Admin, Exchange, Teams, SharePoint) restent
  grisés et le lien d'analyse approfondie prend le relais.
- **SharePoint** : le lien direct `<tenant>-admin.sharepoint.com` est déduit du CNAME DKIM
  `selector1`, via une requête DNS-over-HTTPS ciblée. CNAME absent ou DKIM non Microsoft → la
  tuile est grisée, avec repli M365 Admin dans son menu.
- **Synchronisation unidirectionnelle** : le profil se modifie dans l'application, pas dans
  l'extension. Un changement est répercuté en quelques secondes tant qu'un onglet de l'app est
  ouvert, et au plus tard à la visite suivante. L'opt-in historique est respecté : historique
  désactivé côté app → miroir vide.
- **Données locales** : le miroir réside en clair dans `chrome.storage.local`. Si l'historique
  est activé, il contient de vrais domaines associés à leurs Tenant ID — même classe
  d'exposition que le `localStorage` de l'application, mais dans un second emplacement.

## Cohérence avec l'application

`tp-core.js` est une **copie** de blocs de `../tenantpulse.js` : le Manifest V3 interdit le code
distant, la config ne peut donc pas être chargée depuis l'app à l'exécution.

> Toute modification de `REDIRECT_BUTTONS`, `ALLOWED_REDIRECT_HOSTS` ou `ADMIN_SHORTCUTS` dans
> `../tenantpulse.js` doit être répliquée dans `tp-core.js`.

L'en-tête de `tp-core.js` liste les blocs concernés et leur ligne d'origine.

Le dossier `extension/` est retiré du déploiement Azure Static Web Apps par une étape dédiée du
workflow `.github/workflows/azure-static-web-apps.yml` (`app_location` vaut `/`, sans quoi il
serait publié sur le site).
