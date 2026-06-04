const { getAuthContext, hasRole } = require("../shared/auth");
const { classificationsClient, requestsClient, locksClient } = require("../shared/tableClient");
const { tagGroup } = require("../shared/tagUtils");

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
      // Liste des tenants connus — accessible à tout utilisateur connecté (lecture seule)
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
    const removalByType = {};
    for (const e of pendingEntities) {
      // Les demandes de suppression sont comptées à part : elles concernent un
      // tag déjà validé, pas une proposition d'ajout.
      if ((e.action || "add") === "remove") {
        removalByType[e.type] = (removalByType[e.type] || 0) + 1;
        continue;
      }
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

    // Demandes de suppression en attente, par type (pour marquer les badges validés)
    const pendingRemovals = Object.entries(removalByType).map(([type, count]) => ({ type, count }));

    // Délai de carence : demandes de suppression refusées il y a moins de 24 h.
    // Permet à l'UI de désactiver le bouton « demander la suppression ».
    const REMOVAL_REJECT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const cooldownByType = {};
    const rejectedQuery = requestsClient.listEntities({
      queryOptions: {
        filter: `PartitionKey eq 'request' and tenantId eq '${esc(tenantId)}' and action eq 'remove' and status eq 'rejected'`
      }
    });
    for await (const e of rejectedQuery) {
      if (!e.reviewedAt) continue;
      const until = new Date(e.reviewedAt).getTime() + REMOVAL_REJECT_COOLDOWN_MS;
      if (until > nowMs && until > (cooldownByType[e.type] || 0)) cooldownByType[e.type] = until;
    }
    const removalCooldowns = Object.entries(cooldownByType).map(([type, until]) => ({ type, until: new Date(until).toISOString() }));

    // 3. Verrou
    let locked = false;
    try {
      await locksClient.getEntity("lock", tenantId);
      locked = true;
    } catch {
      try { await locksClient.getEntity("lock", "global"); locked = true; } catch { locked = false; }
    }

    // Tags custom visibles par tous (lecture seule) — pas de filtrage ici.
    // La proposition/création de tags custom reste réservée aux managers/admins.
    context.res = json(200, { approvedTags, pending, pendingRemovals, removalCooldowns, locked });

  } catch (err) {
    context.log.error("Erreur /api/classification :", err.message);
    context.res = json(500, { error: "Erreur serveur" });
  }
};
