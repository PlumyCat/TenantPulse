const { getAuthContext, hasRole } = require("../shared/auth");
const { tagsClient } = require("../shared/tableClient");

/* Le bandeau vit dans la table Tags, partition « banner », ligne unique « current ».
   Même procédé que les balises par défaut (partition « default », voir shared/defaults.js) :
   ça évite d'imposer la création d'une table Azure supplémentaire pour une seule ligne.
   Les partitions ne se croisent jamais — les lectures de tags filtrent sur 'tag' et
   'default', celle-ci sur 'banner'. */
const PARTITION = "banner";
const ROW = "current";

const COLOR_RE = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;
const ICONES = ["warning", "info"];
const MESSAGE_MAX = 280;
const DUREE_MAX_MIN = 7 * 24 * 60; // 7 jours

const json = (status, body) => ({
  status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

/* Forme renvoyée au client. `id` change à chaque publication : c'est la clé sur laquelle
   le navigateur mémorise « j'ai masqué celui-là », pour qu'un nouveau message réapparaisse
   même chez quelqu'un qui avait masqué le précédent. */
function versClient(e) {
  return {
    id:        e.rowKey + ":" + e.publishedAt,
    message:   e.message,
    color:     e.color,
    icon:      e.icon,
    publishedAt: e.publishedAt,
    expiresAt: e.expiresAt
  };
}

/**
 * GET /api/banner
 * Bandeau d'information courant, ou null s'il n'y en a pas ou s'il a expiré.
 * Accessible : tout utilisateur connecté et non bloqué.
 *
 * POST /api/banner
 * Publie ou remplace le bandeau. Body : { message, color, icon, durationMinutes }
 * - icon : "warning" (⚠️) ou "info" (ℹ️)
 * - durationMinutes : délai avant disparition automatique
 * Accessible : admin uniquement.
 *
 * DELETE /api/banner
 * Retire le bandeau immédiatement. Accessible : admin uniquement.
 */
module.exports = async function (context, req) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) { context.res = json(401, { error: "Non authentifié" }); return; }
    if (auth.blocked) { context.res = json(403, { error: "Compte bloqué" }); return; }

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      let e = null;
      try { e = await tagsClient.getEntity(PARTITION, ROW); } catch { /* aucun bandeau */ }

      if (!e || !e.message) { context.res = json(200, { banner: null }); return; }

      /* Expiration évaluée côté serveur : l'horloge du poste client n'est pas une
         référence, et un bandeau périmé ne doit pas dépendre d'elle pour disparaître. */
      if (e.expiresAt && new Date(e.expiresAt) <= new Date()) {
        try { await tagsClient.deleteEntity(PARTITION, ROW); } catch {}
        context.res = json(200, { banner: null });
        return;
      }

      context.res = json(200, { banner: versClient(e) });
      return;
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === "POST") {
      if (!hasRole(auth.role, "admin")) {
        context.res = json(403, { error: "Accès refusé — admin requis" });
        return;
      }

      const { message, color, icon, durationMinutes } = req.body || {};

      const msg = typeof message === "string" ? message.trim() : "";
      if (!msg) { context.res = json(400, { error: "message est obligatoire" }); return; }
      if (msg.length > MESSAGE_MAX) {
        context.res = json(400, { error: `message trop long (${MESSAGE_MAX} caractères max)` });
        return;
      }
      if (typeof color !== "string" || !COLOR_RE.test(color)) {
        context.res = json(400, { error: "color invalide (format #RRGGBB ou #RGB)" });
        return;
      }
      if (!ICONES.includes(icon)) {
        context.res = json(400, { error: "icon invalide", allowed: ICONES });
        return;
      }
      if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > DUREE_MAX_MIN) {
        context.res = json(400, { error: `durationMinutes invalide (entier entre 1 et ${DUREE_MAX_MIN})` });
        return;
      }

      const maintenant = new Date();
      const expiresAt = new Date(maintenant.getTime() + durationMinutes * 60000).toISOString();

      await tagsClient.upsertEntity({
        partitionKey: PARTITION,
        rowKey:       ROW,
        message:      msg,
        color,
        icon,
        publishedAt:  maintenant.toISOString(),
        expiresAt,
        publishedBy:  auth.email
      }, "Replace");

      context.res = json(200, {
        success: true,
        banner: versClient({ rowKey: ROW, message: msg, color, icon, publishedAt: maintenant.toISOString(), expiresAt })
      });
      return;
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (req.method === "DELETE") {
      if (!hasRole(auth.role, "admin")) {
        context.res = json(403, { error: "Accès refusé — admin requis" });
        return;
      }
      // Idempotent : retirer un bandeau déjà absent n'est pas une erreur.
      try { await tagsClient.deleteEntity(PARTITION, ROW); } catch {}
      context.res = json(200, { success: true });
      return;
    }

    context.res = json(405, { error: "Méthode non supportée" });

  } catch (err) {
    context.log.error("Erreur /api/banner :", err.message);
    context.res = json(500, { error: "Erreur serveur" });
  }
};
