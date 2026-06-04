const { getAuthContext, hasRole } = require("../shared/auth");
const { requestsClient } = require("../shared/tableClient");

/**
 * GET /api/requests
 * Retourne la liste des demandes en attente.
 * Accessible : modérateur, manager, admin uniquement.
 *
 * Réponse : [
 *   {
 *     requestId, tenantId, domain, type,
 *     requestedBy, requestedAt, comment, status
 *   }
 * ]
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

    if (!hasRole(auth.role, "moderator")) {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Accès refusé — modérateur minimum requis" })
      };
      return;
    }

    const results = [];
    const queryResults = requestsClient.listEntities({
      queryOptions: {
        filter: `PartitionKey eq 'request' and status eq 'pending'`
      }
    });

    for await (const entity of queryResults) {
      results.push({
        requestId:   entity.rowKey,
        tenantId:    entity.tenantId,
        domain:      entity.domain || "",
        type:        entity.type,
        action:      entity.action || "add",
        requestedBy: entity.requestedBy,
        requestedAt: entity.requestedAt,
        comment:     entity.comment || "",
        status:      entity.status
      });
    }

    // Tri du plus récent au plus ancien
    results.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(results)
    };

  } catch (err) {
    context.log.error("Erreur /api/requests :", err.message);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Erreur serveur" })
    };
  }
};
