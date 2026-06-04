const { classificationsClient, requestsClient } = require("./tableClient");
const { tagGroup, MAX_TAGS_PER_TENANT } = require("./tagUtils");

/**
 * Applique un tag validé à un tenant (modèle multi-tags).
 * Classifications : partitionKey = tenantId, rowKey = type.
 *
 * Gère :
 *  - l'exclusivité de groupe (direct⟷indirect, gdap_actif⟷gdap_non)
 *  - la limite MAX_TAGS_PER_TENANT
 *  - le nettoyage des demandes en attente du MÊME groupe
 *
 * Retourne { ok: true } ou { ok: false, error, status }.
 */
async function applyApprovedTag({ tenantId, type, domain, approvedBy, comment }) {
  const group = tagGroup(type);

  // 1. Récupérer les tags déjà validés pour ce tenant
  const existing = [];
  const q = classificationsClient.listEntities({
    queryOptions: { filter: `PartitionKey eq '${escapeOData(tenantId)}'` }
  });
  for await (const e of q) existing.push(e);

  // 2. Limite : refuser si on dépasse 10 tags distincts
  const alreadyHasType = existing.some(e => e.rowKey === type);
  const sameGroupExisting = existing.filter(e => tagGroup(e.rowKey) === group && e.rowKey !== type);
  // Après opération : on retire les autres du même groupe, on ajoute/maj le type courant
  const projectedCount = existing.length - sameGroupExisting.length + (alreadyHasType ? 0 : 1);
  if (projectedCount > MAX_TAGS_PER_TENANT) {
    return { ok: false, status: 409, error: `Limite de ${MAX_TAGS_PER_TENANT} tags atteinte pour ce tenant` };
  }

  // 3. Exclusivité : supprimer les autres tags du même groupe (classification / gdap)
  //    Les groupes custom:* ne contiennent qu'un seul type → rien à exclure.
  for (const e of sameGroupExisting) {
    try { await classificationsClient.deleteEntity(e.partitionKey, e.rowKey); } catch {}
  }

  // 4. Upsert du tag validé
  await classificationsClient.upsertEntity({
    partitionKey: tenantId,
    rowKey:       type,
    tenantId,
    type,
    domain:       domain || "",
    approvedBy:   approvedBy || "",
    approvedAt:   new Date().toISOString(),
    comment:      comment || ""
  }, "Replace");

  // 5. Nettoyer les demandes en attente du même groupe pour ce tenant
  const pending = requestsClient.listEntities({
    queryOptions: {
      filter: `PartitionKey eq 'request' and tenantId eq '${escapeOData(tenantId)}' and status eq 'pending'`
    }
  });
  for await (const e of pending) {
    if (tagGroup(e.type) === group) {
      try { await requestsClient.deleteEntity(e.partitionKey, e.rowKey); } catch {}
    }
  }

  return { ok: true };
}

/**
 * Retire un tag validé d'un tenant (opération idempotente).
 * Classifications : partitionKey = tenantId, rowKey = type.
 *
 * Gère :
 *  - la suppression de la classification si elle existe
 *  - le nettoyage des demandes de suppression (action "remove") en attente
 *    pour ce tenant + ce type
 *
 * Retourne { ok: true, existed: <bool> }.
 */
async function removeApprovedTag({ tenantId, type }) {
  // 1. Suppression de la classification (idempotent : absente = succès)
  let existed = false;
  try {
    await classificationsClient.deleteEntity(tenantId, type);
    existed = true;
  } catch {
    existed = false;
  }

  // 2. Nettoyer les demandes de suppression en attente pour ce tenant + type
  const pending = requestsClient.listEntities({
    queryOptions: {
      filter: `PartitionKey eq 'request' and tenantId eq '${escapeOData(tenantId)}' and type eq '${escapeOData(type)}' and status eq 'pending'`
    }
  });
  for await (const e of pending) {
    if ((e.action || "add") === "remove") {
      try { await requestsClient.deleteEntity(e.partitionKey, e.rowKey); } catch {}
    }
  }

  return { ok: true, existed };
}

function escapeOData(v) {
  return String(v).replace(/'/g, "''");
}

module.exports = { applyApprovedTag, removeApprovedTag, escapeOData };
