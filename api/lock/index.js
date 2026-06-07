const { getAuthContext, hasRole } = require("../shared/auth");
const { locksClient } = require("../shared/tableClient");

/**
 * GET /api/lock?tenantId=xxxx (optionnel)
 * Retourne le statut de verrouillage.
 * - Sans tenantId → statut du verrou global
 * - Avec tenantId  → statut du verrou sur ce tenant + global
 * Accessible : tous les utilisateurs connectés.
 *
 * POST /api/lock
 * Pose un verrou global ou sur un tenant spécifique.
 * Body : { tenantId?, reason? }
 * - tenantId absent → verrou global
 * - tenantId présent → verrou sur ce tenant uniquement
 * Accessible : manager, admin.
 *
 * DELETE /api/lock
 * Retire un verrou global ou sur un tenant spécifique.
 * Body : { tenantId? }
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
      const tenantId = req.query.tenantId;
      const result = { globalLock: null, tenantLock: null };

      // Vérifier le verrou global
      try {
        const globalEntity = await locksClient.getEntity("lock", "global");
        result.globalLock = {
          lockedBy: globalEntity.lockedBy,
          lockedAt: globalEntity.lockedAt,
          reason:   globalEntity.reason || ""
        };
      } catch {
        result.globalLock = null;
      }

      // Vérifier le verrou sur le tenant si fourni
      if (tenantId) {
        try {
          const tenantEntity = await locksClient.getEntity("lock", tenantId);
          result.tenantLock = {
            tenantId,
            lockedBy: tenantEntity.lockedBy,
            lockedAt: tenantEntity.lockedAt,
            reason:   tenantEntity.reason || ""
          };
        } catch {
          result.tenantLock = null;
        }
      }

      result.isLocked = result.globalLock !== null || result.tenantLock !== null;

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result)
      };
      return;
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === "POST") {
      if (!hasRole(auth.role, "manager")) {
        context.res = {
          status: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Accès refusé — manager minimum requis" })
        };
        return;
      }

      const { tenantId, reason } = req.body || {};
      const lockKey = tenantId || "global";

      // Validation : tenantId doit être un UUID si fourni, reason est limitée en longueur.
      if (tenantId !== undefined && tenantId !== null) {
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (typeof tenantId !== "string" || !UUID_RE.test(tenantId.trim())) {
          context.res = {
            status: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "tenantId invalide (format UUID attendu)" })
          };
          return;
        }
      }
      if (reason && (typeof reason !== "string" || reason.length > 500)) {
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "reason trop longue (500 caractères max)" })
        };
        return;
      }

      await locksClient.upsertEntity({
        partitionKey: "lock",
        rowKey:       lockKey,
        lockedBy:     auth.email,
        lockedAt:     new Date().toISOString(),
        reason:       reason || ""
      }, "Replace");

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          type:    tenantId ? "tenant" : "global",
          lockKey
        })
      };
      return;
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (req.method === "DELETE") {
      if (!hasRole(auth.role, "manager")) {
        context.res = {
          status: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Accès refusé — manager minimum requis" })
        };
        return;
      }

      const { tenantId } = req.body || {};
      const lockKey = tenantId || "global";

      // Validation : tenantId doit être un UUID si fourni.
      if (tenantId !== undefined && tenantId !== null) {
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (typeof tenantId !== "string" || !UUID_RE.test(tenantId.trim())) {
          context.res = {
            status: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "tenantId invalide (format UUID attendu)" })
          };
          return;
        }
      }

      try {
        await locksClient.deleteEntity("lock", lockKey);
      } catch {
        context.res = {
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Verrou introuvable" })
        };
        return;
      }

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          type:    tenantId ? "tenant" : "global",
          lockKey
        })
      };
      return;
    }

  } catch (err) {
    context.log.error("Erreur /api/lock :", err.message);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Erreur serveur" })
    };
  }
};
