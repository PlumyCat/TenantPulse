# Fiche de publication — Chrome Web Store & Microsoft Edge Add-ons

> [!IMPORTANT]
> **Voie retenue : Microsoft Edge Add-ons, en visibilité « Masqué ».**
> La fiche disparaît de la recherche et de la navigation du magasin ; seul le lien direct y
> donne accès, et c'est ce lien que l'application propose via son bouton « Ajouter
> l'extension ».
>
> La visibilité masquée n'est **pas** un contrôle d'accès — c'est le verrou d'appartenance
> (attestation `/api/me`, voir [README.md](README.md)) qui réserve l'usage à l'organisation.
> Une personne extérieure qui installerait l'extension obtiendrait une coquille inerte.
>
> **Publication sur les deux magasins**, avec le même ZIP et sans reconstruction :
> Edge Add-ons en *Hidden* pour Edge, Chrome Web Store en *Unlisted* pour Chrome, Vivaldi,
> Brave et Opera. Les identifiants attribués diffèrent d'un magasin à l'autre.
>
> Prérequis Chrome Web Store : frais d'inscription uniques de 5 $ (jusqu'à 20 extensions), et
> **double authentification obligatoire sur le compte Google** — sans elle, aucune publication
> ni mise à jour n'est possible.

Éléments à recopier dans la console de publication. Les limites de caractères indiquées sont
celles du Chrome Web Store, plus strictes que celles d'Edge.

---

## Identité

**Nom** (45 caractères max)

```
TenantPulse — Tenant ID & raccourcis
```

**Résumé / description courte** (132 caractères max)

Non modifiable dans la console : le champ est marqué « Résumé issu du package » et recopie le
`description` de `manifest.json`. Le changer suppose de modifier le manifest et de téléverser un
nouveau paquet.

```
Recherche Tenant ID Microsoft 365 d'un domaine et reconstruction des liens vers les centres admin M365
```

**Catégorie** : Outils de développement (Chrome) / Productivité (Edge)
**Langue** : Français

**Visibilité** : **Non répertoriée** (`Unlisted` / `Masquée`). L'extension reste installable
par lien direct mais n'apparaît pas dans les résultats de recherche du magasin.

---

## Description détaillée

À jour pour la **0.9.6** — panneau Dynamics 365, tuile Purview et badges de
classification inclus.
Limite : 16 000 caractères (le texte ci-dessous en fait ~3 700).

```
⚠ VERSION EN DÉVELOPPEMENT

TenantPulse est un outil d'administration Microsoft 365 en cours de développement,
destiné à un usage interne. L'extension reste verrouillée tant que l'utilisateur ne
s'est pas authentifié sur l'application TenantPulse associée : sans compte autorisé,
aucune fonction n'est disponible et aucune requête réseau n'est émise.

Des changements d'interface et de comportement sont à prévoir d'une version à l'autre.

À QUOI ELLE SERT

Saisissez un domaine, une adresse e-mail ou un Tenant ID :

• Le Tenant ID (GUID) est résolu via l'endpoint OpenID Connect public de Microsoft,
  puis revalidé pour écarter les tenants génériques.
• Des tuiles ouvrent Partner Center, Entra ID, Microsoft 365 Admin, Exchange, Intune,
  Teams, SharePoint, Azure, Defender et Purview, déjà paramétrés sur le tenant trouvé.
• Chaque tuile déplie ses raccourcis internes : utilisateurs, licences, accès
  conditionnel, journaux de connexion, règles de flux, suivi des messages,
  quarantaine, stratégies de conformité, abonnements, et d'autres.
• Les tags de classification définis dans l'application s'affichent avec le tenant,
  en lecture seule : proposer, valider ou retirer un tag reste dans l'application.

PANNEAU DANS DYNAMICS 365 — FACULTATIF

Un interrupteur, dans la fenêtre de l'extension, affiche le Tenant ID du client
directement sur la fiche incident de l'instance Dynamics 365 de l'organisation.

• Rien n'est demandé à l'installation : l'accès à Dynamics est une permission
  optionnelle, réclamée par le navigateur au moment où l'interrupteur est activé.
  Tant qu'elle n'est pas accordée, l'extension ne s'exécute sur aucune page Dynamics.
• Le panneau se superpose à la section « Santé du client », replié par défaut, et
  s'ouvre d'un clic. Il n'écrit dans aucun champ et ne modifie aucune donnée du CRM.
• Le domaine du client est déduit de l'adresse de contact ou du site web de la fiche,
  lus par l'API officielle de Dynamics et avec les droits propres de l'utilisateur.
  Quand la fiche n'en donne aucun, le domaine peut être saisi à la main et la saisie
  est retenue pour ce client.
• Le panneau se place où vous voulez : tirez sur son en-tête pour le détacher, ou
  utilisez l'interrupteur « Position libre » de la fenêtre de l'extension. Un bouton
  le réancre sur la section d'origine.
• L'interrupteur est réversible : éteindre fait disparaître le panneau des onglets
  déjà ouverts, sans rechargement.

CONFIGURATION REPRISE AUTOMATIQUEMENT

L'extension reprend le profil défini dans l'application : les tuiles désactivées
n'apparaissent pas, l'ordre choisi est respecté, et les recherches récentes sont
proposées si l'historique a été activé. Rien n'est à reconfigurer ici.

CE QU'ELLE NE FAIT PAS

Les analyses approfondies — enregistrements DNS, santé du domaine (DMARC, SPF, DKIM),
WHOIS et hébergeur — restent du ressort de l'application, accessible par un lien en
pied de fenêtre, où se gère également la classification des tenants.

CONFIDENTIALITÉ

Aucune donnée n'est transmise à l'auteur de l'extension. Aucun compte n'est créé.
Ni analytique, ni télémétrie, ni traceur.

Deux endpoints publics sont interrogés : Microsoft, pour résoudre le Tenant ID, et
Cloudflare, pour une unique résolution DNS servant à construire le lien SharePoint.
Les autres lectures se font en même origine, sur des sites que l'utilisateur visite
lui-même : l'application TenantPulse, pour vérifier son appartenance à l'organisation
et recopier l'annuaire des tags, et — uniquement si la permission optionnelle a été
accordée — l'instance Dynamics 365 de l'organisation.

Le profil, l'historique et les tags recopiés ne quittent jamais le navigateur. Aucun
code distant n'est chargé.

Version 0.9.6
```

---

## Onglet « Confidentialité » — textes prêts à coller

Les quatre champs ci-dessous sont limités à **1 000 caractères** chacun dans la console Chrome.
Le formulaire Edge pose les mêmes questions.

> **Marge quasi nulle.** En 0.9.6, « objectif unique » fait 991 caractères et « accès à
> l'hôte » 997 : ils ont dû être resserrés pour entrer. Toute phrase ajoutée à l'un des deux
> oblige à en retirer une autre — recompter avant de coller. C'est ce qui a coûté sa place à
> l'ancienne mention de l'indice de confiance, retiré de l'interface par ailleurs.

### Objectif unique

```
Identifier le tenant Microsoft 365 associé à un domaine, et ouvrir les centres
d'administration Microsoft correspondants.

Toutes les fonctions servent cet unique objectif. La saisie accepte un domaine, une
adresse e-mail ou un Tenant ID. La résolution s'appuie sur l'endpoint OpenID Connect
public de Microsoft, puis revalide le GUID obtenu. Les tuiles et leurs sous-menus
construisent les URL des centres — Partner Center, Entra ID, Microsoft 365 Admin,
Exchange, Intune, Teams, SharePoint, Azure, Defender, Purview — déjà paramétrées
sur le tenant trouvé.

Le panneau Dynamics 365, facultatif, fait de même sans saisie : il déduit le domaine
du client de la fiche ouverte et affiche le Tenant ID et ces centres.

Les fonctions annexes y concourent : la configuration lue sur l'application associée
fixe les centres affichés et leur ordre, l'unique requête DNS construit l'URL du
centre SharePoint, et les tags en lecture seule qualifient le tenant.

L'extension n'a aucune autre fonction.
```

### Justification de l'autorisation `storage`

```
Conserve localement, dans le navigateur : le profil de raccourcis synchronisé depuis
l'application TenantPulse (tuiles actives et leur ordre), l'attestation d'appartenance
à l'organisation — une date, un rôle et un indicateur de blocage, jamais une adresse
e-mail ni un nom —, la dernière recherche saisie afin de la restituer à l'ouverture,
le thème clair ou sombre servant à adapter l'icône de la barre d'outils, l'annuaire
des tags de classification recopié depuis l'application, et, pour le panneau
Dynamics 365, sa position lorsqu'il a été déplacé et les domaines que l'utilisateur
a corrigés à la main. Aucune de ces données n'est transmise à un serveur tiers ni à
l'auteur de l'extension.
```

### Justification de l'autorisation `scripting`

```
Sert uniquement à enregistrer, puis à retirer, les scripts du panneau Dynamics 365 —
une fonction facultative que l'utilisateur active lui-même.

Ces scripts ne peuvent pas être déclarés dans le manifeste : l'accès à Dynamics est
une permission optionnelle, refusée par défaut. Ils sont donc enregistrés par
chrome.scripting.registerContentScripts au moment où l'utilisateur accorde la
permission, et désenregistrés dès qu'il la retire ou éteint l'interrupteur.

L'enregistrement est restreint à l'instance Dynamics de l'organisation. Aucune
injection ailleurs, aucun usage de executeScript sur une page arbitraire, et aucune
permission tabs ou activeTab.
```

### Justification de l'autorisation d'accès à l'hôte

Un seul champ couvre les `host_permissions`, l'`optional_host_permissions` **et** le motif
`content_scripts`.

```
Quatre origines, toutes au service de l'objectif unique.

login.microsoftonline.com : endpoint OpenID Connect public, interrogé sans
authentification, pour résoudre puis valider le Tenant ID d'un domaine.

cloudflare-dns.com : une seule requête DNS-over-HTTPS (CNAME DKIM), pour construire
l'URL du centre SharePoint. Seul le domaine est transmis.

*.azurestaticapps.net : l'application web TenantPulse. Un script de contenu y lit le
profil de raccourcis, l'appartenance à l'organisation et l'annuaire des tags.

*.dynamics.com : OPTIONNELLE, jamais demandée à l'installation. Accordée, le panneau
lit par l'API OData officielle, en même origine et avec les droits de l'utilisateur,
le site web et le contact du client de la fiche pour en déduire un domaine ; ni
conservés, ni transmis.

Ces deux derniers motifs sont génériques car ces adresses ne sont pas publiées ; les
scripts vérifient l'origine à l'exécution. Lecture seule partout ; seule écriture
dans une page : le panneau, en Shadow DOM.
```

> L'origine exacte de l'application n'est volontairement reproduite nulle part ici : c'est un
> domaine de production, que la section « Confidentialité » de `../CLAUDE.md` interdit de
> versionner. Elle n'est d'ailleurs demandée par aucun des deux formulaires.

### Code distant

Répondre **non**. Vérifiable dans le paquet : aucun `eval()`, aucune `new Function()`, aucun
import dynamique, aucun `<script src>` externe, et une CSP `script-src 'self'` qui refuserait
tout script distant. Les appels réseau ramènent des **données** (JSON de configuration OIDC,
réponse DNS, `/api/me`), jamais du code — c'est la distinction que fait Google.

### Attendez-vous à un examen approfondi

Déclarer un accès à un hôte déclenche systématiquement une relecture manuelle et allonge le
délai de publication de quelques jours. C'est normal, il n'y a rien à corriger.

---

## Déclaration d'usage des données

Chrome Web Store, onglet « Confidentialité » :

- Ne cocher **aucune** des catégories de données collectées. L'extension ne lit ni
  l'historique de navigation, ni le contenu des pages visitées, ni aucune donnée
  d'identification. Le domaine saisi est envoyé aux endpoints publics de Microsoft et de
  Cloudflare pour être résolu, et n'est conservé que dans le navigateur.
  Le panneau Dynamics lit bien une adresse e-mail de contact, mais elle ne sort pas de
  l'appareil : seul le domaine qui en est extrait part vers les endpoints publics, et
  l'adresse elle-même n'est ni conservée ni journalisée. Au sens de Google, « collecter »
  signifie transférer hors de l'appareil — la catégorie *informations personnelles
  identifiables* ne s'applique donc pas. Le mentionner dans les notes de certification
  plutôt que de cocher la case.
- Cocher les trois certifications :
  - je ne vends ni ne transfère les données utilisateur à des tiers ;
  - je n'utilise ni ne transfère les données utilisateur à des fins étrangères à l'objet
    unique de l'extension ;
  - je n'utilise ni ne transfère les données utilisateur pour évaluer la solvabilité ou
    accorder des prêts.

**URL de politique de confidentialité** : Edge Add-ons la réclame dès qu'une autorisation
est demandée. Le document dédié `extension/PRIVACY.md` du dépôt public fait référence — il
couvre le panneau Dynamics et l'annuaire des tags, et se termine par un résumé en anglais :

```
https://github.com/PlumyCat/TenantPulse/blob/main/extension/PRIVACY.md
```

---

## Captures d'écran

Chrome Web Store et Edge Add-ons exigent **au moins une** capture, en 1280 × 800 ou
640 × 400.

Deux captures sont déjà générées, au format 1280 × 800, dans
`extension/dist/captures-magasin/` (dossier non versionné, comme le reste de `dist/`) :

| Fichier | Contenu |
|---|---|
| `boutique-1-resultat.png` | Recherche aboutie : Tenant ID, badges de classification, les dix tuiles |
| `boutique-2-raccourcis.png` | Menu de raccourcis Exchange déplié |

Elles ont été produites depuis l'extension réellement chargée dans Edge, sur le domaine
public `microsoft.com`.

> **À refaire pour la 0.9.6.** Les deux captures datent d'avant l'interrupteur Dynamics,
> les badges de classification, la tuile Purview et le hero refondu (bleu de marque en
> thème clair, indigo sobre en thème sombre, indice de confiance retiré) : la fenêtre n'a
> plus du tout cette allure — ce sont des captures à refaire, pas à retoucher. Une troisième
> capture serait utile — le panneau Dynamics déplié sur une fiche —, mais elle ne peut être
> prise que sur une fiche réelle : la flouter entièrement, ou s'en tenir aux deux premières,
> la section « Confidentialité » de `../CLAUDE.md` interdisant de publier un client ou un
> tenant de production.

Pour les refaire après une évolution de l'interface :

1. charger l'extension (mode développeur ou paquet installé) ;
2. ouvrir la popup et rechercher un domaine **public**, par exemple `microsoft.com` —
   ne jamais capturer un domaine client ni un tenant réel de production ;
3. déplier un menu de raccourcis pour la seconde capture ;
4. capturer la popup, puis la centrer sur un fond neutre en 1280 × 800.

---

---

## Notes pour la certification

Le champ **« Notes for certification »**, à la dernière étape, sert à répondre d'avance aux
relecteurs. Sans ces précisions, l'extension paraît inerte lors du test et peut être refusée.

```
L'extension est un outil interne d'administration Microsoft 365. Elle reste
volontairement verrouillée tant que l'utilisateur ne s'est pas authentifié sur
l'application web associée : c'est le comportement attendu, pas un défaut.

Pour la tester, il faut un compte de l'organisation propriétaire. À défaut, le
verrou peut être levé en écrivant manuellement dans le stockage de l'extension :
  chrome.storage.local.set({ tp_mirror_v1: {
    profile: null, history: [], historyEnabled: false, adminAccounts: {},
    auth: { authenticatedAt: new Date().toISOString(), role: 'user', blocked: false }
  }})
Il suffit ensuite de saisir un domaine, par exemple microsoft.com.

Le motif « https://*.azurestaticapps.net/* » du script de contenu est un joker
volontaire : l'adresse exacte de l'application n'est pas publiée. Le script
vérifie lui-même l'origine à l'exécution et ne fait rien ailleurs. Il lit la
configuration de raccourcis de l'utilisateur, vérifie son appartenance à
l'organisation et recopie l'annuaire des tags ; il n'écrit jamais dans la page.

Le panneau Dynamics 365 est facultatif et désactivé par défaut : la permission
« https://*.dynamics.com/* » est déclarée en optional_host_permissions, n'est
jamais demandée à l'installation, et rien n'est injecté sur une page Dynamics
tant que l'utilisateur n'a pas activé l'interrupteur de la fenêtre. Le motif est
générique pour la même raison que ci-dessus — l'adresse de l'instance de
l'organisation n'est pas publiée — et le script contrôle l'origine à l'exécution.
Il n'est donc pas reproductible sans une instance Dynamics de l'organisation.

Ce panneau lit, en même origine et par l'API OData officielle de Dynamics, le
site web et l'adresse de contact du client de la fiche ouverte, avec les droits
propres de l'utilisateur, pour en déduire un domaine. Ces valeurs ne sont ni
conservées ni transmises : seul le domaine obtenu part vers les endpoints
publics de Microsoft et de Cloudflare. C'est pourquoi aucune catégorie de
données collectées n'est déclarée. Le panneau est isolé dans un Shadow DOM et
superposé au formulaire : il ne modifie, ne remplit et ne soumet aucun champ.

Aucun code distant n'est chargé. Aucune donnée n'est transmise à l'auteur.
```

---

## Après acceptation

1. Relever l'**URL de la fiche** (page *Extension overview* du tableau de bord).
2. L'enregistrer comme paramètre d'application du Static Web App :
   *Configuration → Paramètres d'application* → `EXTENSION_STORE_URL_EDGE`.
   C'est ce qui fait apparaître le bouton « Ajouter l'extension » dans l'application.
3. Relever aussi l'**identifiant** attribué — il servira si un déploiement par politique
   d'entreprise est mis en place plus tard. Il est **différent** de celui du CRX
   auto-hébergé et de celui qu'attribuerait le Chrome Web Store.
