// Appels HTTP vers Azure AI Foundry (chat) et Azure AI Search (recherche).
//
// Pas de SDK : on utilise `fetch` natif (Node 18+). Toutes les valeurs
// sensibles (endpoint, clé, nom de déploiement, index) viennent EXCLUSIVEMENT
// des variables d'environnement de la Function App — jamais du dépôt.
//
// Le navigateur ne parle jamais directement à Foundry ni à AI Search : seules
// les Functions détiennent les clés. Voir ARCHITECTURE-IA.md §7.

// ── Configuration Foundry (chat) ───────────────────────────────────────────
const FOUNDRY_ENDPOINT    = process.env.FOUNDRY_ENDPOINT;
const FOUNDRY_KEY         = process.env.FOUNDRY_KEY;
const FOUNDRY_DEPLOY_CHAT = process.env.FOUNDRY_DEPLOY_CHAT || "gpt-4.1-mini";
const FOUNDRY_API_VERSION = process.env.FOUNDRY_API_VERSION || "2024-10-21";

// ── Configuration Azure AI Search ────────────────────────────────────────────
const SEARCH_ENDPOINT        = process.env.SEARCH_ENDPOINT;
const SEARCH_KEY             = process.env.SEARCH_KEY;
const SEARCH_INDEX           = process.env.SEARCH_INDEX || "procedures";
const SEARCH_API_VERSION     = process.env.SEARCH_API_VERSION || "2024-07-01";
// Noms par défaut = schéma produit par l'assistant « Importer et vectoriser »
// d'Azure Search. Surchargeables si l'index a été créé différemment.
const SEARCH_VECTOR_FIELD    = process.env.SEARCH_VECTOR_FIELD || "text_vector";
const SEARCH_SEMANTIC_CONFIG = process.env.SEARCH_SEMANTIC_CONFIG || "procedures-semantic-configuration";

// Enlève un éventuel slash final pour composer les URLs proprement.
function trimSlash(s) {
  return String(s || "").replace(/\/+$/, "");
}

// Indique si la configuration IA est complète. Permet au handler de répondre
// 503 proprement (au lieu de planter) tant que les variables ne sont pas posées.
function foundryConfigured() {
  return !!(FOUNDRY_ENDPOINT && FOUNDRY_KEY);
}
function searchConfigured() {
  return !!(SEARCH_ENDPOINT && SEARCH_KEY);
}

/**
 * Appel chat Foundry attendant une sortie JSON (response_format json_object).
 * @param {Array<{role:string,content:string}>} messages
 * @param {number} temperature
 * @returns {Promise<object>} l'objet JSON parsé renvoyé par le modèle
 */
async function chatJson(messages, temperature = 0) {
  if (!foundryConfigured()) throw new Error("Foundry non configuré");

  const url = `${trimSlash(FOUNDRY_ENDPOINT)}/openai/deployments/${FOUNDRY_DEPLOY_CHAT}` +
              `/chat/completions?api-version=${FOUNDRY_API_VERSION}`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": FOUNDRY_KEY },
    body: JSON.stringify({
      messages,
      temperature,
      response_format: { type: "json_object" }
    })
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`Foundry chat ${r.status}: ${detail.slice(0, 300)}`);
  }

  const data = await r.json();
  const content = data?.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
}

/**
 * Recherche hybride (mots-clés + vecteur) avec reranker sémantique sur l'index
 * des procédures. La vectorisation de la requête est faite côté Search
 * (vectorQueries kind:"text"), grâce au vectorizer configuré sur l'index — donc
 * aucun appel d'embeddings séparé n'est nécessaire ici.
 *
 * Si la configuration sémantique est introuvable (400), on retombe sur une
 * recherche hybride simple sans reranker plutôt que d'échouer.
 *
 * @param {string} searchText  mots-clés / entités issues de l'analyse
 * @param {number} top         nombre de chunks à ramener
 * @returns {Promise<Array<{score:number, rerankerScore:number|null, raw:object}>>}
 */
async function searchProcedures(searchText, top = 5) {
  if (!searchConfigured()) throw new Error("AI Search non configuré");

  const url = `${trimSlash(SEARCH_ENDPOINT)}/indexes/${SEARCH_INDEX}` +
              `/docs/search?api-version=${SEARCH_API_VERSION}`;

  const baseBody = {
    search: searchText,
    top,
    vectorQueries: [{
      kind: "text",
      text: searchText,
      fields: SEARCH_VECTOR_FIELD,
      k: top
    }]
  };
  const semanticBody = {
    ...baseBody,
    queryType: "semantic",
    semanticConfiguration: SEARCH_SEMANTIC_CONFIG
  };

  async function run(body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": SEARCH_KEY },
      body: JSON.stringify(body)
    });
  }

  let r = await run(semanticBody);
  // Config sémantique absente / mal nommée → on réessaie sans reranker.
  if (r.status === 400) {
    r = await run(baseBody);
  }
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`AI Search ${r.status}: ${detail.slice(0, 300)}`);
  }

  const data = await r.json();
  return (data.value || []).map((doc) => ({
    score:         typeof doc["@search.score"] === "number" ? doc["@search.score"] : null,
    rerankerScore: typeof doc["@search.rerankerScore"] === "number" ? doc["@search.rerankerScore"] : null,
    raw:           doc
  }));
}

module.exports = {
  foundryConfigured,
  searchConfigured,
  chatJson,
  searchProcedures
};
