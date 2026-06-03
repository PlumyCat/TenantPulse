const { v4: uuidv4 } = require("uuid");
const { getAuthContext, hasRole } = require("../shared/auth");
const { tagsClient, classificationsClient, requestsClient } = require("../shared/tableClient");
const { getDefaults } = require("../shared/defaults");

/* Cascade : supprime toutes les assignations + demandes en attente d'un type. */
async function cascadeDeleteType(type) {
  let removed = 0;
  try {
    for await (const c of classificationsClient.listEntities()) {
      if (c.rowKey === type) {
        try { await classificationsClient.deleteEntity(c.partitionKey, c.rowKey); removed++; } catch {}
      }
    }
  } catch {}
  try {
    const pending = requestsClient.listEntities({
      queryOptions: { filter: `PartitionKey eq 'request' and type eq '${String(type).replace(/'/g, "''")}'` }
    });
    for await (const e of pending) {
      try { await requestsClient.deleteEntity(e.partitionKey, e.rowKey); } catch {}
    }
  } catch {}
  return removed;
}

/**
 * GET /api/tags
 * Liste tous les tags custom + les tags expirés avec le tenant lié.
 * Accessible : tous les utilisateurs connectés.
 *
 * POST /api/tags
 * Crée ou modifie un tag custom.
 * Body : { tagId?, name, color, description, retentionDays, alertOnExpiry }
 * - tagId absent → création, tagId présent → modification
 * - retentionDays : null = pas de rétention
 * - alertOnExpiry : true/false
 * Accessible : manager, admin.
 *
 * DELETE /api/tags
 * Supprime un tag custom.
 * Body : { tagId }
 * Accessible : manager, admin.
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

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const tags = [];
      const now = new Date();

      const queryResults = tagsClient.listEntities({
        queryOptions: { filter: `PartitionKey eq 'tag'` }
      });

      for await (const entity of queryResults) {
        const tag = {
          tagId:         entity.rowKey,
          name:          entity.name,
          color:         entity.color,
          description:   entity.description || "",
          retentionDays: entity.retentionDays || null,
          alertOnExpiry: entity.alertOnExpiry || false,
          createdBy:     entity.createdBy,
          createdAt:     entity.createdAt
        };
        tags.push(tag);
      }

      // Pour les managers/admins : récupérer les classifications expirées
      // Modèle Classifications : partitionKey = tenantId, rowKey = type
      let expiredItems = [];
      if (hasRole(auth.role, "manager")) {
        const classResults = classificationsClient.listEntities();

        for await (const c of classResults) {
          const type = c.rowKey;
          // Trouver le tag correspondant (par id ou par nom)
          const matchingTag = tags.find(t => t.tagId === type || t.name === type);
          if (!matchingTag || !matchingTag.retentionDays) continue;

          const approvedDate = new Date(c.approvedAt);
          const expiryDate = new Date(approvedDate);
          expiryDate.setDate(expiryDate.getDate() + matchingTag.retentionDays);

          if (now > expiryDate) {
            // Expiré depuis moins de 7 jours → visible dans l'admin
            const expiredSinceDays = Math.floor((now - expiryDate) / (1000 * 60 * 60 * 24));
            if (expiredSinceDays <= 7) {
              expiredItems.push({
                tenantId:      c.partitionKey,
                domain:        c.domain || "",
                type,
                approvedAt:    c.approvedAt,
                expiredAt:     expiryDate.toISOString(),
                expiredSinceDays
              });
            }
          }
        }
      }

      // Balises par défaut (proposables par tous) — amorçage inclus
      let defaults = [];
      try { defaults = await getDefaults(); } catch {}

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags, defaults, expiredItems })
      };
      return;
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === "POST") {
      // Gestion des BALISES PAR DÉFAUT — réservé aux admins
      if (req.body && req.body.scope === "default") {
        if (!hasRole(auth.role, "admin")) {
          context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Accès refusé — admin requis" }) };
          return;
        }
        const { key, name, color, description } = req.body;
        if (!name || !color) {
          context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "name et color sont obligatoires" }) };
          return;
        }
        const id = key || uuidv4();
        // Préserver groupe/ordre si la balise existe déjà (édition)
        let group, order;
        try { const ex = await tagsClient.getEntity("default", id); group = ex.group; order = ex.order; } catch {}
        await tagsClient.upsertEntity({
          partitionKey: "default",
          rowKey:       id,
          name,
          color,
          description:  description || "",
          group:        group || ("indep:" + id),
          order:        (typeof order === "number") ? order : 99
        }, "Replace");
        context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: true, key: id }) };
        return;
      }

      if (!hasRole(auth.role, "manager")) {
        context.res = {
          status: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Accès refusé — manager minimum requis" })
        };
        return;
      }

      const { tagId, name, color, description, retentionDays, alertOnExpiry } = req.body || {};

      if (!name || !color) {
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "name et color sont obligatoires" })
        };
        return;
      }

      const id = tagId || uuidv4();
      const now = new Date().toISOString();

      await tagsClient.upsertEntity({
        partitionKey:  "tag",
        rowKey:        id,
        name,
        color,
        description:   description || "",
        retentionDays: retentionDays || null,
        alertOnExpiry: alertOnExpiry === true,
        createdBy:     auth.email,
        createdAt:     tagId ? undefined : now,
        updatedAt:     now
      }, "Replace");

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, tagId: id })
      };
      return;
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (req.method === "DELETE") {
      // Suppression d'une BALISE PAR DÉFAUT — réservé aux admins
      if (req.body && req.body.scope === "default") {
        if (!hasRole(auth.role, "admin")) {
          context.res = { status: 403, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Accès refusé — admin requis" }) };
          return;
        }
        const { key } = req.body;
        if (!key) {
          context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "key est obligatoire" }) };
          return;
        }
        try { await tagsClient.deleteEntity("default", key); }
        catch { context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Balise introuvable" }) }; return; }
        const removed = await cascadeDeleteType(key);
        context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: true, key, removedAssignments: removed }) };
        return;
      }

      if (!hasRole(auth.role, "manager")) {
        context.res = {
          status: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Accès refusé — manager minimum requis" })
        };
        return;
      }

      const { tagId } = req.body || {};

      if (!tagId) {
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "tagId est obligatoire" })
        };
        return;
      }

      try {
        await tagsClient.deleteEntity("tag", tagId);
      } catch {
        context.res = {
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Tag introuvable" })
        };
        return;
      }

      const removedAssignments = await cascadeDeleteType(tagId);

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, tagId, removedAssignments })
      };
      return;
    }

  } catch (err) {
    context.log.error("Erreur /api/tags :", err.message);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Erreur serveur" })
    };
  }
};
