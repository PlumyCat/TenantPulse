const { getAuthContext, hasRole } = require("../shared/auth");
const { classificationsClient, requestsClient, locksClient } = require("../shared/tableClient");
const { tagGroup } = require("../shared/tagUtils");

/* Un tag custom appartient à un groupe "custom:*". Réservé aux managers/admins. */
function isCustomType(type) {
  return tagGroup(type).startsWith("custom:");
}

/**
 * GET /api/classification?tenantId=xxxx
 * Retourne tous les tags validés + les demandes en attente pour un tenant.
 *
 * Modèle Classifications : partitionKey = tenantId, rowKey = type
 * (plusieurs tags possibles par tenant).
 *
 * Réponse :
 * {
 *   approvedTags: [ { type, approvedBy, approvedAt, comment } ],
 *   pending:      [ { type, count, group, percent } ],   // percent calculé par groupe
 *   locked:       boolean
 * }
 */
module.exports = async function (context, req) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      context.res = json(401, { error: "Non authentifié" });
      return;
    }

    const tenantId = req.query.tenantId;
    if (!tenantId) {
      context.res = json(400, { error: "Paramètre tenantId manquant" });
      return;
    }

    // 1. Tags validés — query par partitionKey (= tenantId)
    const approvedTags = [];
    const approvedQuery = classificationsClient.listEntities({
      queryOptions: { filter: `PartitionKey eq '${tenantId.replace(/'/g, "''")}'` }
    });
    for await (const e of approvedQuery) {
      approvedTags.push({
        type:       e.rowKey,
        approvedBy: e.approvedBy || "",
        approvedAt: e.approvedAt || "",
        comment:    e.comment || ""
      });
    }

    // 2. Demandes en attente — agrégées par type, pourcentage calculé par groupe
    const pendingEntities = [];
    const pendingQuery = requestsClient.listEntities({
      queryOptions: {
        filter: `PartitionKey eq 'request' and tenantId eq '${tenantId.replace(/'/g, "''")}' and status eq 'pending'`
      }
    });
    for await (const e of pendingQuery) {
      pendingEntities.push(e);
    }

    // Comptage par type + total par groupe
    const countByType = {};
    const totalByGroup = {};
    const distinctTypesByGroup = {};
    for (const e of pendingEntities) {
      countByType[e.type] = (countByType[e.type] || 0) + 1;
      const g = tagGroup(e.type);
      totalByGroup[g] = (totalByGroup[g] || 0) + 1;
      (distinctTypesByGroup[g] = distinctTypesByGroup[g] || new Set()).add(e.type);
    }

    const pending = Object.entries(countByType).map(([type, count]) => {
      const g = tagGroup(type);
      // Pourcentage uniquement pertinent quand plusieurs types s'opposent dans le groupe
      const multiple = distinctTypesByGroup[g] && distinctTypesByGroup[g].size > 1;
      return {
        type,
        count,
        group: g,
        percent: multiple ? Math.round((count / totalByGroup[g]) * 100) : null
      };
    });

    // 3. Verrou : tenant spécifique ou global
    let locked = false;
    try {
      await locksClient.getEntity("lock", tenantId);
      locked = true;
    } catch {
      try {
        await locksClient.getEntity("lock", "global");
        locked = true;
      } catch {
        locked = false;
      }
    }

    // Les tags custom ne sont visibles que par les managers/admins
    let approvedOut = approvedTags;
    let pendingOut = pending;
    if (!hasRole(auth.role, "manager")) {
      approvedOut = approvedTags.filter(t => !isCustomType(t.type));
      pendingOut  = pending.filter(p => !isCustomType(p.type));
    }

    context.res = json(200, { approvedTags: approvedOut, pending: pendingOut, locked });

  } catch (err) {
    context.log.error("Erreur /api/classification :", err.message);
    context.res = json(500, { error: "Erreur serveur" });
  }
};

function json(status, body) {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
