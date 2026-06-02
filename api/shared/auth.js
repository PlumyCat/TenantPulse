const { rolesClient } = require("./tableClient");

/**
 * Décode le header SWA x-ms-client-principal
 * et retourne { email, name } ou null si non connecté.
 */
function getClientPrincipal(req) {
  const header = req.headers["x-ms-client-principal"];
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    const principal = JSON.parse(decoded);

    // SWA retourne userDetails = email pour Azure AD
    return {
      email: principal.userDetails || null,
      name:  principal.userDetails || null,
      userId: principal.userId || null
    };
  } catch {
    return null;
  }
}

/**
 * Retourne le rôle applicatif de l'utilisateur :
 * "admin" | "manager" | "moderator" | "user"
 * Cherche dans la table Roles via l'email.
 */
async function getUserRole(email) {
  if (!email) return "user";

  try {
    const entity = await rolesClient.getEntity("role", email.toLowerCase());
    const role = entity.role;
    if (["admin", "manager", "moderator"].includes(role)) return role;
    return "user";
  } catch {
    // Entité introuvable = utilisateur classique
    return "user";
  }
}

/**
 * Helper complet : retourne { email, name, role } ou null si non connecté.
 */
async function getAuthContext(req) {
  const principal = getClientPrincipal(req);
  if (!principal || !principal.email) return null;

  const role = await getUserRole(principal.email);
  return {
    email: principal.email,
    name:  principal.name,
    role
  };
}

/**
 * Vérifie que l'utilisateur a au moins le rôle requis.
 * Hiérarchie : admin > manager > moderator > user
 */
function hasRole(userRole, requiredRole) {
  const hierarchy = { user: 0, moderator: 1, manager: 2, admin: 3 };
  return (hierarchy[userRole] ?? 0) >= (hierarchy[requiredRole] ?? 0);
}

module.exports = { getClientPrincipal, getUserRole, getAuthContext, hasRole };
