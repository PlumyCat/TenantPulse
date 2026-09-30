const { randomUUID } = require("crypto");
const { getAuthContext, hasRole } = require("../shared/auth");
const { tagsClient } = require("../shared/tableClient");

/* Boutons libres de la barre de navigation. Une ligne par bouton dans la table Tags,
   partition « navlink ». Le choix d'une ligne par bouton plutôt qu'un tableau JSON dans
   une ligne unique évite la lecture-modification-écriture : deux admins qui ajoutent un
   bouton chacun de leur côté ne s'écrasent pas l'un l'autre.

   MIGRATION : la première version rangeait le bouton unique en « config »/« navlink ».
   La lecture reprend cette ligne si elle existe, la réécrit dans la nouvelle partition et
   la supprime — sans quoi le bouton déjà publié disparaîtrait à la mise à jour. */
const PARTITION = "navlink";
const LEGACY_PARTITION = "config";
const LEGACY_ROW = "navlink";

const LIBELLE_MAX = 32;
const URL_MAX = 2048;
/* La barre n'est pas extensible. Au-delà, les boutons chassent les onglets, qui sont les
   commandes de l'application. Refus explicite plutôt qu'un débordement silencieux. */
const BOUTONS_MAX = 5;
/* Un bouton permanent est légitime (lien vers un intranet, une procédure). L'échéance est
   donc facultative, mais bornée : une date à dix ans est une faute de frappe. */
const ECHEANCE_MAX_MS = 365 * 24 * 3600 * 1000;
const COLOR_RE = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;
const COULEUR_DEFAUT = "#4B3FBE";

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
    id:        e.rowKey,
    label:     e.label,
    url:       e.url,
    color:     COLOR_RE.test(e.color || "") ? e.color : COULEUR_DEFAUT,
    createdAt: e.createdAt || e.publishedAt || null,
    expiresAt: e.expiresAt || null
  };
}

const expire = e => e.expiresAt && new Date(e.expiresAt) <= new Date();

/* Reprise de la ligne unique de la première version. Silencieuse et idempotente : une
   fois déplacée, la ligne d'origine n'existe plus et cette fonction ne fait plus rien. */
async function migrerLigneHeritee() {
  let e = null;
  try { e = await tagsClient.getEntity(LEGACY_PARTITION, LEGACY_ROW); } catch { return; }
  if (!e || !e.label || !e.url) return;

  if (!expire(e) && urlValide(e.url)) {
    try {
      await tagsClient.upsertEntity({
        partitionKey: PARTITION,
        rowKey:       randomUUID(),
        label:        e.label,
        url:          e.url,
        color:        COLOR_RE.test(e.color || "") ? e.color : COULEUR_DEFAUT,
        createdAt:    e.publishedAt || new Date().toISOString(),
        expiresAt:    e.expiresAt || null,
        publishedBy:  e.publishedBy || null
      }, "Replace");
    } catch { return; }   // en cas d'échec on garde la ligne d'origine plutôt que de la perdre
  }
  try { await tagsClient.deleteEntity(LEGACY_PARTITION, LEGACY_ROW); } catch {}
}

/* Liste les boutons vivants et purge les expirés au passage. L'expiration est évaluée
   côté serveur : l'horloge du poste client n'est pas une référence, et un bouton périmé
   ne doit pas dépendre d'elle pour disparaître. */
async function listerBoutons() {
  const vivants = [];
  const aPurger = [];

  const q = tagsClient.listEntities({ queryOptions: { filter: `PartitionKey eq '${PARTITION}'` } });
  for await (const e of q) {
    if (!e.label || !e.url) { aPurger.push(e.rowKey); continue; }
    if (expire(e)) { aPurger.push(e.rowKey); continue; }
    /* Revalidé à la lecture, pas seulement à l'écriture : une ligne écrite sous des
       règles antérieures ne doit pas ressortir sans contrôle. */
    const href = urlValide(e.url);
    if (!href) { aPurger.push(e.rowKey); continue; }
    vivants.push(versClient({ ...e, url: href }));
  }

  for (const rk of aPurger) {
    try { await tagsClient.deleteEntity(PARTITION, rk); } catch {}
  }

  // Ordre stable : celui de création, pour que la barre ne se réorganise pas seule.
  vivants.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  return vivants;
}

/**
 * GET /api/navlink
 * Boutons courants de la barre de navigation. Les expirés sont purgés au passage.
 * Réponse : { navlinks: [{id, label, url, color, createdAt, expiresAt}] }
 * Accessible : tout utilisateur connecté et non bloqué.
 *
 * POST /api/navlink
 * Ajoute un bouton, ou en modifie un si `id` est fourni.
 * Body : { id, label, url, color, expiresAt }
 * - url : HTTPS obligatoire
 * - color : #RGB ou #RRGGBB, facultative
 * - expiresAt : date ISO de disparition, facultative (absente = permanent)
 * Accessible : admin uniquement.
 *
 * DELETE /api/navlink
 * Retire un bouton. Body : { id }. Accessible : admin uniquement.
 */
module.exports = async function (context, req) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) { context.res = json(401, { error: "Non authentifié" }); return; }
    if (auth.blocked) { context.res = json(403, { error: "Compte bloqué" }); return; }

    await migrerLigneHeritee();

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      context.res = json(200, { navlinks: await listerBoutons() });
      return;
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === "POST") {
      if (!hasRole(auth.role, "admin")) {
        context.res = json(403, { error: "Accès refusé — admin requis" });
        return;
      }

      const { id, label, url, color, expiresAt } = req.body || {};

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

      const teinte = (typeof color === "string" && COLOR_RE.test(color.trim()))
        ? color.trim()
        : COULEUR_DEFAUT;

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

      const existants = await listerBoutons();
      const modifie = typeof id === "string" && id
        ? existants.find(b => b.id === id)
        : null;

      if (typeof id === "string" && id && !modifie) {
        context.res = json(404, { error: "Bouton introuvable" });
        return;
      }
      if (!modifie && existants.length >= BOUTONS_MAX) {
        context.res = json(400, { error: `Maximum atteint (${BOUTONS_MAX} boutons)` });
        return;
      }

      const rowKey = modifie ? modifie.id : randomUUID();
      /* La date de création est conservée à la modification : c'est elle qui fixe l'ordre
         d'affichage, et modifier un libellé ne doit pas faire sauter le bouton en fin de
         barre. */
      const createdAt = modifie ? (modifie.createdAt || new Date().toISOString())
                                : new Date().toISOString();

      await tagsClient.upsertEntity({
        partitionKey: PARTITION,
        rowKey,
        label:        lib,
        url:          href,
        color:        teinte,
        createdAt,
        expiresAt:    echeance,
        publishedBy:  auth.email
      }, "Replace");

      context.res = json(200, { success: true, navlinks: await listerBoutons() });
      return;
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (req.method === "DELETE") {
      if (!hasRole(auth.role, "admin")) {
        context.res = json(403, { error: "Accès refusé — admin requis" });
        return;
      }
      const { id } = req.body || {};
      if (typeof id !== "string" || !id) {
        context.res = json(400, { error: "id est obligatoire" });
        return;
      }
      // Idempotent : retirer un bouton déjà absent n'est pas une erreur.
      try { await tagsClient.deleteEntity(PARTITION, id); } catch {}
      context.res = json(200, { success: true, navlinks: await listerBoutons() });
      return;
    }

    context.res = json(405, { error: "Méthode non supportée" });

  } catch (err) {
    context.log.error("Erreur /api/navlink :", err.message);
    context.res = json(500, { error: "Erreur serveur" });
  }
};
