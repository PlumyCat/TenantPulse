const { v4: uuidv4 } = require("uuid");
const { getAuthContext, hasRole } = require("../shared/auth");
const { feedbackClient } = require("../shared/tableClient");

// Durée de rétention des feedbacks : 7 jours (ARCHITECTURE-IA.md §8).
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const UUID_RE        = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIAGNOSTIC_RE  = /^tmp-[a-z0-9]{1,32}$/i;
const VERDICTS       = ["ok", "mauvais"];

function json(status, obj) {
  return { status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

/**
 * Purge opportuniste : supprime les feedbacks expirés (expiresAt < maintenant).
 * Best-effort, non bloquant pour la réponse.
 *
 * Note : les Functions managées d'Azure Static Web Apps ne supportent que les
 * déclencheurs HTTP (pas de timerTrigger fiable). On purge donc à chaque
 * écriture plutôt que via un timer. Un vrai timer quotidien nécessiterait une
 * Function App autonome.
 */
async function purgeExpiredFeedback(context) {
  const nowIso = new Date().toISOString();
  try {
    // expiresAt est une chaîne ISO : l'ordre lexicographique == l'ordre chronologique.
    const expired = feedbackClient.listEntities({
      queryOptions: { filter: `PartitionKey eq 'feedback' and expiresAt lt '${nowIso}'` }
    });
    for await (const e of expired) {
      try { await feedbackClient.deleteEntity(e.partitionKey, e.rowKey); } catch {}
    }
  } catch (err) {
    context.log(`feedback purge ignorée: ${err.message}`);
  }
}

/**
 * POST /api/feedback — rôle minimum : tech.
 * Body : { diagnosticId: "tmp-xxxx", procedureId: "<uuid>", verdict: "ok"|"mauvais" }
 *
 * Enregistre le verdict d'un technicien sur une procédure proposée par le
 * diagnostic, avec expiration à 7 jours. Sert la boucle d'amélioration (un
 * modérateur corrige procédure/mapping). Le texte du ticket n'est jamais reçu ici.
 */
module.exports = async function (context, req) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return void (context.res = json(401, { error: "Non authentifié" }));
    if (auth.blocked) return void (context.res = json(403, { error: "Accès refusé" }));
    if (!hasRole(auth.role, "tech")) {
      return void (context.res = json(403, { error: "Accès refusé — rôle tech ou supérieur requis" }));
    }

    const body = req.body || {};
    const diagnosticId = typeof body.diagnosticId === "string" ? body.diagnosticId.trim() : "";
    const procedureId  = typeof body.procedureId === "string" ? body.procedureId.trim().toLowerCase() : "";
    const verdict      = typeof body.verdict === "string" ? body.verdict.trim().toLowerCase() : "";

    if (!DIAGNOSTIC_RE.test(diagnosticId)) return void (context.res = json(400, { error: "diagnosticId invalide" }));
    if (!UUID_RE.test(procedureId))        return void (context.res = json(400, { error: "procedureId invalide" }));
    if (!VERDICTS.includes(verdict))       return void (context.res = json(400, { error: "verdict invalide (ok | mauvais)" }));

    const now = new Date();
    await feedbackClient.createEntity({
      partitionKey: "feedback",
      rowKey:       uuidv4(),
      diagnosticId,
      procedureId,
      verdict,
      createdBy:    auth.email,
      createdAt:    now.toISOString(),
      expiresAt:    new Date(now.getTime() + TTL_MS).toISOString()
    });

    // Purge des entrées expirées (best-effort, ne bloque pas la réponse).
    await purgeExpiredFeedback(context);

    context.res = json(200, { success: true });
  } catch (err) {
    context.log.error(`feedback erreur: ${err.message}`);
    context.res = json(500, { error: "Erreur serveur" });
  }
};
