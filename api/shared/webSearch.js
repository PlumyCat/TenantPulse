// Recherche web de SECOURS via Azure AI Foundry « Grounding with Bing Search ».
//
// Appelé UNIQUEMENT quand aucune procédure interne ne correspond (cf.
// api/diagnose : branche candidates.length === 0). Sert à proposer des PISTES
// externes (Microsoft Learn / answers.microsoft.com), jamais une procédure
// interne. Le résultat est toujours présenté à part, étiqueté « à vérifier ».
//
// Confidentialité (ARCHITECTURE-IA.md §8) : on n'envoie au web QUE des mots-clés
// génériques (catégorie + sousCatégorie + motsCles). JAMAIS le ticket brut ni
// AUCUNE entité (utilisateur, ip, email, domaine, serveur, identifiants).
//
// Tout est gardé en try/catch : à la moindre erreur ou config absente, on
// renvoie null et le diagnostic retombe sur « aucune » sans planter.

// ── Configuration (toutes en variables d'env de la Function App) ─────────────
// Endpoint « data plane » du projet Foundry exposant l'API Agents, ex :
//   https://<ressource>.services.ai.azure.com/api/projects/<projet>
const AGENTS_ENDPOINT    = process.env.FOUNDRY_AGENTS_ENDPOINT;
// Clé d'accès. L'API Agents peut exiger un jeton Entra ; si la clé suffit sur
// ton déploiement, on réutilise FOUNDRY_KEY par défaut.
const AGENTS_KEY         = process.env.FOUNDRY_AGENTS_KEY || process.env.FOUNDRY_KEY;
// ID d'un agent PRÉ-CRÉÉ dans le portail Foundry, muni de l'outil « bing_grounding »
// connecté à une ressource « Grounding with Bing Search ».
const AGENT_ID           = process.env.FOUNDRY_AGENT_ID;
const AGENTS_API_VERSION = process.env.FOUNDRY_AGENTS_API_VERSION || "2025-05-01";

// Domaines autorisés dans les citations renvoyées (filtre de sécurité côté serveur).
const ALLOWED_HOSTS = ["learn.microsoft.com", "answers.microsoft.com", "techcommunity.microsoft.com"];

// Bornes : la recherche web ne doit jamais bloquer le diagnostic trop longtemps.
const POLL_INTERVAL_MS = 1200;
const POLL_MAX_MS      = 25000;
const MAX_LIENS        = 4;

function trimSlash(s) {
  return String(s || "").replace(/\/+$/, "");
}

// La recherche web de secours est-elle configurée ? (sinon : fonctionnalité éteinte)
function webSearchConfigured() {
  return !!(AGENTS_ENDPOINT && AGENTS_KEY && AGENT_ID);
}

function headers() {
  return { "Content-Type": "application/json", "api-key": AGENTS_KEY };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Ne garde que les liens vers les domaines Microsoft autorisés (anti-bruit + cadrage).
function isAllowedUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ALLOWED_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

/**
 * Interroge Microsoft Learn / les forums MS pour des PISTES externes.
 *
 * @param {string} keywords  mots-clés génériques déjà assainis (aucune entité)
 * @returns {Promise<{resume:string, liens:Array<{titre:string,url:string}>}|null>}
 *          null si non configuré, erreur, délai dépassé, ou aucun lien Microsoft.
 */
async function searchMicrosoftDocs(keywords) {
  if (!webSearchConfigured()) return null;
  const query = String(keywords || "").trim();
  if (!query) return null;

  const base = `${trimSlash(AGENTS_ENDPOINT)}`;
  const v = `api-version=${AGENTS_API_VERSION}`;

  try {
    // 1. Fil de discussion éphémère.
    const tRes = await fetch(`${base}/threads?${v}`, { method: "POST", headers: headers(), body: "{}" });
    if (!tRes.ok) return null;
    const thread = await tRes.json();
    const threadId = thread && thread.id;
    if (!threadId) return null;

    // 2. Message utilisateur — uniquement des mots-clés génériques, cadré sur les sources MS.
    const consigne =
      "Recherche sur learn.microsoft.com et answers.microsoft.com des pistes de résolution " +
      "pour cet incident IT (mots-clés génériques, aucune donnée personnelle). " +
      "Réponds en français, en 2-3 phrases, et cite tes sources. Incident : " + query;
    const mRes = await fetch(`${base}/threads/${threadId}/messages?${v}`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ role: "user", content: consigne })
    });
    if (!mRes.ok) return null;

    // 3. Lancement du run sur l'agent pré-créé (outil bing_grounding).
    const rRes = await fetch(`${base}/threads/${threadId}/runs?${v}`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ assistant_id: AGENT_ID })
    });
    if (!rRes.ok) return null;
    let run = await rRes.json();
    const runId = run && run.id;
    if (!runId) return null;

    // 4. Attente bornée de la fin du run.
    const start = Date.now();
    while (run && ["queued", "in_progress", "requires_action"].includes(run.status)) {
      if (Date.now() - start > POLL_MAX_MS) return null;
      await sleep(POLL_INTERVAL_MS);
      const pRes = await fetch(`${base}/threads/${threadId}/runs/${runId}?${v}`, { headers: headers() });
      if (!pRes.ok) return null;
      run = await pRes.json();
    }
    if (!run || run.status !== "completed") return null;

    // 5. Lecture de la réponse de l'assistant + extraction des citations URL.
    const lRes = await fetch(`${base}/threads/${threadId}/messages?${v}`, { headers: headers() });
    if (!lRes.ok) return null;
    const list = await lRes.json();
    const msg = (list.data || []).find((m) => m.role === "assistant");
    if (!msg) return null;

    let resume = "";
    const liens = [];
    const seen = new Set();
    for (const part of (msg.content || [])) {
      if (part.type !== "text" || !part.text) continue;
      if (!resume) resume = String(part.text.value || "").trim();
      for (const ann of (part.text.annotations || [])) {
        const cite = ann.url_citation || ann.urlCitation;
        if (!cite || !cite.url || !isAllowedUrl(cite.url)) continue;
        if (seen.has(cite.url)) continue;
        seen.add(cite.url);
        liens.push({ titre: cite.title || cite.url, url: cite.url });
        if (liens.length >= MAX_LIENS) break;
      }
    }

    // Pas un seul lien Microsoft fiable → on n'affiche rien (on reste sur "aucune" pur).
    if (liens.length === 0) return null;
    return { resume, liens };
  } catch {
    return null;
  }
}

module.exports = { webSearchConfigured, searchMicrosoftDocs };
