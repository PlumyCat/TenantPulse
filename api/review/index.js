const { getAuthContext, hasRole } = require("../shared/auth");
const { requestsClient, locksClient } = require("../shared/tableClient");
const { applyApprovedTag, removeApprovedTag } = require("../shared/classify");

/**
 * POST /api/review
 * Approuve ou rejette une demande de tag.
 * Accessible : modérateur, manager, admin uniquement.
 *
 * Body : { requestId, decision, comment }
 * - decision : "approved" | "rejected"
 *
 * Si approved :
 *   - Enregistre la classification dans Classifications
 *   - Supprime TOUTES les demandes en attente pour ce tenant (direct ET indirect)
 * Si rejected :
 *   - Met à jour le statut de la demande en "rejected"
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

    const { requestId, decision, comment } = req.body || {};

    if (!requestId || !decision) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "requestId et decision sont obligatoires" })
      };
      return;
    }

    if (!["approved", "rejected"].includes(decision)) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "decision doit être 'approved' ou 'rejected'" })
      };
      return;
    }

    // Validation : requestId est un UUID, comment est limité en longueur.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof requestId !== "string" || !UUID_RE.test(requestId.trim())) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "requestId invalide (format UUID attendu)" })
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

    // Récupérer la demande
    let requestEntity;
    try {
      requestEntity = await requestsClient.getEntity("request", requestId);
    } catch {
      context.res = {
        status: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Demande introuvable" })
      };
      return;
    }

    // Empêcher le double traitement : refuser si la demande n'est plus en attente.
    // Critique pour le cooldown 24 h : re-rejeter une demande déjà rejetée
    // mettrait à jour reviewedAt et réinitialiserait le délai de carence.
    if (requestEntity.status !== "pending") {
      context.res = {
        status: 409,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: `Cette demande a déjà été traitée (statut : ${requestEntity.status})` })
      };
      return;
    }

    const now = new Date().toISOString();

    const action = requestEntity.action || "add";

    // Vérification du verrou avant toute modification (approuvé seulement).
    // Le rejet ne modifie pas les classifications → pas de vérification nécessaire.
    if (decision === "approved") {
      let isLocked = false;
      try {
        await locksClient.getEntity("lock", requestEntity.tenantId);
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
          body: JSON.stringify({ error: "Les modifications sont verrouillées pour ce tenant" })
        };
        return;
      }
    }

    if (decision === "approved" && action === "remove") {
      // Demande de suppression validée : retire le tag (idempotent) et nettoie
      // les demandes de suppression en attente pour ce tenant + type.
      await removeApprovedTag({
        tenantId: requestEntity.tenantId,
        type:     requestEntity.type
      });

    } else if (decision === "approved") {
      // Applique le tag validé (gère exclusivité de groupe + limite + nettoyage
      // des demandes en attente du même groupe pour ce tenant)
      const result = await applyApprovedTag({
        tenantId:   requestEntity.tenantId,
        type:       requestEntity.type,
        domain:     requestEntity.domain || "",
        approvedBy: auth.email,
        comment:    comment || requestEntity.comment || ""
      });
      if (!result.ok) {
        context.res = {
          status: result.status || 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: result.error })
        };
        return;
      }

    } else {
      // Rejet : on met à jour le statut
      await requestsClient.updateEntity({
        partitionKey: "request",
        rowKey:       requestId,
        status:       "rejected",
        reviewedBy:   auth.email,
        reviewedAt:   now,
        reviewComment: comment || ""
      }, "Merge");
    }

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, decision })
    };

  } catch (err) {
    context.log.error("Erreur /api/review :", err.message);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Erreur serveur" })
    };
  }
};
