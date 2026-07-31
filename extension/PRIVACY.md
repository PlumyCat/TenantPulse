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

**L'application web TenantPulse** — le script de contenu y appelle `/api/me`, en même origine,
pour vérifier que l'utilisateur appartient bien à l'organisation. Cet appel n'a lieu que sur
l'origine de l'application, et uniquement lorsque l'utilisateur la visite.

Aucune de ces requêtes ne transporte d'identifiant personnel ajouté par l'extension.

---

## Ce que l'extension ne fait pas

- Elle ne transmet **aucune** donnée à l'auteur de l'extension.
- Elle ne vend, ne loue et ne partage **aucune** donnée avec des tiers.
- Elle ne contient **ni analytique, ni télémétrie, ni traceur, ni publicité**.
- Elle ne lit **pas** l'historique de navigation, les onglets ouverts, les identifiants
  enregistrés ni le contenu des pages visitées.
- Elle ne s'exécute sur **aucun** site en dehors de l'application TenantPulse elle-même. Le
  motif déclaré dans son manifeste est générique, mais le script vérifie l'origine à l'exécution
  et reste inactif partout ailleurs.
- Elle n'écrit **jamais** dans les pages web.
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
email address or a name — plus the last query typed and the current colour theme.

**Transmitted**, only on user action: the entered domain or tenant identifier to Microsoft's
public OpenID Connect endpoint (`login.microsoftonline.com`); a domain name to Cloudflare's
DNS-over-HTTPS service (`cloudflare-dns.com`) for a single CNAME lookup used to build the
SharePoint admin URL; and a same-origin `/api/me` call to the companion application to verify
organisation membership.

**Never done**: no data is sent to the extension author; nothing is sold, rented or shared with
third parties; no analytics, telemetry, tracking or advertising; no reading of browsing history,
open tabs, stored credentials or visited page content; no execution on any site other than the
companion application; no writing into web pages; no remote code.

**Deletion**: uninstalling the extension removes all of its stored data.

**Contact**: <https://github.com/PlumyCat/TenantPulse/issues>
