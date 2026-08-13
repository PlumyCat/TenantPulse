const { tagsClient } = require("./tableClient");
const { hasRole } = require("./auth");

/* Réglages d'application, dans la table Tags, partition « config ».
   Même procédé que les balises par défaut (« default ») et le bandeau (« banner ») :
   une partition cloisonnée plutôt qu'une table Azure de plus pour quelques lignes. */
const PARTITION = "config";
const ROW_DNS_RELAY = "dnsrelay";
const ROW_GRAPH     = "graph";

/**
 * Le relais DNS est-il actif ?
 *
 * Désactivé par défaut, et volontairement : router les résolutions par le backend a un
 * coût (une analyse complète enchaîne une cinquantaine de requêtes) et fait de
 * l'application un intermédiaire sur les domaines analysés. C'est un mode de secours
 * pour les réseaux qui bloquent le DNS-over-HTTPS, pas le fonctionnement normal.
 *
 * Toute erreur de lecture retourne false : en cas de doute, on ne relaie pas.
 */
async function isDnsRelayEnabled() {
  try {
    const e = await tagsClient.getEntity(PARTITION, ROW_DNS_RELAY);
    return e.enabled === true;
  } catch {
    return false;
  }
}

/* Retourne l'état complet, pour l'affichage côté admin. */
async function getDnsRelayState() {
  try {
    const e = await tagsClient.getEntity(PARTITION, ROW_DNS_RELAY);
    return {
      enabled:   e.enabled === true,
      updatedBy: e.updatedBy || null,
      updatedAt: e.updatedAt || null
    };
  } catch {
    return { enabled: false, updatedBy: null, updatedAt: null };
  }
}

async function setDnsRelayEnabled(enabled, email) {
  const now = new Date().toISOString();
  await tagsClient.upsertEntity({
    partitionKey: PARTITION,
    rowKey:       ROW_DNS_RELAY,
    enabled:      enabled === true,
    updatedBy:    email || null,
    updatedAt:    now
  }, "Replace");
  return { enabled: enabled === true, updatedBy: email || null, updatedAt: now };
}

/* ──────────────────────────────────────────────────────────────────────────
   Accès à la connexion Microsoft Graph

   Réservé par défaut aux rôles manager et admin. Deux dérogations, cumulables :
     - mode « all »        → ouvert à tout utilisateur connecté et non bloqué
     - liste d'utilisateurs → ouverture nominative, sans toucher au rôle

   La liste vit dans cette même ligne de configuration et non dans la table Roles :
   `POST /api/roles` écrit ses entités en mode « Replace », un indicateur posé sur
   l'entité d'un utilisateur disparaîtrait donc au prochain changement de rôle.
   ────────────────────────────────────────────────────────────────────────── */

function parseUsers(raw) {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.filter(e => typeof e === "string") : [];
  } catch { return []; }
}

async function getGraphAccessState() {
  try {
    const e = await tagsClient.getEntity(PARTITION, ROW_GRAPH);
    return {
      mode:      e.mode === "all" ? "all" : "roles",
      users:     parseUsers(e.users),
      updatedBy: e.updatedBy || null,
      updatedAt: e.updatedAt || null
    };
  } catch {
    // Ligne absente = configuration par défaut, la plus restrictive.
    return { mode: "roles", users: [], updatedBy: null, updatedAt: null };
  }
}

async function saveGraphAccess(mode, users, email) {
  const now = new Date().toISOString();
  await tagsClient.upsertEntity({
    partitionKey: PARTITION,
    rowKey:       ROW_GRAPH,
    mode:         mode === "all" ? "all" : "roles",
    users:        JSON.stringify(users),
    updatedBy:    email || null,
    updatedAt:    now
  }, "Replace");
  return { mode: mode === "all" ? "all" : "roles", users, updatedBy: email || null, updatedAt: now };
}

async function setGraphMode(mode, email) {
  const cur = await getGraphAccessState();
  return saveGraphAccess(mode, cur.users, email);
}

async function setGraphUser(target, enabled, email) {
  const cur = await getGraphAccessState();
  const t   = String(target || "").trim().toLowerCase();
  const set = new Set(cur.users);
  if (enabled) set.add(t); else set.delete(t);
  return saveGraphAccess(cur.mode, [...set], email);
}

/**
 * L'utilisateur a-t-il le droit d'utiliser Microsoft Graph ?
 *
 * C'est cette réponse qui décide si /api/me sert l'identifiant client. Sans lui le
 * frontend n'affiche aucun bouton et ne peut émettre aucune requête : le contrôle
 * est côté serveur, pas côté interface. Toute erreur de lecture retourne false.
 */
async function isGraphAllowed(auth) {
  if (!auth || auth.blocked) return false;
  try {
    const st = await getGraphAccessState();
    if (st.mode === "all") return true;
    if (hasRole(auth.role, "manager")) return true;
    return st.users.includes(String(auth.email || "").trim().toLowerCase());
  } catch {
    return false;
  }
}

module.exports = {
  isDnsRelayEnabled, getDnsRelayState, setDnsRelayEnabled,
  getGraphAccessState, setGraphMode, setGraphUser, isGraphAllowed
};
