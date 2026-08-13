const { getAuthContext, hasRole } = require("../shared/auth");
const { getGraphAccessState, setGraphMode, setGraphUser } = require("../shared/config");

const json = (status, body) => ({
  status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,253}$/;

/**
 * GET /api/graph-access
 * État du contrôle d'accès à Microsoft Graph : { mode, users, updatedBy, updatedAt }.
 * Accessible : admin uniquement — la réponse contient une liste nominative
 * d'utilisateurs, elle n'a pas à être lisible par tout le monde. Un utilisateur
 * ordinaire apprend son propre droit par /api/me, qui ne lui sert l'identifiant
 * client que s'il l'a.
 *
 * POST /api/graph-access
 * Deux formes, exclusives :
 *   { mode: "roles" | "all" }       → bascule le mode global
 *   { email: "...", enabled: bool } → ouvre ou ferme l'accès à un utilisateur
 * Accessible : admin uniquement.
 *
 * Rappel de la règle appliquée par isGraphAllowed() :
 *   bloqué → non · mode "all" → oui · manager ou admin → oui · liste nominative → oui
 */
module.exports = async function (context, req) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) { context.res = json(401, { error: "Non authentifié" }); return; }
    if (auth.blocked) { context.res = json(403, { error: "Compte bloqué" }); return; }
    if (!hasRole(auth.role, "admin")) {
      context.res = json(403, { error: "Accès refusé — admin requis" });
      return;
    }

    if (req.method === "GET") {
      context.res = json(200, await getGraphAccessState());
      return;
    }

    if (req.method === "POST") {
      const body = req.body || {};

      if (typeof body.mode === "string") {
        if (!["roles", "all"].includes(body.mode)) {
          context.res = json(400, { error: 'mode doit valoir "roles" ou "all"' });
          return;
        }
        const etat = await setGraphMode(body.mode, auth.email);
        context.log.warn(`Acces Graph : mode ${body.mode} par ${auth.email}`);
        context.res = json(200, Object.assign({ success: true }, etat));
        return;
      }

      if (typeof body.email === "string") {
        const email = body.email.trim().toLowerCase();
        if (!EMAIL_RE.test(email)) {
          context.res = json(400, { error: "email invalide" });
          return;
        }
        if (typeof body.enabled !== "boolean") {
          context.res = json(400, { error: "enabled doit valoir true ou false" });
          return;
        }
        const etat = await setGraphUser(email, body.enabled, auth.email);
        context.log.warn(`Acces Graph ${body.enabled ? "ouvert" : "retire"} pour ${email} par ${auth.email}`);
        context.res = json(200, Object.assign({ success: true }, etat));
        return;
      }

      context.res = json(400, { error: "Corps attendu : { mode } ou { email, enabled }" });
      return;
    }

    context.res = json(405, { error: "Méthode non supportée" });

  } catch (err) {
    context.log.error("Erreur /api/graph-access :", err.message);
    context.res = json(500, { error: "Erreur serveur" });
  }
};
