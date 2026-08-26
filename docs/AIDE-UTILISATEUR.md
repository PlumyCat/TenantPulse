---
titre: TenantPulse - Aide utilisateur
type: base-de-connaissances
destinataire: agent copilot d'assistance TenantPulse
version_app: v2.0
maj: 2026-08-26
langue: fr
---

# TenantPulse : base de connaissances utilisateur

> Document source de l'agent copilot d'assistance TenantPulse.
> Chaque section est **autonome** : elle se comprend sans lire les autres, pour rester
> exploitable une fois découpée en fragments par le moteur de recherche de l'agent.
> Les chemins de clic sont écrits sous la forme `Menu > Sous-menu > Élément`.

---

## 1. Ce qu'est TenantPulse

TenantPulse est un outil interne de diagnostic **Microsoft 365** destiné au support.
À partir d'un domaine, d'une adresse e-mail ou d'un Tenant ID, il retrouve le tenant
Microsoft du client, contrôle l'hygiène DNS de sa messagerie, identifie l'hébergeur et le
registrar, et ouvre en un clic les centres d'administration du client.

L'application regroupe **deux outils** dans une même interface, séparés par les onglets de
la barre violette :

| Onglet | Rôle |
|---|---|
| **Diagnostic M365** | Tenant ID, DNS, sécurité de la messagerie, WHOIS, hébergeur, classification des tenants. C'est l'outil principal. |
| **Diagnostic Messagerie** | Analyse d'en-têtes d'e-mail (SPF/DKIM/DMARC, EOP, chaîne SMTP, URLs). Marqué `dev`. 100 % local. |

Trois principes de fonctionnement à connaître, car ils expliquent beaucoup de
comportements de l'outil :

1. **Tout part de votre navigateur.** Les analyses interrogent directement les APIs
   publiques (Microsoft, résolveurs DNS-over-HTTPS, RDAP). Aucun serveur intermédiaire ne
   reçoit les domaines analysés.
2. **Rien n'est conservé par défaut.** L'historique des Tenant ID est désactivé au départ,
   et quand il est activé il reste dans le navigateur.
3. **Seules les classifications sont partagées.** Les badges posés sur les tenants
   (Direct, Indirect, GDAP...) vivent côté serveur pour être visibles par toute l'équipe.

### Ce que TenantPulse ne fait pas

- Il **ne modifie rien** chez le client : aucune écriture, aucune action d'administration.
- Il **ne lit pas les boîtes aux lettres** ni les documents.
- Il **ne remplace pas** les centres d'administration Microsoft : il y conduit.
- Il **ne donne pas d'accès** à un tenant client. Les tuiles ouvrent les portails avec
  **vos** droits existants (délégation CSP ou GDAP) ; sans droits, Microsoft refusera.

---

## 2. Vocabulaire

| Terme | Signification dans TenantPulse |
|---|---|
| **Tenant ID** | Identifiant unique (GUID) de l'annuaire Microsoft 365 / Entra ID d'une organisation. C'est la donnée centrale de l'outil. |
| **Analyse rapide** | Bouton « Tenant ID » : identification du tenant + DNS de base. Quelques secondes. |
| **Analyse complète** | Bouton « Analyse » : ajoute l'audit de sécurité DNS avec un score, le WHOIS et la détection de l'hébergeur. |
| **Indice de confiance** | Note de 0 à 100 sur la fiabilité de l'identification du tenant (voir section 5). |
| **Hero** | Le grand bloc coloré en haut des résultats : Tenant ID, indice de confiance, badges, tuiles d'accès aux portails. |
| **Panneau de détail** | Le volet qui s'ouvre à droite quand on clique sur une carte de résultat. |
| **Badge / tag / classification** | Étiquette posée sur un tenant et partagée avec l'équipe (Direct, Indirect, GDAP actif...). |
| **Annuaire des tenants** | Répertoire partagé de tous les tenants déjà classés. |
| **DoH (DNS-over-HTTPS)** | Manière dont le navigateur interroge le DNS en HTTPS. TenantPulse utilise Cloudflare puis Google en secours. |
| **Posture** | Bloc de sécurité du tenant client (Secure Score, MFA, conformité des appareils...), disponible seulement avec Microsoft Graph. |
| **GDAP** | Relation d'administration déléguée granulaire entre le partenaire et le tenant client. Elle a une date de fin. |
| **Attestation** | Preuve, vérifiée par le serveur, que vous appartenez bien à l'organisation. Elle conditionne le fonctionnement de l'extension navigateur. |

---

## 3. Se connecter, rôles et droits

### Connexion

L'application est **entièrement privée**. L'accès passe par un compte Microsoft de
l'organisation (Entra ID). Toute page ouverte sans session redirige vers la connexion
Microsoft. Le bouton **Déconnexion** est en haut à droite de la barre noire.

Votre rôle est affiché **en bas à gauche** de l'écran (`Rôle : ...`). L'infobulle de cette
mention rappelle le compte connecté.

### Les cinq rôles, du moins au plus large

| Rôle | Ce qu'il ajoute par rapport au précédent |
|---|---|
| **Utilisateur** | Analyser, consulter l'annuaire, proposer une classification, demander le retrait d'un badge. |
| **Tech** | Accès en écriture aux procédures internes. Aucun pouvoir de modération. |
| **Modérateur** | Valider ou rejeter les propositions de classification, supprimer un badge validé. Voit le sous-onglet « Demandes ». |
| **Manager** | Appliquer un badge directement (sans validation), créer et modifier les définitions de balises, verrouiller un tenant, gérer les rôles tech et modérateur, accès à Microsoft Graph. |
| **Admin** | Tout ce qui précède, plus : publier le bandeau d'information, activer le relais DNS, ouvrir l'accès Graph, gérer les rôles manager. |

Les droits sont **cumulatifs** : un admin possède tous les droits d'un manager, qui possède
tous ceux d'un modérateur, etc.

### Compte bloqué

Un compte peut être **bloqué** par un manager ou un admin. Il conserve la lecture mais ses
propositions de classification n'aboutissent plus : le bouton `+` du hero devient inerte.
Si vos propositions ne partent plus sans message d'erreur, c'est la première piste.

---

## 4. Lancer une analyse

### Ce que l'on peut saisir

Le champ en haut de la colonne de gauche accepte **trois formes** :

- un **domaine** : `contoso.com` ;
- une **adresse e-mail** : `prenom.nom@contoso.com` (le domaine est extrait automatiquement) ;
- un **Tenant ID** (GUID) : l'outil part alors du tenant et retrouve ce qu'il peut.

### Les deux profondeurs d'analyse

| Bouton | Contenu | Durée indicative |
|---|---|---|
| **Tenant ID** (analyse rapide) | Tenant ID Microsoft, détection Google Workspace, MX/SPF/TXT de base | quelques secondes |
| **Analyse** (analyse complète) | Ajoute l'audit de sécurité DNS scoré (SPF, DKIM, DMARC, DNSSEC, MTA-STS, BIMI), le WHOIS/RDAP et la détection de l'hébergeur | plus long, une cinquantaine de résolutions DNS |

Raccourci : la touche **Entrée** dans le champ lance l'analyse rapide.

Après une analyse rapide, un bouton **« Lancer l'analyse complète »** apparaît sous les
résultats. Il n'y a jamais besoin de ressaisir le domaine.

### Mode automatique (un seul bouton)

Dans `Profils > TenantPulse > Mode d'analyse`, deux réglages :

- **Automatique** : un seul bouton « Tenant ID ». Il affiche d'abord le hero, puis enchaîne
  l'analyse complète en arrière-plan. Le bouton « Analyse » est masqué.
- **Manuel** : les deux boutons sont présents, chacun se lance au choix.

### Suivre, annuler ou relancer une étape

Pendant l'analyse, une liste d'étapes s'affiche : `Microsoft 365`, `Microsoft Graph` (si
connecté), `DNS`, `Sécurité`, `Autres services`, `Hébergeur`. Chaque étape porte deux
boutons :

- **Annuler** : interrompt cette étape sans arrêter le reste de l'analyse ;
- **Relancer** : rejoue uniquement cette étape, utile après un délai d'attente réseau.

### Cas particulier : les adresses personnelles

Les domaines de comptes Microsoft personnels (`outlook.com`, `outlook.fr`, `hotmail.fr`,
`live.com`, `msn.com` et leurs déclinaisons) ne sont **pas** interrogés côté tenant :
ce sont des comptes grand public, pas des organisations. L'absence de Tenant ID est le
résultat attendu, pas une panne.

---

## 5. Lire le résultat

### Le hero

Le grand bloc en haut de la colonne centrale rassemble :

- le libellé **Microsoft Tenant ID** et le **GUID**, avec un bouton **Copier** ;
- le **nom du tenant** et son domaine par défaut, si Microsoft Graph est connecté ;
- l'**indice de confiance** avec un « i » qui détaille son calcul ;
- les **badges de classification** du tenant et le bouton `+` pour en proposer un ;
- une **pastille GDAP** (si Graph est connecté) indiquant l'état de la relation déléguée ;
- un **marqueur « compte admin »** (icône personnage à côté du GUID) : un interrupteur local
  pour noter qu'un compte d'administration a été créé chez ce client. Il reste dans votre
  navigateur et réapparaît ensuite dans l'historique et dans l'annuaire ;
- les **tuiles d'accès** aux centres d'administration du client.

### L'indice de confiance

Note sur 100, calculée sur quatre critères d'identification :

| Critère | Points |
|---|---|
| Un Tenant ID a été trouvé | 45 |
| Le GUID a été revalidé auprès de Microsoft | 30 |
| L'émetteur (issuer) est cohérent | 15 |
| Le point d'entrée de jetons répond | 10 |

Un indice inférieur à 100 ne veut pas dire que le Tenant ID est faux : il dit que toutes
les corroborations n'ont pas pu être obtenues. Cliquez sur le « i » à côté du score pour
voir quel critère manque.

### Les cartes de résultat

Sous le hero, une carte par famille d'informations. Un clic ouvre le **panneau de détail**
à droite :

| Carte | Contenu |
|---|---|
| **Microsoft 365 / Entra ID** | Points d'entrée du tenant, issuer, domaine par défaut, champs techniques |
| **Posture** | Sécurité du tenant client via Microsoft Graph et Lighthouse (voir section 12) |
| **Google Workspace** | Affichée uniquement si le domaine est réellement chez Google |
| **Enregistrements DNS** | MX, SPF, TXT, providers e-mail détectés |
| **Santé / Sécurité** | Score d'hygiène DNS détaillé (analyse complète, voir section 6) |
| **Hébergeur** | Registrar, serveurs de noms, dates de création/expiration, hébergeur déduit (analyse complète) |

### Redimensionner le panneau de détail

La poignée verticale entre la colonne centrale et le panneau se **glisse à la souris**.
Un **double-clic** dessus rétablit la largeur par défaut. La largeur choisie est mémorisée
dans le navigateur ; une fenêtre plus étroite la réduit à l'affichage sans effacer la
préférence.

---

## 6. Le score de sécurité DNS

Disponible avec l'**analyse complète**, dans la carte « Santé / Sécurité ». Il note
l'hygiène d'authentification e-mail du domaine, pas la sécurité du tenant.

C'est ici que le **SPF, le DKIM et le DMARC d'un domaine** sont contrôlés, par des requêtes
DNS. Si ces contrôles ne remontent rien alors que le Tenant ID est bien trouvé, il ne s'agit
pas d'un domaine mal configuré mais d'un blocage réseau : voir la section 22.

### Score de base, sur 100

| Contrôle | Résultat | Points |
|---|---|---|
| **MX** | Au moins un enregistrement MX | +10 |
| **SPF** | Se termine par `-all` (strict) | +25 |
| **SPF** | Se termine par `~all` (softfail) | +15 |
| **SPF** | Ni `-all` ni `~all` (permissif) | +8 |
| **SPF** | MX Microsoft 365 mais pas d'`include:spf.protection.outlook.com` | +12 |
| **SPF** | Plus de 10 résolutions DNS dans le SPF (permerror) | +5 |
| **SPF** | Absent | 0 |
| **DMARC** | `p=reject` | +35 |
| **DMARC** | `p=quarantine` | +35 |
| **DMARC** | `p=none` (surveillance seule) | +12 |
| **DMARC** | Absent | 0 |
| **DKIM** | `selector1` **et** `selector2` présents (rotation M365) | +30 |
| **DKIM** | Un seul des deux | +22 |
| **DKIM** | D'autres sélecteurs, hors M365 | +17 |
| **DKIM** | Aucun sélecteur détecté | 0 |

### Bonus de durcissement, au-dessus de 100

| Contrôle | Bonus |
|---|---|
| **MTA-STS** configuré | +6 |
| **DNSSEC** activé | +4 |
| **BIMI** configuré | +3 |

### Hors score, affiché à titre de diagnostic

Ces points n'entrent pas dans la note, mais figurent dans le panneau :

- **www** (CNAME ou A) : c'est du web, pas de l'hygiène e-mail ;
- **Autodiscover** : doit pointer vers `autodiscover.outlook.com`, sinon la configuration
  Outlook peut échouer ;
- **Enrôlement Intune** : `enterpriseregistration` et `enterpriseenrollment` sont requis
  pour l'enrôlement automatique des appareils ;
- **Teams / Skype** : `lyncdiscover` et l'enregistrement SRV de fédération sont hérités de
  Skype Entreprise. Leur absence est normale sur un tenant Teams-only.

### Comment l'expliquer à un client

Le score répond à la question : « ce domaine est-il protégé contre l'usurpation d'identité
par e-mail ? ». Les trois leviers, dans l'ordre où Microsoft recommande de les traiter :
**SPF**, puis **DKIM**, puis **DMARC**. Un DMARC en `p=none` ne protège personne, il ne fait
qu'observer.

---

## 7. Ouvrir les centres d'administration du client

Sous un tenant identifié, une tuile par portail. Un clic ouvre le portail **dans un nouvel
onglet**, positionné sur le tenant analysé.

Portails disponibles : **Partner Center, Entra ID, M365 Admin, Exchange, Intune, Teams,
SharePoint, Azure, Defender, Purview**.

### Les sous-raccourcis

Chaque tuile porte un **chevron** qui déplie un menu de destinations précises :

- **Partner Center** : Abonnements, Utilisateurs & licences, Relations de l'administrateur
- **Entra ID** : Utilisateurs, Groupes, Accès conditionnel, Journaux de connexion, Applications d'entreprise
- **M365 Admin** : Utilisateurs actifs, Licences, Domaines, Groupes, Santé des services
- **Exchange** : Boîtes aux lettres, Groupes de distribution, Règles de flux, Connecteurs, Suivi des messages
- **Intune** : Appareils, Stratégie de conformité, Applications, ASR
- **Teams** : Utilisateurs, Stratégies de réunion, Channels, Politique de messages
- **SharePoint** : Sites actifs, Politiques de partage
- **Azure** : Abonnements, Groupes de ressources, Machines virtuelles
- **Defender** : Stratégie de menace, Entités restreintes, Quarantaine, Liens fiables, Alertes, Incidents, Analyse des menaces
- **Purview** : Gestion du cycle de vie des données, eDiscovery

Un raccourci **grisé** signifie qu'une information lui manque. Cas le plus fréquent :
les raccourcis SharePoint ont besoin du nom de tenant SharePoint, déduit du CNAME DKIM
`selector1`. Si ce CNAME n'existe pas ou ne pointe pas vers Microsoft, la destination ne
peut pas être construite.

### Astuce : ouvrir dans un autre profil Edge

**Clic droit** sur une tuile, puis **« Ouvrir le lien en tant que »**, puis choisir un
**autre profil Edge**. Le portail du client s'ouvre dans le profil dédié à ce client, sans
déconnecter votre session courante.

---

## 8. Copier le rapport

Le bouton **« Copier le rapport »**, dans la colonne de gauche, place dans le presse-papiers
un résumé texte prêt à coller dans un ticket ou un e-mail : tenant, indice de confiance,
DNS, sécurité, services détectés, hébergeur.

Il apparaît **dès l'analyse rapide**. Le rapport est alors partiel : il ne contient ni la
partie sécurité ni le WHOIS tant que l'analyse complète n'a pas été lancée.

---

## 9. Classer un tenant : badges et propositions

Les badges servent à qualifier le portefeuille de clients : relation commerciale, état de
la délégation, ou toute catégorie créée par un manager. Ils sont **partagés** : ce que vous
posez est vu par toute l'équipe.

### Balises par défaut

| Balise | Sens |
|---|---|
| **Direct** | Relation commerciale directe |
| **Indirect** | Relation via un intermédiaire |
| **GDAP actif** | Une relation d'administration déléguée existe |
| **GDAP : non** | Pas de relation déléguée |

Un manager ou un admin peut créer d'autres balises, avec leur libellé et leur couleur.
Elles apparaissent alors dans le menu au même titre que les balises par défaut.

### Poser ou proposer un badge

1. Lancer une analyse sur le domaine du client.
2. Sur le hero, cliquer le bouton **`+`** à côté des badges.
3. Choisir la balise dans le menu.

Le comportement dépend du rôle :

- **Utilisateur, tech, modérateur** : le menu s'intitule « Proposer une classification ».
  La proposition part en attente et un modérateur la valide avant qu'elle n'apparaisse
  pour tout le monde.
- **Manager, admin** : le menu s'intitule « Appliquer un tag ». Le badge est posé
  immédiatement.

Un badge **en attente** s'affiche en pointillé sur le hero jusqu'à la décision.

### Demander le retrait d'un badge

- **Utilisateur, tech** : un bouton **`−`** sur le badge crée une **demande de retrait**,
  validée ensuite par un modérateur.
- **Modérateur et au-dessus** : un bouton **`×`** supprime directement le badge.

**Délai de carence de 24 h** : si une demande de retrait a été **refusée**, une nouvelle
demande sur le même tenant et la même balise est bloquée pendant 24 heures. Le bouton `−`
est alors désactivé, avec l'infobulle « Suppression refusée récemment ».

### Tenant verrouillé

Un manager peut **verrouiller** un tenant, ou activer un **verrouillage global**. Dans ce
cas :

- les boutons `+` et `−` ne répondent plus pour les rôles inférieurs à manager ;
- seuls les managers et les admins peuvent encore modifier la classification ;
- les modérateurs voient un badge « Verrouillé » à titre d'information.

### Pourquoi GDAP n'est pas posé automatiquement

La pastille GDAP du hero est lue **en direct** via Microsoft Graph à chaque analyse : elle
reflète l'état réel, avec sa date de fin. Les badges `GDAP actif` / `GDAP : non`, eux, sont
posés à la main et ne s'expirent pas tout seuls. Quand les deux se contredisent, une
pastille **« Tag GDAP à revoir »** le signale sans rien corriger : la décision reste
humaine.

---

## 10. L'annuaire des tenants

Le bouton en haut à droite de la barre noire ouvre le répertoire partagé des tenants déjà
classés. Son libellé dépend du rôle :

- **« Annuaire des tenants »** pour un utilisateur ou un tech ;
- **« Administration »** pour un modérateur et au-dessus, l'annuaire devenant alors l'un des
  sous-onglets.

L'annuaire se remplit **automatiquement** à partir des classifications validées. On y
trouve, par tenant : le domaine, le Tenant ID, les badges, et le marqueur « compte admin »
s'il a été posé.

Actions disponibles :

- **filtrer** par type de balise avec les puces en haut ;
- **rechercher** par domaine, par Tenant ID ou par nom de tag ;
- **copier** le domaine ou le Tenant ID d'une ligne.

Le compteur à côté du titre donne le nombre total de tenants référencés.

---

## 11. L'historique des Tenant ID

### État par défaut : désactivé

Rien n'est conservé d'une analyse à l'autre tant que l'historique n'est pas activé. C'est
un choix délibéré : une liste de Tenant ID est une liste de clients.

### Activer et régler

| Action | Chemin |
|---|---|
| Activer ou désactiver | `Paramètres & Confidentialité > Gestion d'historique` (interrupteur) |
| Nombre maximum de tenants conservés | `Profils > TenantPulse > Rétention de l'historique` (curseur, 0 à 40, défaut 20) |
| Durée de conservation | `Profils > TenantPulse > Rétention de l'historique` (curseur) |

Les durées disponibles, dans l'ordre du curseur : 5 min, 15 min, 30 min, 1 h, 3 h, 6 h,
12 h, **24 h (défaut)**, 3 jours, 7 jours, 14 jours, 30 jours, 90 jours, **Illimité**.

L'option « Illimité » affiche un avertissement. La raison : en cas de compromission du
navigateur (extension malveillante, vol du profil sur un poste compromis), les Tenant ID
conservés révèlent le portefeuille de clients.

### Quand le nettoyage a lieu

Les entrées expirées sont purgées **à l'ouverture de l'application**, **à chaque analyse
enregistrée** et **au changement de durée de conservation**. Rien n'est nettoyé pendant que
l'application est fermée : une purge attendue peut donc n'être visible qu'au prochain
lancement.

### Désactiver l'historique

À la désactivation, trois choix sont proposés :

- **Désactiver et supprimer les données** : l'historique existant est effacé ;
- **Désactiver sans supprimer** : les données restent, mais plus rien n'est ajouté ;
- **Annuler**.

### L'indicateur de cache

La pastille en haut de la barre noire résume l'état :

| Affichage | Signification |
|---|---|
| **X entrée(s) en cache** | Historique activé, données présentes |
| **Cache vide** | Activé, aucune entrée |
| **Cache désactivé** | Désactivé, mais des données subsistent |
| **Cache inactif** | Désactivé et aucune donnée |
| **Suppression...** | Vidage en cours |

### Consulter l'historique

Bloc **« Historique des Tenant ID »** dans la colonne de gauche. Chaque ligne donne le
domaine, un Tenant ID abrégé (copiable), l'ancienneté de l'analyse, et une pastille si un
compte admin a été marqué sur ce tenant. Un clic sur une ligne recharge l'analyse.
Le bouton **« Effacer l'historique »** vide le bloc.

---

## 12. Microsoft Graph : nom du tenant, posture, GDAP

### À quoi sert la connexion Graph

C'est un **enrichissement optionnel** : l'application fonctionne entièrement sans lui.
Une fois connecté, chaque analyse ajoute :

- le **nom du tenant** et son domaine par défaut dans le hero ;
- une **pastille GDAP** avec l'état et la date de fin de la relation déléguée ;
- une carte **Posture** résumant la sécurité du tenant client ;
- le bloc **Recherche utilisateur** dans la colonne de gauche (voir section 13).

### Qui y a droit

Par défaut, Graph est réservé aux rôles **manager** et **admin**. Un admin peut, depuis
`Administration > Accès Graph` :

- ouvrir Graph à **tout utilisateur connecté et non bloqué** (mode global) ;
- ou ouvrir l'accès **nominativement**, adresse par adresse, sans changer le rôle.

Si vous n'y avez pas droit, **le bouton n'apparaît tout simplement pas** : ce n'est pas un
bug d'affichage, le serveur ne fournit pas l'identifiant nécessaire.

### Se connecter et se déconnecter

Le bouton **« Connexion Graph »** est dans la barre noire, en haut. Il redirige vers la
connexion Microsoft, puis revient sur l'application. Une fois connecté, la pastille passe
en **« Graph connecté »** ; cliquer dessus permet de se déconnecter.

La session Graph ne survit pas à la fermeture de l'onglet. Si un admin retire votre accès,
la session en cours est coupée immédiatement.

### Ce que contient la carte Posture

Les rubriques défilent dans un carrousel ; un clic ouvre le détail :

| Rubrique | Contenu |
|---|---|
| **Niveau de sécurité** | Secure Score Microsoft du tenant, en pourcentage. Moyenne PME indiquée : 45 %. |
| **Conformité des appareils** | Appareils Intune conformes, non conformes, en période de grâce, non évalués, avec la liste des machines |
| **Authentification multifacteur** | Part des comptes couverts par le MFA |
| **Alertes ouvertes** | Alertes de sécurité en cours |
| **Vulnérabilités logicielles** | Exposition logicielle du parc |
| **Tâches de sécurisation** | Actions de durcissement recommandées et leur avancement |
| **Usage des services M365** | Adoption des services |
| **Données non disponibles** | Ce qui n'a pas pu être récupéré, et pourquoi |

La **période de grâce** est un état distinct de la non-conformité : l'appareil est hors
politique mais la contrainte n'est pas encore appliquée. Ne pas confondre les deux dans un
compte rendu client.

### Limites à connaître et à expliquer

- Les données de posture sont **agrégées périodiquement** par Microsoft, jamais en temps
  réel. La **date d'arrêté** est affichée pour cette raison.
- Un tenant **non intégré à Microsoft 365 Lighthouse** est simplement absent de la réponse :
  la carte reste vide ou incomplète, ce n'est pas une erreur de l'outil.
- Chaque jeu de données est **indépendant**. Si une autorisation manque, la rubrique
  concernée disparaît et le reste s'affiche normalement.
- Aucune donnée Graph ne transite par le serveur de l'application : le navigateur parle
  directement à Microsoft.

---

## 13. Rechercher un utilisateur sur tout le parc

### Où et quand

Le bloc **« Recherche utilisateur »**, dans la colonne de gauche, n'apparaît **que si
Microsoft Graph est connecté**. Il interroge l'ensemble des tenants gérés, sans avoir à en
choisir un.

### Comment s'en servir

1. Saisir un ou plusieurs termes dans la zone de texte : un **nom**, un **alias**, un
   **UPN** ou une **adresse e-mail**. Un terme par ligne, ou séparés.
2. Ou importer un fichier `.txt` / `.csv` avec le bouton de sélection de fichier.
3. Cliquer **Rechercher**.

Jusqu'à **20 termes** sont traités en une seule opération ; au-delà, les termes
supplémentaires sont ignorés et l'outil le signale.

### Lire les résultats

Pendant la recherche, l'état affiche le nombre de tenants interrogés et de résultats
trouvés. À la fin, un panneau liste les comptes avec une fiche copiable par ligne :
utilisateur, UPN, adresse, fonction, mobile, site, tenant, Tenant ID, Object ID.

Deux avertissements peuvent apparaître, et ils comptent :

- **« N tenant(s) n'ont pas répondu »** : un échec partiel est normal sur un grand parc.
  Un compte peut donc exister sans figurer dans la liste. Ne jamais conclure à une absence
  sur cette seule base.
- **« N terme(s) au-delà de la limite »** : la recherche a été tronquée.

### Message d'erreur courant

> « Autorisation Graph manquante (User.Read.All) sur l'inscription d'application. »

L'autorisation n'est pas accordée côté inscription d'application. C'est une action
d'administration, pas un réglage utilisateur : à remonter à un admin de l'application.

---

## 14. Diagnostic Messagerie (analyse d'en-têtes)

Sous-application accessible par l'onglet **« Diagnostic Messagerie »** de la barre violette.
Statut **`dev`** : son affichage peut changer. Elle est **100 % locale**, aucune requête
réseau n'en sort.

> **Ne pas confondre.** Cette section traite de l'analyse **d'un e-mail déjà reçu**, à partir
> de ses en-têtes. Si la question porte sur le SPF, le DKIM ou le DMARC **d'un domaine**,
> c'est l'onglet **Diagnostic M365** et son analyse complète qu'il faut regarder : voir la
> section 6 pour le calcul du score, et la section 22 pour le cas où ces enregistrements ne
> remontent pas. En cas de doute sur la question posée, c'est presque toujours l'analyse
> d'un domaine qui est en cause : c'est l'usage principal de l'outil.

### Récupérer les en-têtes

- **Outlook** : `Fichier > Propriétés > En-têtes Internet`
- **Gmail** : `Afficher l'original`
- Ou glisser un fichier `.eml` / `.txt` avec le bouton **Import .eml**

### Analyser

1. Coller les en-têtes complets dans la zone de saisie.
2. Cliquer **Analyser**, ou faire `Ctrl + Entrée`.
3. Boutons annexes : **Effacer**, **Exemple** (jeu de données de démonstration).

### Ce qui est analysé

| Bloc | Contenu |
|---|---|
| **Authentification** | SPF, DKIM, DMARC et CompAuth extraits de `Authentication-Results` |
| **EOP / Forefront** | Scores anti-spam Exchange Online Protection : SCL, CAT, SFV |
| **Signaux de phishing** | Usurpation du nom d'affichage, incohérences d'authentification, décalage temporel entre relais, formules d'urgence |
| **Message** | Sujet décodé (MIME), expéditeur, destinataires |
| **Chaîne SMTP** | Reconstitution des sauts `Received`, du départ à l'arrivée, avec distinction des IP internes |
| **URLs** | Raccourcisseurs, punycode, homoglyphes, usurpation de marque |

### Sortir un compte rendu

Deux boutons de copie :

- **Rapport client** : vulgarisé, prêt à envoyer à un utilisateur final ;
- **Rapport technique** : détaillé, pour un ticket ou une escalade.

Deux blocs dépliants complètent l'écran : **Boîte à outils** (liens d'analyse externes) et
**Glossaire des en-têtes**.

### Personnaliser la mise en page

`Profils > Diagnostic Messagerie` permet de réordonner et de masquer les blocs de résultat,
puis **Enregistrer**. Le bouton **Réinitialiser** rétablit la disposition d'origine.

---

## 15. Personnaliser l'interface (Profils)

Bouton **Profils**, en haut à droite. Deux onglets, un bouton **Enregistrer** commun.

### Onglet TenantPulse

| Réglage | Effet |
|---|---|
| **Mode d'analyse** | Automatique (un bouton qui enchaîne) ou Manuel (deux boutons). Voir section 4. |
| **Rétention de l'historique** | Nombre maximum de tenants et durée de conservation. Voir section 11. |
| **Raccourcis** | Activer ou désactiver chaque tuile de centre d'administration, et les **réordonner par glisser-déposer**. Partner Center reste épinglé en tête. |

Deux boutons de confort en bas : **Tout activer** et **Tout désactiver**.

### Onglet Diagnostic Messagerie

Ordre et visibilité des blocs de résultat de l'analyseur d'en-têtes, par glisser-déposer,
avec un bouton **Réinitialiser**.

Les préférences sont enregistrées **dans votre navigateur** : elles ne suivent pas d'un
poste à l'autre.

---

## 16. Paramètres & Confidentialité

Menu déroulant en haut à droite. Six sections.

### Apparence

**Mode sombre**. Par défaut, TenantPulse suit **automatiquement** le thème clair ou sombre
du système (Windows, Edge). L'interrupteur permet de forcer un mode.

### Gestion d'historique

Interrupteur d'activation de l'historique des Tenant ID. Voir section 11.

### Indicateur de cache

Légende des cinq états de la pastille de cache. Section de référence, sans réglage.

### Résolveur DNS

Trois choix : **Automatique** (défaut), **Cloudflare**, **Google**.

En mode automatique, l'application interroge Cloudflare et ne bascule sur Google qu'après
un échec avéré. Forcer un résolveur est utile quand l'un des deux est bloqué par le réseau
de l'entreprise.

### APIs utilisées

Liste des services publics interrogés, avec le détail de chacun au clic :
`cloudflare-dns.com`, `dns.google`, `rdap.org`, `login.microsoftonline.com`,
`accounts.google.com`. Toutes les requêtes sont **directes**, sans proxy tiers.

### Stockage local

**Inspecter les données stockées** ouvre un panneau qui énumère **tout** ce que
l'application conserve dans le navigateur, clé par clé, avec sa taille. Chaque entrée peut
être supprimée individuellement.

Le bouton **« Tout vider »** efface le stockage de session **et** le stockage persistant,
**et** ferme la session Microsoft Graph. Après cette action, il ne reste rien.

Les valeurs sensibles (jetons, vérificateurs) sont **masquées à l'affichage** : le panneau
montre ce qui est stocké, pas un secret réutilisable à l'écran.

---

## 17. Le bandeau d'information

Un admin peut publier un message qui s'affiche **en bas de l'écran** pour tout le monde :
maintenance, incident connu, information de service.

- Un **clic sur le bandeau** déroule le message en entier s'il est tronqué.
- Le bouton **✕** le masque. Le masquage vaut pour **ce message précis** : une nouvelle
  publication réapparaîtra chez tout le monde.
- Après masquage, un petit bouton **« i »** permet de le revoir.

L'expiration du message est décidée côté serveur : un bandeau périmé disparaît même si
l'horloge du poste est fausse.

---

## 18. L'extension navigateur

### Ce qu'elle apporte

Une extension Chromium (Chrome, Edge, Brave, Vivaldi, Opera) qui met la recherche de
Tenant ID et les raccourcis d'administration à un clic, sans ouvrir l'application :

- champ de recherche par **domaine, adresse e-mail ou Tenant ID** ;
- **tuiles de redirection** et sous-menus de raccourcis, dans l'ordre de votre profil ;
- **recherches récentes** ;
- **badges de classification** en lecture seule ;
- lien de pied de page vers l'application pour l'analyse approfondie.

**Hors périmètre de l'extension** : DNS, score de sécurité, WHOIS, hébergeur, pose de tags.
Pour tout cela, il faut l'application.

### Le panneau Dynamics 365

Option activable depuis la popup de l'extension : sur une fiche incident Dynamics 365, un
panneau affiche le **Tenant ID du client** directement dans le contexte du ticket.

- Il se **superpose** à la section « Santé du client » et se **replie** pour la redécouvrir.
- Si cette section est introuvable (interface renommée, autre langue), il bascule en
  **tiroir ancré à droite**, déplaçable à la main.
- Le domaine du client est lu avec **vos propres droits** Dataverse : l'extension ne voit
  rien que vous n'ayez déjà le droit de voir.

### Installation

- Voie principale : **déploiement par politique d'entreprise** sur les postes gérés, sans
  action de l'utilisateur.
- Sur un poste non géré : le bouton **« Ajouter l'extension »** de la barre noire de
  l'application conduit à la fiche du magasin, quand elle est configurée.

La barre noire de l'application indique l'état : pastille verte **« Extension active »**
avec la version en infobulle, ou bouton d'installation si elle est absente.

### Pourquoi l'extension peut être inerte

L'extension est **réservée à l'organisation**. Elle ne fonctionne qu'avec une
**attestation** d'appartenance, obtenue en ouvrant l'application, et valable **7 jours**.
Sans attestation fraîche, elle refuse de chercher et **n'émet aucune requête réseau**.

Remède : ouvrir l'application une fois dans le navigateur, l'attestation se rafraîchit
seule. C'est aussi la raison pour laquelle une personne extérieure qui installerait
l'extension n'obtiendrait qu'une coquille vide.

---

## 19. Le panneau d'administration

Bouton **« Administration »** en haut à droite, visible à partir du rôle modérateur.
Les sous-onglets apparaissent selon le rôle.

| Sous-onglet | Rôle minimum | Contenu |
|---|---|---|
| **Demandes** | Modérateur | Propositions d'ajout et de retrait de badges, à approuver ou rejeter. Un compteur signale les demandes en attente. |
| **Annuaire** | Tous | Répertoire partagé des tenants classés (section 10). |
| **Tags** | Manager | Créer, modifier et supprimer les définitions de balises et les balises par défaut. Un compteur signale les alertes de rétention. |
| **Utilisateurs** | Manager | Rôles, blocage de comptes, et **verrouillage** des tenants. Un manager gère les rôles tech et modérateur ; un admin gère en plus les managers. Le dernier admin ne peut pas être supprimé. |
| **Bandeau** | Admin | Publier, remplacer ou retirer le bandeau d'information (message, couleur, icône, durée jusqu'à 7 jours). |
| **Relais DNS** | Admin | Interrupteur du relais DNS de secours (section 20). |
| **Accès Graph** | Admin | Mode global (réservé aux managers, ou ouvert à tous) et liste nominative. |

### Verrouillage

Dans `Administration > Utilisateurs`, la section **Verrouillage des requêtes** permet de :

- **verrouiller globalement** : seuls les managers et admins peuvent encore taguer ;
- **verrouiller un tenant** en particulier, avec la même conséquence sur ce tenant.

---

## 20. Le relais DNS de secours

Quand l'étiquette **« Relais DNS actif »** apparaît dans la barre noire, les résolutions DNS
passent temporairement par le serveur de l'application, parce que le réseau bloque les
requêtes directes.

Points à connaître :

- C'est un **mode de secours temporaire**, désactivé par défaut, activable seulement par un
  admin depuis `Administration > Relais DNS`.
- Le fonctionnement normal reste la résolution **directe depuis le navigateur**.
- Ce n'est pas un correctif : le remède de fond est côté poste ou pare-feu (section 22).

---

## 21. Confidentialité : ce qui sort, ce qui reste

### Ce qui quitte le navigateur

| Destination | Donnée envoyée | Quand |
|---|---|---|
| `login.microsoftonline.com` | Le domaine analysé | À chaque recherche de Tenant ID |
| `cloudflare-dns.com` ou `dns.google` | Les noms DNS interrogés | À chaque analyse |
| `rdap.org` et registres RDAP | Le domaine analysé | Analyse complète |
| `accounts.google.com` | Le domaine analysé | Détection Google Workspace |
| `graph.microsoft.com` | Requêtes Graph | Seulement si vous êtes connecté à Graph |

Toutes ces requêtes partent **directement de votre navigateur**. Aucun serveur
intermédiaire ne les reçoit, y compris le serveur de l'application, sauf si le relais DNS
de secours a été activé par un admin.

### Ce qui reste dans le navigateur

- l'**historique des Tenant ID** (désactivé par défaut) ;
- les **profils** : ordre des raccourcis, mode d'analyse, disposition des blocs ;
- la **largeur du panneau** de détail et le **choix de résolveur DNS** ;
- le **marqueur « compte admin »** posé sur un tenant ;
- la **session Microsoft Graph** : le jeton d'actualisation est en stockage de session, il
  disparaît à la fermeture de l'onglet. Le jeton d'accès n'est jamais écrit sur disque.

### Ce qui est partagé côté serveur

Uniquement les **classifications** : tenant, balise, auteur de la validation. C'est
volontaire, c'est ce qui rend l'annuaire commun possible.

### Ce qui n'est jamais transmis

Aucun jeton et aucune réponse Microsoft Graph ne transitent par le serveur de
l'application. Aucune donnée d'analyse n'est journalisée côté serveur.

---

## 22. Dépannage

> **Un cas qui n'est pas dans cette liste, ou une piste qui ne débloque rien, se signale
> avec le lien « Report Bug(s) »**, en haut à gauche de la barre noire. Il ouvre un e-mail
> pré-rempli vers l'équipe support. C'est la seule voie de remontée, et un problème qui
> n'est pas signalé n'est jamais corrigé. À joindre : le domaine testé, la profondeur
> d'analyse utilisée, une capture de l'écran, et si possible les erreurs de la console
> du navigateur (`F12 > Console`).

### L'analyse d'un domaine ne remonte ni DMARC, ni SPF, ni DKIM, alors que le Tenant ID est trouvé

**Formulations fréquentes de ce problème** : « mon analyse ne remonte pas le DMARC »,
« je n'ai pas le SPF », « le DKIM n'apparaît pas », « la partie DNS est vide », « aucun
résultat DNS », « le score de sécurité ne s'affiche pas », « l'analyse complète ne rend
rien ». Il s'agit de l'onglet **Diagnostic M365** et de son **analyse complète** sur un
domaine, pas de l'analyseur d'en-têtes d'e-mail.

**Symptôme caractéristique.** La recherche de Tenant ID fonctionne, tout le reste est vide.
La console du navigateur montre des erreurs répétées de type
`ERR_QUIC_PROTOCOL_ERROR` ou `QUIC_NETWORK_IDLE_TIMEOUT`.

**Cause.** Les requêtes DNS-over-HTTPS sont bloquées, pas les requêtes Microsoft (qui
passent presque toujours en dérogation de proxy). Deux origines possibles :

1. **QUIC est cassé** : le pare-feu ou l'agent de sécurité laisse passer la poignée de main
   QUIC puis coupe la session UDP. Un cas observé : un agent de protection installé sur le
   poste avec le filtrage réseau actif, qui intercepte le HTTPS via un proxy TLS local,
   ce que QUIC ne permet pas.
2. **Les résolveurs DoH eux-mêmes sont bloqués** : beaucoup de produits de filtrage coupent
   le DNS-over-HTTPS par principe, puisqu'il contourne leur filtrage DNS.

**Ce que l'utilisateur peut essayer tout de suite.** Forcer l'autre résolveur dans
`Paramètres & Confidentialité > Résolveur DNS` (Cloudflare ou Google). Si les deux
échouent, c'est le cas 2 et le réglage ne suffira pas.

**Remède de fond, côté poste géré.** C'est un prérequis réseau, à traiter avec l'équipe qui
gère les postes :

- **Cas 1** : désactiver QUIC par stratégie (Edge : « Allow QUIC protocol » = Disabled ;
  Chrome : stratégie `QuicAllowed`). Le navigateur repasse en HTTP/2 sur TCP 443, que le
  proxy d'interception sait traiter.
- **Cas 2** : ajouter une exception dans le filtrage d'URL sur `cloudflare-dns.com` **et**
  `dns.google`. Les deux figurent sur les mêmes listes de blocage, d'où l'inutilité de
  basculer de l'un à l'autre dans ce cas.

Le test qui sépare les deux : appliquer la stratégie QUIC, filtrage toujours actif. Si ça
remarche, c'était le cas 1.

### « Domaine invalide »

La saisie ne contient pas de point ou n'est pas un domaine exploitable. Saisir un domaine
complet (`contoso.com`), une adresse e-mail, ou un Tenant ID.

### Aucun Tenant ID trouvé

Trois causes, dans l'ordre de fréquence :

1. Le domaine **n'est pas dans Microsoft 365**.
2. Le domaine existe chez le client mais **n'est pas vérifié** dans son tenant.
3. C'est une **adresse personnelle** (`outlook.com`, `hotmail.fr`, `live.com`...) : ces
   domaines ne sont volontairement pas interrogés.

Essayer avec le domaine principal du client plutôt qu'un alias.

### L'indice de confiance n'est pas à 100

Ce n'est pas une erreur : une corroboration n'a pas pu être obtenue. Cliquer le « i » à
côté du score pour voir laquelle. Le Tenant ID reste exploitable.

### Le bouton « Connexion Graph » n'apparaît pas

Vous n'avez pas l'accès Graph. Il est réservé aux managers et admins, sauf ouverture
explicite. Demander à un admin d'ouvrir l'accès depuis `Administration > Accès Graph`.
Masquer le bouton n'est pas cosmétique : sans autorisation, le serveur ne fournit pas
l'identifiant nécessaire, donc rien ne peut fonctionner.

### Graph est connecté mais la carte Posture est vide ou partielle

Deux explications, toutes deux normales :

- le tenant **n'est pas intégré à Microsoft 365 Lighthouse**, il est donc absent de la
  réponse ;
- une **autorisation Graph manque** pour une rubrique précise. Les autres rubriques
  s'affichent quand même. La donnée apparaîtra d'elle-même le jour où l'autorisation est
  accordée.

Rappel : les données sont agrégées périodiquement, la **date d'arrêté** est affichée.

### La recherche utilisateur ne rend rien pour un compte qui existe

Regarder l'avertissement « N tenant(s) n'ont pas répondu ». Un échec partiel est la
normale sur un grand parc : un compte peut exister sans figurer dans la liste. Relancer la
recherche, ou vérifier directement dans le tenant concerné.

### Le bouton `+` ne fait rien

Trois causes possibles :

1. le **tenant est verrouillé** et votre rôle est inférieur à manager ;
2. votre **compte est bloqué** ;
3. le tenant n'est pas **validé** (pas de GUID revalidé), le bloc de badges n'existe alors
   pas.

### Le bouton `−` d'un badge est grisé

Soit le tenant est verrouillé, soit une demande de retrait a été **refusée il y a moins de
24 heures** sur cette balise. L'infobulle du bouton précise le cas.

### L'extension ne cherche plus rien

L'attestation d'appartenance a expiré (durée de vie : 7 jours). Ouvrir l'application une
fois dans le navigateur pour la rafraîchir. Vérifier aussi la pastille d'état dans la barre
noire de l'application.

### L'historique est vide après un redémarrage

Soit l'historique n'a jamais été activé (c'est l'état par défaut), soit la durée de
conservation est écoulée. Le nettoyage n'a lieu qu'à l'ouverture de l'application, donc
une purge attendue peut n'apparaître qu'au lancement suivant.

### Un raccourci de sous-menu est grisé

Une information nécessaire à la construction du lien manque. Pour SharePoint, c'est le nom
de tenant SharePoint, déduit du CNAME DKIM `selector1` ; il est indisponible si le client
n'utilise pas le DKIM Microsoft.

### Un portail s'ouvre mais refuse l'accès

TenantPulse ne donne aucun droit : il ouvre le portail avec **vos** accès existants. Un
refus signifie que la délégation (CSP ou GDAP) manque ou a expiré sur ce client.

### Rien de tout cela ne correspond à mon problème

Signalez-le avec **« Report Bug(s) »**, en haut à gauche de la barre noire. Le lien ouvre un
e-mail pré-rempli vers l'équipe support ; il n'y a pas d'autre canal, et un comportement que
personne ne remonte reste tel quel.

C'est aussi la voie à emprunter pour : un message d'erreur inattendu, un écran resté vide,
un résultat qui semble faux, une autorisation Microsoft Graph manquante, une demande
d'ouverture d'accès, un changement de rôle, ou le déverrouillage d'un tenant.

---

## 23. Questions fréquentes, formulées comme elles sont posées

- **« Comment je trouve le Tenant ID d'un client ? »** Section 4.
- **« C'est quoi la différence entre les deux boutons ? »** Section 4.
- **« Pourquoi mon analyse ne trouve rien sur le DNS ? »** Section 22, premier cas.
- **« Comment j'ouvre le portail Exchange du client ? »** Section 7.
- **« Comment j'ouvre le portail d'un client dans un autre profil Edge ? »** Section 7.
- **« Comment je colle le résultat dans un ticket ? »** Section 8.
- **« C'est quoi le score sur 100 ? »** Section 6.
- **« Pourquoi le score dépasse 100 ? »** Section 6, bonus de durcissement.
- **« Comment je mets un client en Direct ou Indirect ? »** Section 9.
- **« Ma proposition de tag n'apparaît pas, pourquoi ? »** Section 9, validation par un modérateur.
- **« Comment j'enlève un badge posé par erreur ? »** Section 9.
- **« Pourquoi je ne peux plus demander la suppression d'un tag ? »** Section 9, carence de 24 h.
- **« Où je vois la liste de tous les clients référencés ? »** Section 10.
- **« Comment j'active l'historique ? »** Section 11.
- **« Combien de temps mes analyses sont gardées ? »** Section 11.
- **« Est-ce que mes recherches sont envoyées quelque part ? »** Section 21.
- **« Comment je supprime tout ce que l'appli a stocké ? »** Section 16, Stockage local.
- **« Comment je change l'ordre des boutons de portails ? »** Section 15.
- **« Comment je passe en mode sombre ? »** Section 16, Apparence.
- **« À quoi sert la connexion Graph ? »** Section 12.
- **« Pourquoi je n'ai pas le bouton Graph ? »** Section 22.
- **« Comment je retrouve un utilisateur sans savoir chez quel client il est ? »** Section 13.
- **« Comment j'analyse un mail de phishing ? »** Section 14.
- **« Où je récupère les en-têtes d'un mail dans Outlook ? »** Section 14.
- **« À quoi sert l'extension ? »** Section 18.
- **« L'extension ne marche pas, elle est vide. »** Section 18 et section 22.
- **« C'est quoi l'étiquette Relais DNS actif ? »** Section 20.
- **« C'est quoi mon rôle et qu'est-ce que je peux faire ? »** Section 3.
- **« Comment je signale un bug ? »** Section 24.

---

## 24. Aide dans l'application et signalement

- **Guide intégré** : le bouton **« i »** à côté du titre « Diagnostic Microsoft 365 »
  ouvre la fiche « Prise en main de TenantPulse », un résumé en dix points des
  fonctionnalités principales.
- **Signaler un bug** : le lien **« Report Bug(s) »**, en haut à gauche de la barre noire,
  ouvre un e-mail pré-rempli à destination de l'équipe support.

Éléments utiles à joindre à un signalement : le domaine testé, la profondeur d'analyse
utilisée, la capture de l'écran de résultat, et le cas échéant les erreurs de la console du
navigateur (`F12 > Console`).

---

## 25. Limites connues

- **Diagnostic Messagerie** est marqué `dev` : son affichage et ses blocs peuvent évoluer.
- Les données de **posture** ne sont pas en temps réel et dépendent de l'éligibilité du
  tenant à Microsoft 365 Lighthouse.
- La **recherche utilisateur** peut rendre une liste incomplète quand des tenants ne
  répondent pas. L'outil le signale, il ne le masque pas.
- Les **profils et l'historique** sont locaux au navigateur : ils ne suivent pas d'un poste
  à l'autre, ni d'un profil de navigateur à l'autre.
- L'**analyse complète** enchaîne une cinquantaine de résolutions DNS. Sur un réseau lent
  ou filtré, elle peut être sensiblement plus longue que l'analyse rapide.
