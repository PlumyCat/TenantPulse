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
 * Normalise la valeur de rôle d'une entité, tolérant à la casse et au nom
 * de propriété (role / Role / ROLE). Retourne un rôle valide ou null.
 */
function normalizeRole(entity) {
  let r = entity.role ?? entity.Role ?? entity.ROLE ?? "";
  r = String(r).trim().toLowerCase();
  return ["admin", "manager", "moderator"].includes(r) ? r : null;
}

/**
 * Retourne le rôle applicatif de l'utilisateur :
 * "admin" | "manager" | "moderator" | "user"
 * Cherche dans la table Roles via l'email.
 *
 * Robustesse : insensible à la casse sur l'email (RowKey), la valeur du rôle
 * et le nom de la propriété. Fallback par scan si la clé exacte ne matche pas
 * (ex. PartitionKey saisie différemment lors de la création manuelle).
 */
async function getUserRole(email) {
  if (!email) return "user";
  const target = email.trim().toLowerCase();

  // 1. Cas nominal : PartitionKey "role", RowKey = email en minuscules
  try {
    const entity = await rolesClient.getEntity("role", target);
    const r = normalizeRole(entity);
    if (r) return r;
  } catch {
    // pas trouvé en lookup direct → on tente le fallback
  }

  // 2. Fallback tolérant : scan, match du RowKey insensible à la casse
  try {
    for await (const e of rolesClient.listEntities()) {
      if (String(e.rowKey).trim().toLowerCase() === target) {
        const r = normalizeRole(e);
        if (r) return r;
      }
    }
  } catch {
    // table inaccessible → utilisateur par défaut
  }

  return "user";
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
