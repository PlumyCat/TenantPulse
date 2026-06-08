const { getAuthContext } = require("../shared/auth");
const { rolesClient } = require("../shared/tableClient");

/**
 * GET /api/me
 * Retourne l'email, le nom, le rôle de l'utilisateur connecté,
 * ainsi que le contactEmail (premier admin) pour le lien de rapport de bug.
 * Réponse : { email, name, role, blocked, contactEmail }
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

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email:        auth.email,
        name:         auth.name,
        role:         auth.role,
        blocked:      auth.blocked === true,
        contactEmail: contactEmail || null
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
