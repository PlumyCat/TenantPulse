const { getAuthContext, hasRole } = require("../shared/auth");
const { processesClient } = require("../shared/tableClient");
const { processesContainer, ensureContainer } = require("../shared/blobClient");
const { foundryConfigured, searchConfigured, chatJson, searchProcedures } = require("../shared/foundry");

// ── Limites / réglages (surchargeables par variables d'environnement) ────────
const MAX_TICKET            = 8000;   // longueur max du texte de ticket accepté
const SEARCH_TOP            = parseInt(process.env.SEARCH_TOP || "5", 10);
const MAX_CANDIDATES        = parseInt(process.env.DIAGNOSE_MAX_CANDIDATES || "3", 10);
const MAX_CONTENT_PER_PROC  = parseInt(process.env.DIAGNOSE_MAX_CONTENT || "6000", 10);
// Seuils d'ancrage : on jette les résultats trop faibles AVANT l'appel LLM n°2.
// rerankerScore ∈ [0,4] (semantic) ; @search.score n'est pas normalisé → seuil bas.
const MIN_RERANKER          = parseFloat(process.env.DIAGNOSE_MIN_RERANKER || "1.2");
const MIN_SCORE             = parseFloat(process.env.DIAGNOSE_MIN_SCORE || "0.5");

const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_RE_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function json(status, obj) {
  return { status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

// Identifiant de diagnostic volatile (jamais persisté ici ; sert au feedback).
function newDiagnosticId() {
  return "tmp-" + Math.random().toString(16).slice(2, 10);
}

// ── Prompts (FR) — voir ARCHITECTURE-IA.md §4 ────────────────────────────────

const PROMPT_ANALYSE = `Tu es un moteur d'extraction pour un assistant de support technique.
Tu NE résous PAS l'incident : tu te contentes d'en extraire les éléments structurés.
À partir du texte libre d'un ticket, renvoie UNIQUEMENT un objet JSON conforme à ce schéma :
{
  "categorie": "<catégorie technique de l'incident, ex: VPN, Messagerie, DNS, Poste de travail… ; 'Autre' si incertain>",
  "sousCategorie": "<précision ou chaîne vide>",
  "entites": {
    "utilisateur": "<nom ou identifiant réel de la personne concernée, tel qu'écrit dans le ticket ; chaîne vide si absent>",
    "ip": [], "email": [], "domaine": [], "serveur": [], "identifiantTechnique": []
  },
  "motsCles": []
}
Règles strictes :
- "utilisateur" = le nom ou identifiant RÉEL de la personne concernée, repris fidèlement du ticket (ex: "Jean Dupont", "jdupont"). Cette valeur sert uniquement au technicien pour agir ; elle n'est ni journalisée ni stockée côté serveur. Ne pseudonymise PAS.
- N'invente AUCUNE entité : si une catégorie d'entité est absente du texte, laisse le tableau vide (ou la chaîne vide pour "utilisateur").
- "identifiantTechnique" = codes d'erreur, références, numéros techniques (ex: "erreur 809").
- "motsCles" = 3 à 8 termes utiles à une recherche documentaire.
- Réponds par le JSON seul, sans texte autour.`;

const PROMPT_REPONSE = `Tu es un assistant de support technique. Tu réponds EXCLUSIVEMENT à partir des procédures fournies.
Tu n'inventes JAMAIS d'étape ni de procédure. Si aucune procédure fournie ne correspond PRÉCISÉMENT à l'incident analysé, tu le déclares.
Renvoie UNIQUEMENT un objet JSON conforme à ce schéma :
{
  "statut": "trouve | aucune | ambigu",
  "procedureId": "<l'un des id fournis, ou null>",
  "titre": "<titre de la procédure retenue, ou chaîne vide>",
  "confiance": <nombre entre 0 et 1>,
  "resume": "<résumé court ; si statut='aucune', explique pourquoi rien ne correspond>",
  "etapes": ["<étape reprise FIDÈLEMENT de la procédure retenue>", "..."],
  "alternatives": [{ "procedureId": "<id>", "titre": "<titre>", "confiance": <0..1> }],
  "informationsManquantes": ["<info qui manque pour trancher>", "..."]
}
Règles strictes :
- "procedureId" DOIT être l'un des id fournis, ou null si statut='aucune'.
- "etapes" reprend fidèlement les étapes de la procédure choisie — aucune invention.
- Utilise "ambigu" si plusieurs procédures correspondent sans départage net.
- Réponds par le JSON seul, sans texte autour.`;

// Lit le markdown complet d'une procédure depuis le Blob (chaîne vide si absent).
async function readProcedureContent(id) {
  try {
    const blob = processesContainer.getBlockBlobClient(`${id}/content.md`);
    const buf = await blob.downloadToBuffer();
    return buf.toString("utf-8");
  } catch {
    return "";
  }
}

// Décode une éventuelle chaîne base64/base64url (sinon renvoie null).
function tryBase64(s) {
  try {
    const norm = String(s).replace(/-/g, "+").replace(/_/g, "/");
    const out = Buffer.from(norm, "base64").toString("utf-8");
    // Heuristique : on ne garde que si ça redonne du texte imprimable plausible.
    return /[\x20-\x7e]/.test(out) ? out : null;
  } catch {
    return null;
  }
}

// Retrouve l'UUID de procédure dans un document de résultat Search.
// Les procédures sont stockées en Blob sous "<uuid>/content.md" : l'UUID
// apparaît donc dans le chemin source (parent_id base64, metadata_storage_path…).
// On privilégie les champs explicites, puis on balaie le document décodé.
function extractProcedureId(doc) {
  const candidates = [
    doc.procedureId, doc.parent_id, doc.parentId,
    doc.metadata_storage_path, doc.chunk_id, doc.title
  ];
  for (const v of candidates) {
    if (typeof v !== "string") continue;
    const decoded = tryBase64(v) || v;
    const m = decoded.match(UUID_RE_G) || v.match(UUID_RE_G);
    if (m) return m[0].toLowerCase();
  }
  const m = JSON.stringify(doc).match(UUID_RE_G);
  return m ? m[0].toLowerCase() : null;
}

// Un résultat passe le seuil d'ancrage ? (reranker prioritaire s'il existe)
function passesThreshold(hit) {
  if (typeof hit.rerankerScore === "number") return hit.rerankerScore >= MIN_RERANKER;
  if (typeof hit.score === "number") return hit.score >= MIN_SCORE;
  return false;
}

/**
 * POST /api/diagnose — rôle minimum : tech.
 * Body : { "ticket": "<texte libre>" }
 *
 * RAG à ancrage strict (3 étapes) :
 *   1. Analyse  — LLM extrait { categorie, entites, motsCles } (pseudonymisé).
 *   2. Recherche — AI Search (hybride + reranker) sur les procédures ; les
 *      résultats sous le seuil ne sont PAS transmis.
 *   3. Réponse  — LLM rédige une réponse cadrée à partir des SEULES procédures
 *      retenues, ou déclare statut="aucune".
 *
 * Confidentialité : le texte du ticket n'est jamais écrit sur disque ; les logs
 * ne reçoivent que diagnosticId + categorie + statut (ARCHITECTURE-IA.md §8).
 */
module.exports = async function (context, req) {
  const diagnosticId = newDiagnosticId();
  try {
    const auth = await getAuthContext(req);
    if (!auth) return void (context.res = json(401, { error: "Non authentifié" }));
    if (auth.blocked) return void (context.res = json(403, { error: "Accès refusé" }));
    if (!hasRole(auth.role, "tech")) {
      return void (context.res = json(403, { error: "Accès refusé — rôle tech ou supérieur requis" }));
    }

    if (!foundryConfigured() || !searchConfigured()) {
      return void (context.res = json(503, {
        error: "Service IA non configuré (variables FOUNDRY_* / SEARCH_* manquantes)"
      }));
    }

    const ticket = typeof (req.body && req.body.ticket) === "string" ? req.body.ticket.trim() : "";
    if (!ticket) return void (context.res = json(400, { error: "ticket est obligatoire" }));
    if (ticket.length > MAX_TICKET) {
      return void (context.res = json(400, { error: `ticket trop long (${MAX_TICKET} caractères max)` }));
    }

    await ensureContainer();

    // ── Étape 1 : analyse (extraction + pseudonymisation) ───────────────────
    let analysis;
    try {
      analysis = await chatJson([
        { role: "system", content: PROMPT_ANALYSE },
        { role: "user", content: ticket }
      ], 0);
    } catch (err) {
      context.log.error(`diagnose ${diagnosticId} étape analyse: ${err.message}`);
      return void (context.res = json(502, { error: "Échec de l'analyse du ticket", diagnosticId }));
    }
    const categorie = (analysis && analysis.categorie) || "Autre";

    // Construit la requête de recherche à partir des éléments extraits (jamais le ticket brut).
    const ent = (analysis && analysis.entites) || {};
    const searchText = [
      categorie,
      analysis && analysis.sousCategorie,
      ...(Array.isArray(analysis && analysis.motsCles) ? analysis.motsCles : []),
      ...(Array.isArray(ent.identifiantTechnique) ? ent.identifiantTechnique : []),
      ...(Array.isArray(ent.domaine) ? ent.domaine : []),
      ...(Array.isArray(ent.serveur) ? ent.serveur : [])
    ].filter(Boolean).join(" ").trim() || categorie;

    // ── Étape 2 : recherche + ancrage ───────────────────────────────────────
    let hits;
    try {
      hits = await searchProcedures(searchText, SEARCH_TOP);
    } catch (err) {
      context.log.error(`diagnose ${diagnosticId} étape recherche: ${err.message}`);
      return void (context.res = json(502, { error: "Échec de la recherche documentaire", diagnosticId }));
    }

    // Dédoublonne par procédure (un chunk = un fragment), garde le meilleur score,
    // ne conserve que ce qui passe le seuil d'ancrage et existe dans la table.
    const byProc = new Map(); // uuid -> meilleur hit
    for (const hit of hits) {
      if (!passesThreshold(hit)) continue;
      const id = extractProcedureId(hit.raw);
      if (!id || !UUID_RE.test(id)) continue;
      const best = byProc.get(id);
      const rank = (h) => (typeof h.rerankerScore === "number" ? h.rerankerScore : (h.score || 0));
      if (!best || rank(hit) > rank(best)) byProc.set(id, hit);
    }

    const candidates = [];
    for (const [id, hit] of byProc) {
      if (candidates.length >= MAX_CANDIDATES) break;
      let entity;
      try { entity = await processesClient.getEntity("process", id); }
      catch { continue; } // chunk orphelin (procédure supprimée) → on ignore
      const contenu = (await readProcedureContent(id)).slice(0, MAX_CONTENT_PER_PROC);
      candidates.push({
        procedureId: id,
        titre: entity.titre || "",
        score: typeof hit.rerankerScore === "number" ? hit.rerankerScore : hit.score,
        contenu
      });
    }

    // Aucune procédure au-dessus du seuil → "aucune" sans appel LLM n°2 (coût + ancrage).
    if (candidates.length === 0) {
      context.log(`diagnose ${diagnosticId} categorie=${categorie} statut=aucune`);
      return void (context.res = json(200, {
        analysis,
        resultat: {
          statut: "aucune",
          procedureId: null,
          titre: "",
          confiance: 0,
          resume: "Aucune procédure connue ne correspond précisément à cet incident.",
          etapes: [],
          alternatives: [],
          informationsManquantes: []
        },
        diagnosticId
      }));
    }

    // ── Étape 3 : réponse cadrée (ancrée sur les seules procédures retenues) ──
    let resultat;
    try {
      resultat = await chatJson([
        { role: "system", content: PROMPT_REPONSE },
        { role: "user", content: JSON.stringify({ analyse: analysis, procedures: candidates }) }
      ], 0);
    } catch (err) {
      context.log.error(`diagnose ${diagnosticId} étape réponse: ${err.message}`);
      return void (context.res = json(502, { error: "Échec de la rédaction de la réponse", diagnosticId }));
    }

    // Garde-fou : procedureId renvoyé doit être l'un des candidats, sinon null.
    const validIds = new Set(candidates.map((c) => c.procedureId));
    if (resultat && resultat.procedureId && !validIds.has(String(resultat.procedureId).toLowerCase())) {
      resultat.procedureId = null;
    }
    if (Array.isArray(resultat && resultat.alternatives)) {
      resultat.alternatives = resultat.alternatives.filter(
        (a) => a && validIds.has(String(a.procedureId).toLowerCase())
      );
    }

    context.log(`diagnose ${diagnosticId} categorie=${categorie} statut=${(resultat && resultat.statut) || "?"}`);
    context.res = json(200, { analysis, resultat, diagnosticId });
  } catch (err) {
    context.log.error(`diagnose ${diagnosticId} erreur: ${err.message}`);
    context.res = json(500, { error: "Erreur serveur", diagnosticId });
  }
};
