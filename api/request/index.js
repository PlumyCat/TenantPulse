const { v4: uuidv4 } = require("uuid");
const { getAuthContext, hasRole } = require("../shared/auth");
const { requestsClient, locksClient, classificationsClient } = require("../shared/tableClient");
const { applyApprovedTag, removeApprovedTag } = require("../shared/classify");

function esc(v) { return String(v).replace(/'/g, "''"); }

/**
 * POST /api/request
 * Soumet une demande de tag sur un tenant.
 *
 * Body : { tenantId, domain, type, comment, action }
 * - type   : "direct" | "indirect" | "gdap_actif" | "gdap_non" | <tag custom>
 * - action : "add" (défaut, ajout/proposition) | "remove" (demande de suppression)
 *
 * Comportement selon le rôle :
 * - user             : crée une demande en statut "pending"
 * - moderator+       : applique directement (status "approved" pour add, "removed" pour remove)
 *                      Le modérateur reste soumis au verrou du tenant (voir plus bas).
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

    // Utilisateur bloqué : on ignore silencieusement (réponse neutre).
    // Les managers+ ne sont jamais bloqués.
    if (auth.blocked && !hasRole(auth.role, "manager")) {
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: null, status: "ignored" })
      };
      return;
    }

    const { tenantId, domain, type, comment } = req.body || {};
    // Normalisation explicite : toute valeur autre que "remove" est traitée comme "add"
    const action = (req.body || {}).action === "remove" ? "remove" : "add";

    if (!tenantId || !type) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "tenantId et type sont obligatoires" })
      };
      return;
    }

    // Validation des longueurs et du format pour éviter les débordements en Table Storage
    // et limiter la surface d'attaque OData.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const TYPE_RE = /^[a-z0-9_-]{1,64}$/;
    if (typeof tenantId !== "string" || !UUID_RE.test(tenantId.trim())) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "tenantId invalide (format UUID attendu)" })
      };
      return;
    }
    if (typeof type !== "string" || !TYPE_RE.test(type)) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "type invalide (lettres minuscules, chiffres, _ et - uniquement, 64 caractères max)" })
      };
      return;
    }
    if (comment && (typeof comment !== "string" || comment.length > 500)) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "comment trop long (500 caractères max)" })
      };
      return;
    }
    if (domain && (typeof domain !== "string" || domain.length > 253)) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "domain invalide (253 caractères max)" })
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

    // Modérateur / Manager / Admin → application directe sans validation
    if (hasRole(auth.role, "moderator")) {
      if (action === "remove") {
        const result = await removeApprovedTag({ tenantId, type });
        if (!result.existed) {
          context.res = {
            status: 404,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Tag introuvable" })
          };
          return;
        }
        context.res = {
          status: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: null, status: "removed" })
        };
        return;
      }

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

    // ── Garde-fous anti-doublon (user / modérateur) ──
    if (action === "remove") {
      // Pour une demande de suppression : le tag DOIT déjà être appliqué
      try {
        await classificationsClient.getEntity(tenantId, type);
      } catch {
        context.res = {
          status: 409,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Ce tag n'est pas appliqué à ce tenant" })
        };
        return;
      }
    } else {
      // Pour un ajout : le tag ne doit PAS déjà être validé sur ce tenant
      try {
        await classificationsClient.getEntity(tenantId, type);
        context.res = {
          status: 409,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Ce tag est déjà appliqué à ce tenant" })
        };
        return;
      } catch {
        // non trouvé → OK, on continue
      }
    }

    // Délai de carence : une demande de suppression REFUSÉE pour ce tenant + type
    // bloque toute nouvelle demande de suppression pendant 24 h (anti-spam).
    if (action === "remove") {
      const REMOVAL_REJECT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
      let lastRejectedAt = 0;
      const rejectedQuery = requestsClient.listEntities({
        queryOptions: {
          filter: `PartitionKey eq 'request' and tenantId eq '${esc(tenantId)}' and type eq '${esc(type)}' and action eq 'remove' and status eq 'rejected'`
        }
      });
      for await (const r of rejectedQuery) {
        const t = r.reviewedAt ? new Date(r.reviewedAt).getTime() : 0;
        if (t > lastRejectedAt) lastRejectedAt = t;
      }
      if (lastRejectedAt) {
        const elapsed = Date.now() - lastRejectedAt;
        if (elapsed < REMOVAL_REJECT_COOLDOWN_MS) {
          const remainingH = Math.ceil((REMOVAL_REJECT_COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
          context.res = {
            status: 429,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: `Cette suppression a été refusée récemment. Réessayez dans ${remainingH} h.` })
          };
          return;
        }
      }
    }

    // Demande identique déjà en attente du même utilisateur (même action)
    const dupQuery = requestsClient.listEntities({
      queryOptions: {
        filter: `PartitionKey eq 'request' and tenantId eq '${esc(tenantId)}' and type eq '${esc(type)}' and status eq 'pending' and requestedBy eq '${esc(auth.email)}'`
      }
    });
    for await (const _dup of dupQuery) {
      if ((_dup.action || "add") !== action) continue;
      context.res = {
        status: 409,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: action === "remove"
            ? "Vous avez déjà demandé la suppression de ce tag"
            : "Vous avez déjà proposé ce tag pour ce tenant"
        })
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
      action,
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
