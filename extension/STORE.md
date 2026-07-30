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
> Le Chrome Web Store couvre les autres navigateurs Chromium, mais demande des frais
> d'inscription uniques : à faire plus tard. Le champ correspondant existe déjà côté
> application.

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

## Objet unique (single purpose)

Le Chrome Web Store exige une déclaration d'objet unique.

```
Objet unique : identifier le tenant Microsoft 365 d'un domaine et ouvrir les centres
d'administration Microsoft correspondants. Toutes les fonctions de l'extension servent
ce seul objectif.
```

---

## Justification des autorisations

À recopier dans les champs correspondants de la console (chaque autorisation demande sa
propre justification).

| Autorisation | Justification à saisir |
|---|---|
| `storage` | `Conserve localement le profil de raccourcis synchronisé depuis l'application TenantPulse, la dernière recherche saisie et le thème clair/sombre utilisé pour adapter l'icône. Aucune de ces données ne quitte le navigateur.` |
| `login.microsoftonline.com` | `Endpoint OpenID Connect public de Microsoft, interrogé en lecture seule pour résoudre et valider le Tenant ID d'un domaine. Requête anonyme, sans authentification.` |
| `cloudflare-dns.com` | `Une unique requête DNS-over-HTTPS sur l'enregistrement CNAME DKIM du domaine, nécessaire pour construire l'URL du centre d'administration SharePoint. Seul le nom de domaine est transmis.` |
| `https://*.azurestaticapps.net/*` (script de contenu) | `Origine de l'application web TenantPulse. Un script de contenu y lit la configuration de raccourcis de l'utilisateur pour que l'extension reflète ses réglages, et vérifie son appartenance à l'organisation. Lecture seule, aucune écriture dans la page.` |

> L'origine exacte de l'application n'est pas reproduite ici : c'est un domaine de production,
> que la section « Confidentialité » de `../CLAUDE.md` interdit de versionner. La retrouver dans
> `extension/local-config.json` (hors dépôt) au moment de remplir le formulaire.

**Code distant** : répondre **non** — tout le code est inclus dans le paquet, aucun script
n'est chargé depuis un serveur.

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
