const { getAuthContext } = require("../shared/auth");
const { rolesClient } = require("../shared/tableClient");
const { isDnsRelayEnabled, isGraphAllowed } = require("../shared/config");

/**
 * GET /api/me
 * Retourne l'email, le nom, le rôle de l'utilisateur connecté,
 * ainsi que le contactEmail (premier admin) pour le lien de rapport de bug,
 * extensionUrl, la fiche de l'extension navigateur, graphClientId,
 * l'inscription d'application de la connexion Microsoft Graph, et copilotUrl,
 * l'URL d'incorporation de l'assistant Copilot Studio.
 * Réponse : { email, name, role, blocked, contactEmail, extensionUrl, graphClientId,
 *             copilotUrl }
 */
module.exports = async function (context, req) {
  try {
    const auth = await getAuthContext(req);

    if (!auth) {
      context.res = {
        status: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Non authentifié" })
      };
      return;
    }

    // Premier admin enregistré dans la table Roles → sert de contact pour les bug reports.
    let contactEmail = null;
    try {
      const query = rolesClient.listEntities({
        queryOptions: { filter: `PartitionKey eq 'role' and role eq 'admin'` }
      });
      for await (const e of query) {
        contactEmail = e.rowKey;
        break;
      }
    } catch { /* table inaccessible → pas de contact */ }

    /* Fiches de l'extension navigateur, servies depuis des paramètres d'application et
       non codées en dur : les fiches sont en visibilité masquée, leurs URL n'ont donc
       rien à faire dans un dépôt public. Absentes → aucun bouton n'est affiché.
       Deux magasins, car ils ne se couvrent pas l'un l'autre :
         EXTENSION_STORE_URL      → Chrome Web Store : Chrome, Vivaldi, Brave, Opera
         EXTENSION_STORE_URL_EDGE → Edge Add-ons : Edge uniquement */
    const extensionUrl     = process.env.EXTENSION_STORE_URL || null;
    const extensionUrlEdge = process.env.EXTENSION_STORE_URL_EDGE || null;

    /* Identifiant de l'inscription d'application utilisée pour la connexion
       Microsoft Graph du navigateur. Servi depuis un paramètre d'application et
       non versionné : ce n'est pas un secret au sens OAuth (un client public
       l'expose forcément), mais il identifie l'organisation, ce que les règles
       de confidentialité du dépôt interdisent d'écrire en clair.

       Il n'est servi qu'aux utilisateurs autorisés (manager/admin, mode global
       « all », ou ouverture nominative). C'est ici que se joue le contrôle
       d'accès : sans identifiant, le frontend n'affiche aucun bouton et ne peut
       émettre aucune requête Graph. Masquer un bouton ne protège rien ; ne pas
       servir l'identifiant, si. */
    let graphAccess = false;
    try { graphAccess = await isGraphAllowed(auth); } catch { /* défaut : refusé */ }
    const graphClientId = graphAccess ? (process.env.GRAPH_CLIENT_ID || null) : null;

    /* URL d'incorporation de l'assistant Copilot Studio. Servie depuis un paramètre
       d'application et jamais versionnée : elle porte l'identifiant d'environnement
       Power Platform, qui contient le GUID du tenant. Les règles de confidentialité
       du dépôt interdisent de l'écrire en clair, exactement comme GRAPH_CLIENT_ID.
       Absente → le frontend n'affiche aucun bouton et ne charge aucune iframe. */
    const copilotUrl = process.env.COPILOT_EMBED_URL || null;

    /* État du relais DNS, servi ici pour éviter un aller-retour de plus au démarrage :
       le frontend doit le connaître avant la première analyse, et il appelle déjà /api/me. */
    let dnsRelay = false;
    try { dnsRelay = await isDnsRelayEnabled(); } catch { /* défaut : pas de relais */ }

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email:        auth.email,
        name:         auth.name,
        role:         auth.role,
        blocked:      auth.blocked === true,
        contactEmail:     contactEmail || null,
        extensionUrl:     extensionUrl,
        extensionUrlEdge: extensionUrlEdge,
        graphClientId:    graphClientId,
        graphAccess:      graphAccess,
        copilotUrl:       copilotUrl,
        dnsRelay:         dnsRelay
      })
    };

  } catch (err) {
    context.log.error("Erreur /api/me :", err.message);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Erreur serveur" })
    };
  }
};
