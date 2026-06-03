const { tagsClient } = require("./tableClient");

/**
 * Balises par défaut (proposables par tous via le bouton +).
 * Les 4 d'origine ont une exclusivité de groupe câblée (voir tagUtils.tagGroup) :
 *   - direct ⟷ indirect (groupe "classification")
 *   - gdap_actif ⟷ gdap_non (groupe "gdap")
 * Les balises par défaut AJOUTÉES par un admin sont indépendantes (cumulables).
 *
 * Stockage : table Tags, partitionKey = "default", rowKey = clé (= type).
 */
const BUILTIN_DEFAULTS = [
  { key: "direct",     name: "Direct",     color: "#16a34a", group: "classification", order: 1 },
  { key: "indirect",   name: "Indirect",   color: "#ea580c", group: "classification", order: 2 },
  { key: "gdap_actif", name: "GDAP actif", color: "#0ea5e9", group: "gdap",           order: 3 },
  { key: "gdap_non",   name: "GDAP : non", color: "#64748b", group: "gdap",           order: 4 }
];

/* Amorce les 4 balises d'origine si la partition "default" est vide. */
async function ensureSeeded() {
  let any = false;
  for await (const _e of tagsClient.listEntities({ queryOptions: { filter: "PartitionKey eq 'default'" } })) {
    any = true; break;
  }
  if (any) return;
  for (const d of BUILTIN_DEFAULTS) {
    await tagsClient.upsertEntity({
      partitionKey: "default",
      rowKey:       d.key,
      name:         d.name,
      color:        d.color,
      description:  "",
      group:        d.group,
      order:        d.order
    }, "Replace");
  }
}

/* Retourne les balises par défaut (amorçage inclus), triées par ordre. */
async function getDefaults() {
  await ensureSeeded();
  const out = [];
  for await (const e of tagsClient.listEntities({ queryOptions: { filter: "PartitionKey eq 'default'" } })) {
    out.push({
      key:         e.rowKey,
      name:        e.name,
      color:       e.color || null,
      description: e.description || "",
      group:       e.group || ("indep:" + e.rowKey),
      order:       (typeof e.order === "number") ? e.order : 99
    });
  }
  out.sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
  return out;
}

module.exports = { BUILTIN_DEFAULTS, ensureSeeded, getDefaults };
