const { getAuthContext, hasRole } = require("../shared/auth");
const { tagsClient } = require("../shared/tableClient");

/* Bouton libre de la barre de navigation. Même logement que le bandeau et le relais DNS :
   table Tags, partition « config », ligne unique « navlink ». Une ligne ne justifie pas
   une table Azure de plus, et les partitions ne se croisent jamais — toute lecture filtre
   sur la sienne. */
const PARTITION = "config";
const ROW = "navlink";

/* La barre de navigation n'est pas extensible : au-delà, le libellé chasse les onglets
   sur les écrans étroits. Coupé ici plutôt qu'en CSS, pour que le refus soit explicite. */
const LIBELLE_MAX = 32;
const URL_MAX = 2048;
/* Un bouton permanent est légitime (lien vers un intranet, une procédure). L'échéance est
   donc facultative, mais bornée : une date à dix ans est une faute de frappe, pas une
   intention. */
const ECHEANCE_MAX_MS = 365 * 24 * 3600 * 1000;

const json = (status, body) => ({
  status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

/* Le protocole est le seul contrôle qui compte ici, et il est absolu : « javascript: »,
   « data: » et consorts transforment un lien de navigation en exécution de code. Le
   frontend refait la même vérification avant de poser le href — un contrôle côté serveur
   ne protège pas d'une réponse forgée par un intermédiaire. */
function urlValide(raw) {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t.length > URL_MAX) return null;
  let u;
  try { u = new URL(t); } catch { return null; }
  return u.protocol === "https:" ? u.href : null;
}

function versClient(e) {
  return {
    label:       e.label,
    url:         e.url,
    publishedAt: e.publishedAt,
    expiresAt:   e.expiresAt || null
  };
}

/**
 * GET /api/navlink
 * Bouton courant de la barre de navigation, ou null s'il n'y en a pas ou s'il a expiré.
 * Accessible : tout utilisateur connecté et non bloqué.
 *
 * POST /api/navlink
 * Publie ou remplace le bouton. Body : { label, url, expiresAt }
 * - url : HTTPS obligatoire
 * - expiresAt : date ISO de disparition, facultative (absente = permanent)
 * Accessible : admin uniquement.
 *
 * DELETE /api/navlink
 * Retire le bouton immédiatement. Accessible : admin uniquement.
 */
module.exports = async function (context, req) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) { context.res = json(401, { error: "Non authentifié" }); return; }
    if (auth.blocked) { context.res = json(403, { error: "Compte bloqué" }); return; }

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      let e = null;
      try { e = await tagsClient.getEntity(PARTITION, ROW); } catch { /* aucun bouton */ }

      if (!e || !e.label || !e.url) { context.res = json(200, { navlink: null }); return; }

      /* Expiration évaluée côté serveur, comme pour le bandeau : l'horloge du poste
         client n'est pas une référence, et un bouton périmé ne doit pas dépendre d'elle
         pour disparaître. */
      if (e.expiresAt && new Date(e.expiresAt) <= new Date()) {
        try { await tagsClient.deleteEntity(PARTITION, ROW); } catch {}
        context.res = json(200, { navlink: null });
        return;
      }

      /* Revalidé à la lecture, pas seulement à l'écriture : une ligne écrite par une
         version antérieure des règles ne doit pas ressortir sans contrôle. */
      const href = urlValide(e.url);
      if (!href) { context.res = json(200, { navlink: null }); return; }

      context.res = json(200, { navlink: versClient({ ...e, url: href }) });
      return;
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === "POST") {
      if (!hasRole(auth.role, "admin")) {
        context.res = json(403, { error: "Accès refusé — admin requis" });
        return;
      }

      const { label, url, expiresAt } = req.body || {};

      const lib = typeof label === "string" ? label.trim() : "";
      if (!lib) { context.res = json(400, { error: "label est obligatoire" }); return; }
      if (lib.length > LIBELLE_MAX) {
        context.res = json(400, { error: `label trop long (${LIBELLE_MAX} caractères max)` });
        return;
      }

      const href = urlValide(url);
      if (!href) {
        context.res = json(400, { error: "url invalide — une adresse HTTPS complète est requise" });
        return;
      }

      /* Échéance facultative. Fournie, elle doit être future et raisonnable : une date
         passée retirerait le bouton à la lecture suivante, ce qui n'est jamais ce qu'on
         voulait en le publiant. */
      let echeance = null;
      if (expiresAt !== undefined && expiresAt !== null && expiresAt !== "") {
        const d = new Date(expiresAt);
        if (isNaN(d.getTime())) {
          context.res = json(400, { error: "expiresAt invalide (date ISO attendue)" });
          return;
        }
        const maintenant = Date.now();
        if (d.getTime() <= maintenant) {
          context.res = json(400, { error: "expiresAt doit être dans le futur" });
          return;
        }
        if (d.getTime() - maintenant > ECHEANCE_MAX_MS) {
          context.res = json(400, { error: "expiresAt trop lointaine (un an maximum)" });
          return;
        }
        echeance = d.toISOString();
      }

      const maintenant = new Date().toISOString();

      await tagsClient.upsertEntity({
        partitionKey: PARTITION,
        rowKey:       ROW,
        label:        lib,
        url:          href,
        publishedAt:  maintenant,
        expiresAt:    echeance,
        publishedBy:  auth.email
      }, "Replace");

      context.res = json(200, {
        success: true,
        navlink: versClient({ label: lib, url: href, publishedAt: maintenant, expiresAt: echeance })
      });
      return;
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (req.method === "DELETE") {
      if (!hasRole(auth.role, "admin")) {
        context.res = json(403, { error: "Accès refusé — admin requis" });
        return;
      }
      // Idempotent : retirer un bouton déjà absent n'est pas une erreur.
      try { await tagsClient.deleteEntity(PARTITION, ROW); } catch {}
      context.res = json(200, { success: true });
      return;
    }

    context.res = json(405, { error: "Méthode non supportée" });

  } catch (err) {
    context.log.error("Erreur /api/navlink :", err.message);
    context.res = json(500, { error: "Erreur serveur" });
  }
};
