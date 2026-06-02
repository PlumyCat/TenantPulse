const { getAuthContext, hasRole } = require("../shared/auth");
const { classificationsClient, requestsClient, locksClient } = require("../shared/tableClient");
const { tagGroup } = require("../shared/tagUtils");

/* Un tag custom appartient à un groupe "custom:*". Réservé aux managers/admins. */
function isCustomType(type) {
  return tagGroup(type).startsWith("custom:");
}

function esc(v) { return String(v).replace(/'/g, "''"); }
function json(status, body) {
  return { status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/**
 * /api/classification
 *
 * GET  ?tenantId=xxx           → tags validés + en attente + verrou pour un tenant
 * GET  ?all=1                  → tous les tags assignés (manager+) : recherche/consultation
 * DELETE { tenantId, type }    → supprime un tag validé (modérateur+)
 */
module.exports = async function (context, req) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) { context.res = json(401, { error: "Non authentifié" }); return; }

    // ── DELETE : suppression d'un tag validé (modérateur+) ──
    if (req.method === "DELETE") {
      if (!hasRole(auth.role, "moderator")) { context.res = json(403, { error: "Accès refusé" }); return; }
      const { tenantId, type } = req.body || {};
      if (!tenantId || !type) { context.res = json(400, { error: "tenantId et type sont obligatoires" }); return; }
      try {
        await classificationsClient.deleteEntity(tenantId, type);
      } catch {
        context.res = json(404, { error: "Tag introuvable" });
        return;
      }
      context.res = json(200, { success: true });
      return;
    }

    // ── GET ?all=1 : tous les tags assignés (manager+) ──
    if (req.query.all === "1") {
      if (!hasRole(auth.role, "manager")) { context.res = json(403, { error: "Accès refusé" }); return; }
      const items = [];
      for await (const e of classificationsClient.listEntities()) {
        items.push({
          tenantId:   e.partitionKey,
          type:       e.rowKey,
          domain:     e.domain || "",
          approvedBy: e.approvedBy || "",
          approvedAt: e.approvedAt || ""
        });
      }
      items.sort((a, b) => new Date(b.approvedAt) - new Date(a.approvedAt));
      context.res = json(200, { items });
      return;
    }

    // ── GET ?tenantId=xxx : détail d'un tenant ──
    const tenantId = req.query.tenantId;
    if (!tenantId) { context.res = json(400, { error: "Paramètre tenantId manquant" }); return; }

    // 1. Tags validés
    const approvedTags = [];
    const approvedQuery = classificationsClient.listEntities({
      queryOptions: { filter: `PartitionKey eq '${esc(tenantId)}'` }
    });
    for await (const e of approvedQuery) {
      approvedTags.push({
        type:       e.rowKey,
        approvedBy: e.approvedBy || "",
        approvedAt: e.approvedAt || "",
        comment:    e.comment || ""
      });
    }

    // 2. Demandes en attente — agrégées par type, pourcentage par groupe
    const pendingEntities = [];
    const pendingQuery = requestsClient.listEntities({
      queryOptions: {
        filter: `PartitionKey eq 'request' and tenantId eq '${esc(tenantId)}' and status eq 'pending'`
      }
    });
    for await (const e of pendingQuery) pendingEntities.push(e);

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
      const multiple = distinctTypesByGroup[g] && distinctTypesByGroup[g].size > 1;
      return { type, count, group: g, percent: multiple ? Math.round((count / totalByGroup[g]) * 100) : null };
    });

    // 3. Verrou
    let locked = false;
    try {
      await locksClient.getEntity("lock", tenantId);
      locked = true;
    } catch {
      try { await locksClient.getEntity("lock", "global"); locked = true; } catch { locked = false; }
    }

    // 4. Filtrage : tags custom réservés aux managers/admins
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
