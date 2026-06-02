const { v4: uuidv4 } = require("uuid");
const { getAuthContext, hasRole } = require("../shared/auth");
const { requestsClient, locksClient } = require("../shared/tableClient");
const { applyApprovedTag } = require("../shared/classify");

/**
 * POST /api/request
 * Soumet une demande de tag sur un tenant.
 *
 * Body : { tenantId, domain, type, comment }
 * - type : "direct" | "indirect" | "gdap_actif" | "gdap_non" | <tag custom>
 *
 * Comportement selon le rôle :
 * - user / moderator : crée une demande en statut "pending"
 * - manager / admin  : applique directement en statut "approved"
 *
 * Retourne : { requestId, status }
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

    const { tenantId, domain, type, comment } = req.body || {};

    if (!tenantId || !type) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "tenantId et type sont obligatoires" })
      };
      return;
    }

    // Vérification du verrou (bloque user et moderator)
    if (!hasRole(auth.role, "manager")) {
      let isLocked = false;
      try {
        await locksClient.getEntity("lock", tenantId);
        isLocked = true;
      } catch {
        try {
          await locksClient.getEntity("lock", "global");
          isLocked = true;
        } catch {
          isLocked = false;
        }
      }

      if (isLocked) {
        context.res = {
          status: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Les demandes sont verrouillées pour ce tenant" })
        };
        return;
      }
    }

    const now = new Date().toISOString();
    const requestId = uuidv4();

    // Manager / Admin → application directe sans validation
    if (hasRole(auth.role, "manager")) {
      const result = await applyApprovedTag({
        tenantId, type, domain, approvedBy: auth.email, comment
      });
      if (!result.ok) {
        context.res = {
          status: result.status || 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: result.error })
        };
        return;
      }

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: null, status: "approved" })
      };
      return;
    }

    // User / Modérateur → demande en attente
    await requestsClient.createEntity({
      partitionKey: "request",
      rowKey:       requestId,
      tenantId,
      domain:       domain || "",
      type,
      comment:      comment || "",
      requestedBy:  auth.email,
      requestedAt:  now,
      status:       "pending"
    });

    context.res = {
      status: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, status: "pending" })
    };

  } catch (err) {
    context.log.error("Erreur /api/request :", err.message);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Erreur serveur" })
    };
  }
};
