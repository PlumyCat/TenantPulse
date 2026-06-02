/**
 * Utilitaires de gestion des tags partagés entre les fonctions API.
 */

// Nombre maximum de tags validés simultanés par tenant (custom inclus).
const MAX_TAGS_PER_TENANT = 10;

/**
 * Retourne le "groupe" d'un type de tag.
 * Les tags d'un même groupe sont MUTUELLEMENT EXCLUSIFS :
 *   - "classification" : direct ⟷ indirect
 *   - "gdap"           : gdap_actif ⟷ gdap_non
 *   - "custom:<id>"    : chaque tag custom est son propre groupe (cumulables entre eux)
 */
function tagGroup(type) {
  if (type === "direct" || type === "indirect") return "classification";
  if (type === "gdap_actif" || type === "gdap_non") return "gdap";
  return "custom:" + type;
}

module.exports = { MAX_TAGS_PER_TENANT, tagGroup };
