const { getAuthContext } = require("../shared/auth");
const { rolesClient } = require("../shared/tableClient");

/**
 * GET /api/me
 * Retourne l'email, le nom, le rôle de l'utilisateur connecté,
 * ainsi que le contactEmail (premier admin) pour le lien de rapport de bug
 * et extensionUrl, la fiche de l'extension navigateur.
 * Réponse : { email, name, role, blocked, contactEmail, extensionUrl }
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
        extensionUrlEdge: extensionUrlEdge
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
