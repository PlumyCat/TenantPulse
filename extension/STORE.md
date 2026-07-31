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

```
Trouve le Tenant ID Microsoft 365 d'un domaine et ouvre les centres d'administration en un clic.
```

**Catégorie** : Outils de développement (Chrome) / Productivité (Edge)
**Langue** : Français

**Visibilité** : **Non répertoriée** (`Unlisted` / `Masquée`). L'extension reste installable
par lien direct mais n'apparaît pas dans les résultats de recherche du magasin.

---

## Description détaillée

```
TenantPulse identifie le tenant Microsoft 365 associé à un domaine et donne un accès
direct aux centres d'administration correspondants.

Saisissez un domaine, une adresse e-mail ou un Tenant ID :

• Le Tenant ID (GUID) est résolu via l'endpoint OpenID Connect public de Microsoft,
  puis revalidé pour écarter les tenants génériques.
• Un indice de confiance détaille les éléments obtenus.
• Les tuiles ouvrent Partner Center, Entra ID, Microsoft 365 Admin, Exchange, Intune,
  Teams, SharePoint, Azure et Defender, pré-paramétrés sur le tenant trouvé.
• Chaque tuile déplie ses raccourcis internes : utilisateurs, licences, accès
  conditionnel, règles de flux, quarantaine, abonnements, et d'autres.

L'extension reprend automatiquement la configuration de l'application web TenantPulse :
les tuiles que vous avez désactivées n'apparaissent pas, et l'ordre que vous avez défini
est respecté. Vos recherches récentes sont proposées si vous avez activé l'historique
dans l'application.

Les analyses approfondies — enregistrements DNS, santé du domaine (DMARC, SPF, DKIM),
WHOIS et hébergeur — restent du ressort de l'application, accessible depuis le lien en
pied de fenêtre.

Aucune donnée n'est transmise à l'auteur de l'extension. Aucun compte n'est requis.
```

---

## Onglet « Confidentialité » — textes prêts à coller

Les trois champs ci-dessous sont limités à **1 000 caractères** chacun dans la console Chrome.
Le formulaire Edge pose les mêmes questions.

### Objectif unique

```
Identifier le tenant Microsoft 365 associé à un domaine, et ouvrir les centres
d'administration Microsoft correspondants.

Toutes les fonctions servent cet unique objectif. La saisie accepte un domaine, une
adresse e-mail ou un Tenant ID. La résolution s'appuie sur l'endpoint OpenID Connect
public de Microsoft, suivie d'une revalidation du GUID obtenu. Les tuiles et leurs
sous-menus construisent les URL des centres d'administration — Partner Center,
Entra ID, Microsoft 365 Admin, Exchange, Intune, Teams, SharePoint, Azure et
Defender — déjà paramétrées sur le tenant trouvé.

Les deux fonctions annexes servent également cet objectif : la lecture de la
configuration sur l'application web associée détermine uniquement quels centres
afficher et dans quel ordre, et l'unique requête DNS sert uniquement à construire
l'URL du centre d'administration SharePoint.

L'extension n'a aucune autre fonction.
```

### Justification de l'autorisation `storage`

```
Conserve localement, dans le navigateur, trois éléments : le profil de raccourcis
synchronisé depuis l'application TenantPulse (tuiles actives et leur ordre), la
dernière recherche saisie afin de la restituer à l'ouverture, et le thème clair ou
sombre servant à adapter l'icône de la barre d'outils. Aucune de ces données n'est
transmise à un serveur tiers ni à l'auteur de l'extension, et aucune donnée
d'identification n'y est conservée.
```

### Justification de l'autorisation d'accès à l'hôte

Un seul champ couvre les deux `host_permissions` **et** le motif `content_scripts`.

```
Trois origines, toutes nécessaires à l'objectif unique de l'extension.

login.microsoftonline.com : endpoint OpenID Connect public de Microsoft, interrogé
en lecture seule et sans authentification, pour résoudre puis valider le Tenant ID
d'un domaine. C'est la fonction principale de l'extension.

cloudflare-dns.com : une seule requête DNS-over-HTTPS sur l'enregistrement CNAME
DKIM du domaine analysé, nécessaire pour construire l'URL du centre d'administration
SharePoint. Seul le nom de domaine est transmis.

*.azurestaticapps.net : origine de l'application web TenantPulse. Un script de
contenu y lit la configuration de raccourcis de l'utilisateur, pour que l'extension
reflète ses réglages, et vérifie son appartenance à l'organisation. Le motif est
générique car l'adresse exacte de l'application n'est pas publiée ; le script
contrôle l'origine à l'exécution et reste inactif ailleurs. Lecture seule, aucune
écriture dans la page.
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
- Cocher les trois certifications :
  - je ne vends ni ne transfère les données utilisateur à des tiers ;
  - je n'utilise ni ne transfère les données utilisateur à des fins étrangères à l'objet
    unique de l'extension ;
  - je n'utilise ni ne transfère les données utilisateur pour évaluer la solvabilité ou
    accorder des prêts.

**URL de politique de confidentialité** : Edge Add-ons la réclame dès qu'une autorisation
est demandée. Le fichier `extension/README.md` du dépôt public fait office de référence :

```
https://github.com/PlumyCat/TenantPulse/blob/main/extension/README.md
```

Si un document dédié est préféré, créer `extension/PRIVACY.md` et pointer dessus.

---

## Captures d'écran

Chrome Web Store et Edge Add-ons exigent **au moins une** capture, en 1280 × 800 ou
640 × 400.

Deux captures sont déjà générées, au format 1280 × 800, dans
`extension/dist/captures-magasin/` (dossier non versionné, comme le reste de `dist/`) :

| Fichier | Contenu |
|---|---|
| `boutique-1-resultat.png` | Recherche aboutie : Tenant ID, indice de confiance, les neuf tuiles |
| `boutique-2-raccourcis.png` | Menu de raccourcis Exchange déplié |

Elles ont été produites depuis l'extension réellement chargée dans Edge, sur le domaine
public `microsoft.com`.

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
configuration de raccourcis de l'utilisateur et vérifie son appartenance à
l'organisation ; il n'écrit jamais dans la page.

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
