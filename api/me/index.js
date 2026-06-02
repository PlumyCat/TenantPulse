const { getAuthContext } = require("../shared/auth");

/**
 * GET /api/me
 * Retourne l'email, le nom et le rôle de l'utilisateur connecté.
 * Réponse : { email, name, role }
 * Rôles possibles : "admin" | "manager" | "moderator" | "user"
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

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: auth.email,
        name:  auth.name,
        role:  auth.role
      })
    };

  } catch (err) {
    context.log.error("Erreur /api/me :", err.message);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Erreur serveur" })
    };
  }
};
