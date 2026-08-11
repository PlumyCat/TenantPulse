const { tagsClient } = require("./tableClient");

/* Réglages d'application, dans la table Tags, partition « config ».
   Même procédé que les balises par défaut (« default ») et le bandeau (« banner ») :
   une partition cloisonnée plutôt qu'une table Azure de plus pour quelques lignes. */
const PARTITION = "config";
const ROW_DNS_RELAY = "dnsrelay";

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

module.exports = { isDnsRelayEnabled, getDnsRelayState, setDnsRelayEnabled };
