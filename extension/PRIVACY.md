# Règles de confidentialité — extension TenantPulse

*Dernière mise à jour : 31 juillet 2026 · Version 0.1.0*

L'extension TenantPulse est un outil d'administration Microsoft 365 à usage interne. Ce document
décrit précisément les données qu'elle traite, où elles vont, et ce qu'elle ne fait pas.

---

## Ce que l'extension conserve, et où

Toutes les données restent **dans le navigateur de l'utilisateur**, via l'API `chrome.storage.local`.
Elles ne sont transmises à aucun serveur de l'auteur, et l'auteur n'y a aucun accès.

| Donnée | Origine | Rôle |
|---|---|---|
| Profil de raccourcis | Recopié depuis l'application web TenantPulse | Savoir quels centres d'administration afficher, et dans quel ordre |
| Historique des recherches | Recopié depuis l'application web, **uniquement si l'utilisateur l'a activé** dans celle-ci | Proposer les recherches récentes, et retrouver le domaine associé à un Tenant ID |
| Attestation d'appartenance | Réponse du point de terminaison `/api/me` de l'application | Déverrouiller l'extension. Se limite à une date, un rôle et un indicateur de blocage — **jamais l'adresse e-mail, jamais le nom** |
| Dernière recherche saisie | Saisie de l'utilisateur | La restituer à la réouverture de la fenêtre |
| Thème clair ou sombre | Réglage du système | Adapter l'icône de la barre d'outils |
| Domaines corrigés à la main | Saisie de l'utilisateur dans le panneau Dynamics | Retenir le domaine d'un client dont la fiche n'en donne aucun, pour ne pas le ressaisir. Associé à l'identifiant technique du compte — **jamais à son nom** |
| Panneau replié ou déplié | Geste de l'utilisateur | Restituer le panneau dans l'état où il a été laissé |
| Dernier signe de vie du panneau | Fonctionnement interne | Diagnostic affiché dans la fenêtre de l'extension : un horodatage et un statut, **jamais un domaine, un identifiant ni un nom** |
| Annuaire des classifications | Recopié depuis l'application (`/api/classification?all=1`) | Afficher les badges de classification d'un tenant sans réinterroger l'API. Se limite à des identifiants de tenant, des types de tag et leurs dates de validation — **l'adresse du validateur (`approvedBy`) est écartée avant écriture** |

L'historique peut contenir des noms de domaine et les identifiants de tenant correspondants. Il
n'est recopié que si l'utilisateur a explicitement activé l'historique dans l'application ; s'il
le désactive, l'extension cesse d'en conserver une copie.

---

## Ce que l'extension transmet, et à qui

Trois destinations, toutes déclenchées par une action de l'utilisateur.

**`login.microsoftonline.com`** — endpoint OpenID Connect public de Microsoft. Reçoit le domaine
ou l'identifiant de tenant saisi, afin de résoudre puis valider le Tenant ID. Requête anonyme,
en lecture seule, sans authentification.

**`cloudflare-dns.com`** — service DNS-over-HTTPS. Reçoit un nom de domaine, pour une unique
résolution d'enregistrement CNAME servant à construire l'URL du centre d'administration
SharePoint.

**L'application web TenantPulse** — le script de contenu y appelle `/api/me`, pour vérifier que
l'utilisateur appartient bien à l'organisation, ainsi que `/api/classification` et `/api/tags`
pour recopier l'annuaire des classifications. Ces appels sont en **même origine**, n'ont lieu que
sur l'origine de l'application et uniquement lorsque l'utilisateur la visite : c'est la seule
façon pour l'extension d'atteindre ces données, une requête partie d'elle-même étant inter-site
et donc dépourvue du cookie de session. Ils sont tous en lecture seule — l'extension n'écrit
jamais dans l'application.

**L'instance Dynamics 365 de l'organisation**, si et seulement si l'utilisateur a activé le
panneau Dynamics — une permission **optionnelle**, refusée par défaut. L'extension y lit alors,
en même origine et via l'API OData officielle, le site web et l'adresse de contact du client de
la fiche ouverte, afin d'en déduire un domaine. Cette lecture s'effectue avec les droits propres
de l'utilisateur : elle ne donne accès à rien qu'il ne puisse déjà consulter à l'écran. Les noms
et adresses lus servent au seul calcul du domaine — ils ne sont ni conservés, ni journalisés, ni
transmis. Seul le domaine obtenu part ensuite vers les endpoints publics décrits plus haut.

Aucune de ces requêtes ne transporte d'identifiant personnel ajouté par l'extension.

---

## Ce que l'extension ne fait pas

- Elle ne transmet **aucune** donnée à l'auteur de l'extension.
- Elle ne vend, ne loue et ne partage **aucune** donnée avec des tiers.
- Elle ne contient **ni analytique, ni télémétrie, ni traceur, ni publicité**.
- Elle ne lit **pas** l'historique de navigation, les onglets ouverts, les identifiants
  enregistrés ni le contenu des pages visitées.
- Elle ne s'exécute que sur **deux** origines : l'application TenantPulse, et — uniquement si
  l'utilisateur a accordé la permission optionnelle — l'instance Dynamics 365 de l'organisation.
  Les motifs déclarés dans son manifeste sont génériques, mais les scripts vérifient l'origine à
  l'exécution et restent inactifs partout ailleurs.
- Elle n'écrit dans une page web que pour **afficher son propre panneau**, sur l'instance
  Dynamics de l'organisation et seulement si l'utilisateur a accordé la permission optionnelle.
  Ce panneau est isolé dans un Shadow DOM, superposé à la page : il ne modifie, ne remplit et
  ne soumet **aucun** champ de Dynamics, et ne touche à aucune donnée du CRM.
- Elle ne charge **aucun** code distant : tout le code est inclus dans le paquet publié.
- Elle ne crée aucun compte et ne demande aucun mot de passe.

---

## Durée de conservation et suppression

Les données restent stockées tant que l'extension est installée. L'attestation d'appartenance
expire d'elle-même au bout de sept jours, après quoi l'extension se reverrouille.

Pour tout effacer, il suffit de **désinstaller l'extension** : le navigateur supprime alors
l'intégralité de son stockage local. Vider l'historique depuis l'application web efface également
la copie détenue par l'extension.

---

## Modifications

Toute évolution de ces règles sera publiée à cette même adresse, avec la date de mise à jour
en tête de document.

## Contact

Pour toute question relative à ces règles, ouvrir une demande sur le dépôt du projet :
<https://github.com/PlumyCat/TenantPulse/issues>

---

# Privacy Policy — TenantPulse extension (English summary)

TenantPulse is an internal Microsoft 365 administration tool.

**Stored locally, in the browser only** (`chrome.storage.local`): the shortcut profile and search
history mirrored from the companion web application (history only when the user has enabled it
there), a membership attestation limited to a timestamp, a role and a blocked flag — never an
email address or a name — plus the last query typed, the current colour theme, and, for the
optional Dynamics panel, any domain the user corrected by hand (keyed by the account's technical
identifier, never its name), a timestamped status used for diagnostics, and a mirrored directory
of tenant classifications (tenant identifiers, tag types and approval dates — the approver's
address is stripped before storage).

**Transmitted**, only on user action: the entered domain or tenant identifier to Microsoft's
public OpenID Connect endpoint (`login.microsoftonline.com`); a domain name to Cloudflare's
DNS-over-HTTPS service (`cloudflare-dns.com`) for a single CNAME lookup used to build the
SharePoint admin URL; and same-origin calls to the companion application (`/api/me` to verify
organisation membership, `/api/classification` and `/api/tags` to mirror the classification
directory), all read-only and only while the user is visiting the application.

**Dynamics 365 panel** — an **optional** permission, denied by default. Once granted, the
extension reads the open case's customer website and contact address from the organisation's own
Dynamics instance, same-origin, through the official OData API and with the user's own
permissions. Those values are used solely to derive a domain; they are never stored, logged or
transmitted. Only the resulting domain reaches the public endpoints described above.

**Never done**: no data is sent to the extension author; nothing is sold, rented or shared with
third parties; no analytics, telemetry, tracking or advertising; no reading of browsing history,
open tabs, stored credentials or visited page content; no execution on any origin other than the
companion application and — with explicit permission — the organisation's Dynamics instance; no
remote code. The only thing ever written into a web page is the extension's own panel, isolated
in a Shadow DOM and overlaid on the page: it never modifies, fills or submits a Dynamics field.

**Deletion**: uninstalling the extension removes all of its stored data.

**Contact**: <https://github.com/PlumyCat/TenantPulse/issues>
