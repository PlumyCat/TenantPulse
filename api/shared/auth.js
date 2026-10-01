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
  return ["admin", "manager", "moderator", "tech"].includes(r) ? r : null;
}

/* ── Repli tolérant : parcours de la table Roles, mis en cache ──
   Le parcours rattrape les lignes saisies à la main avec une autre casse ou une
   autre PartitionKey. Il était refait à CHAQUE appel d'API, et deux fois (rôle puis
   blocage), pour tout utilisateur absent de la table : le cas le plus courant, le
   rôle par défaut n'étant écrit nulle part. Il est désormais mémorisé 60 s par
   instance de Function.
   Ce délai ne retarde aucune décision prise depuis l'application : POST /api/roles
   écrit la clé en minuscules, que la lecture directe trouve immédiatement, sans
   passer par ce cache. Seule une ligne modifiée à la main dans la table, et
   joignable uniquement par le parcours, peut attendre jusqu'à 60 s. */
const ROLES_PARCOURS_TTL_MS = 60 * 1000;
let rolesParcours = null; // { at, lignes: Promise<Map<rowKey minuscule, entité[]>> }

function lignesDuParcours() {
  if (rolesParcours && Date.now() - rolesParcours.at < ROLES_PARCOURS_TTL_MS) return rolesParcours.lignes;
  // La promesse est mémorisée : des appels simultanés partagent le même parcours.
  const lignes = (async () => {
    const parCle = new Map();
    for await (const e of rolesClient.listEntities()) {
      const k = String(e.rowKey).trim().toLowerCase();
      if (!parCle.has(k)) parCle.set(k, []);
      parCle.get(k).push(e);
    }
    return parCle;
  })();
  rolesParcours = { at: Date.now(), lignes };
  // Un échec n'est pas mémorisé : l'appel suivant retentera.
  lignes.catch(() => { if (rolesParcours && rolesParcours.lignes === lignes) rolesParcours = null; });
  return lignes;
}

/**
 * Rôle applicatif et blocage, en UNE lecture directe (au lieu de deux) :
 * { role: "admin" | "manager" | "moderator" | "tech" | "user", blocked: bool }
 *
 * Mêmes règles qu'auparavant, inchangées :
 * - rôle : la ligne directe (PartitionKey "role", RowKey = email en minuscules) si son
 *   rôle est valide ; sinon le premier rôle valide trouvé par le parcours ; sinon "user".
 *   Insensible à la casse de l'email, de la valeur du rôle et du nom de propriété.
 * - blocage : la propriété `role` de la ligne directe si elle existe ; sinon celle de la
 *   première ligne du parcours dont la clé correspond.
 * - table inaccessible : "user", non bloqué.
 */
const ordinal = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

async function lireRole(email) {
  if (!email) return { role: "user", blocked: false };
  const target = email.trim().toLowerCase();
  const estBloque = e => String(e.role || "").trim().toLowerCase() === "blocked";

  let direct = null;
  try { direct = await rolesClient.getEntity("role", target); } catch { /* absent */ }
  const roleDirect = direct ? normalizeRole(direct) : null;
  // Cas nominal : la ligne directe porte un rôle de la hiérarchie, rien d'autre à lire.
  if (roleDirect) return { role: roleDirect, blocked: estBloque(direct) };

  let parcours = [];
  try { parcours = (await lignesDuParcours()).get(target) || []; } catch { /* table inaccessible */ }
  /* La ligne directe fait foi sur le cache : c'est la seule que l'application écrit
     et supprime (POST /api/roles). Sa copie en cache est donc écartée et remplacée par
     la lecture fraîche, sans quoi un rôle retiré ou un blocage levé resterait effectif
     jusqu'à 60 s. On retrie ensuite comme le fait la table (PartitionKey puis RowKey,
     ordinal) : « le premier trouvé » désigne ainsi la même ligne qu'un parcours réel. */
  const cleDirecte = e => e.partitionKey === "role" && e.rowKey === target;
  const candidates = parcours.filter(e => !cleDirecte(e)).concat(direct ? [direct] : [])
    .sort((a, b) => ordinal(a.partitionKey, b.partitionKey) || ordinal(a.rowKey, b.rowKey));
  const valide = candidates.map(normalizeRole).find(Boolean);
  return {
    role: valide || "user",
    blocked: direct ? estBloque(direct) : (candidates.length > 0 && estBloque(candidates[0]))
  };
}

async function getUserRole(email) { return (await lireRole(email)).role; }
async function isBlocked(email)   { return (await lireRole(email)).blocked; }

/**
 * Helper complet : retourne { email, name, role, blocked } ou null si non connecté.
 */
async function getAuthContext(req) {
  const principal = getClientPrincipal(req);
  if (!principal || !principal.email) return null;

  const { role, blocked } = await lireRole(principal.email);
  return {
    email: principal.email,
    name:  principal.name,
    role,
    blocked
  };
}

/**
 * Vérifie que l'utilisateur a au moins le rôle requis.
 * Hiérarchie : admin > manager > moderator > tech > user
 * (tech = accès en écriture aux procédures internes, sans pouvoirs de modération)
 */
function hasRole(userRole, requiredRole) {
  const hierarchy = { user: 0, tech: 1, moderator: 2, manager: 3, admin: 4 };
  return (hierarchy[userRole] ?? 0) >= (hierarchy[requiredRole] ?? 0);
}

module.exports = { getClientPrincipal, getUserRole, isBlocked, getAuthContext, hasRole };
