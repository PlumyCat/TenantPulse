/* ──────────────────────────────────────────────────────────────────────────────
   sync.js — content script miroir (application TenantPulse → extension).

   localStorage est cloisonné par origine : la popup (chrome-extension://…) ne peut
   pas lire celui de l'app. Ce script, injecté sur l'origine de l'app, recopie les
   réglages dans chrome.storage.local sous la clé « tp_mirror_v1 ». Le sens est
   unidirectionnel : on ne réécrit jamais dans la page.

   Il produit aussi l'ATTESTATION D'APPARTENANCE qui déverrouille la popup : un appel
   à /api/me, en même origine et avec le cookie de session, donc vérifié par le
   serveur derrière l'authentification Entra. Sans elle, l'extension ne cherche rien.
   Seuls la date et le rôle sont conservés — jamais l'adresse e-mail.

   Le manifest cible « https://*.azurestaticapps.net/* » (le joker évite d'inscrire un
   domaine de production dans le dépôt) ; le garde-fou ci-dessous restreint l'exécution
   réelle à la seule origine configurée dans app-origin.js.

   Clés lues (déclarées dans tenantpulse.js) :
     tenantpulse_profile_v1    → profil de raccourcis (tuiles actives + ordre)
     tenantIdHistory_v1        → historique domaine ↔ Tenant ID
     tenantIdHistory_enabled   → opt-in de l'historique
     tenantAdminAccounts_v1    → tenants marqués « compte admin créé »
   ────────────────────────────────────────────────────────────────────────────── */
(function () {
  /* Garde-fou : le joker du manifest couvre tous les sites azurestaticapps.net.
     Sur n'importe quelle autre origine, ce script ne fait strictement rien —
     il ne lit pas le localStorage et n'écrase surtout pas le miroir existant. */
  if (typeof TP_APP_ORIGIN !== 'string' || location.origin !== TP_APP_ORIGIN) return;

  /* Marqueur lu par l'application pour savoir que l'extension est installée : elle
     affiche alors « Extension active » au lieu du bouton d'installation. Le monde
     JavaScript des scripts de contenu est isolé, mais le DOM est partagé — un attribut
     est donc le canal le plus simple, sans postMessage ni permission supplémentaire. */
  try {
    document.documentElement.setAttribute('data-tp-extension', chrome.runtime.getManifest().version);
  } catch { /* getManifest indisponible : l'app affichera simplement le bouton */ }

  /* Thème courant signalé à background.js, qui adapte l'icône de la barre d'outils.
     Le faire ici évite que l'icône reste figée tant que la popup n'a pas été ouverte. */
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const push = () => { try { chrome.storage.local.set({ tp_theme_v1: mq.matches ? 'dark' : 'light' }); } catch {} };
    push();
    mq.addEventListener('change', push);
  } catch {}

  const MIRROR_KEY = 'tp_mirror_v1';
  const TAGS_KEY = 'tp_tags_v1';
  const POLL_MS = 2000;
  /* L'annuaire des tags change au rythme des validations, pas à la seconde : un
     rafraîchissement à l'ouverture de l'app puis toutes les dix minutes suffit.
     Il vit dans SA PROPRE clé, hors du miroir : celui-ci est comparé par
     sérialisation toutes les deux secondes, et y verser un annuaire entier
     reviendrait à le sérialiser en boucle pour rien. */
  const TAGS_REFRESH_MS = 10 * 60 * 1000;

  let lastSerialized = null;
  let pollTimer = null;
  /* Attestation courante. Initialisée depuis le miroir existant : un échec réseau sur
     /api/me ne doit jamais invalider une attestation encore valide. */
  let auth = null;

  const readRaw = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const readJson = (key, fallback) => {
    const raw = readRaw(key);
    if (!raw) return fallback;
    try { const v = JSON.parse(raw); return (v === null || v === undefined) ? fallback : v; } catch { return fallback; }
  };

  /* Construit l'instantané à publier.
     L'opt-in historique de l'app est respecté : historique désactivé → miroir vide.
     L'extension ne conserve jamais un historique que l'utilisateur a refusé. */
  function buildSnapshot() {
    const historyEnabled = readRaw('tenantIdHistory_enabled') === 'true';
    const history = historyEnabled ? readJson('tenantIdHistory_v1', []) : [];
    return {
      profile: readJson('tenantpulse_profile_v1', null),
      history: Array.isArray(history) ? history : [],
      historyEnabled,
      adminAccounts: readJson('tenantAdminAccounts_v1', {}),
      auth,
    };
  }

  /* Publie l'instantané si son contenu a changé (comparaison de la sérialisation :
     lire quatre clés est négligeable, écrire dans chrome.storage ne l'est pas). */
  function publish() {
    let snap;
    try { snap = buildSnapshot(); } catch { return; }
    const serialized = JSON.stringify(snap);
    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    snap.syncedAt = new Date().toISOString();
    try {
      chrome.storage.local.set({ [MIRROR_KEY]: snap });
    } catch {
      /* Contexte d'extension invalidé (rechargement de l'extension) : on arrête de sonder. */
      stopPolling();
    }
  }

  /* Renouvelle l'attestation. Requête même origine : le cookie de session SWA est
     transmis, et c'est le serveur qui décide. Un 401 (session expirée) ou une panne
     réseau laisse l'attestation précédente en place — elle expirera d'elle-même. */
  async function refreshAuth() {
    try {
      const r = await fetch('/api/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!r.ok) return;
      const me = await r.json();
      auth = {
        authenticatedAt: new Date().toISOString(),
        role: typeof me.role === 'string' ? me.role : 'user',
        blocked: me.blocked === true,
      };
      publish();
    } catch { /* backend injoignable : on garde l'attestation existante */ }
  }

  /* ── Annuaire des tags ───────────────────────────────────────────────────────
     L'extension ne peut pas interroger /api/classification elle-même : sa requête
     serait inter-site et le cookie de session SWA n'y serait pas joint. Ce script,
     lui, s'exécute SUR l'origine de l'application — c'est le seul endroit d'où
     l'annuaire est atteignable. Il le recopie donc, comme il recopie déjà le profil.

     Conséquence assumée : la fraîcheur dépend de l'ouverture de l'application. Les
     badges portent leur âge plutôt que de laisser croire à du temps réel.

     « approvedBy » est une adresse professionnelle : elle est écartée ici et n'entre
     jamais dans le stockage de l'extension. */
  async function refreshTags() {
    const [annuaire, definitions] = await Promise.all([
      lireJson('/api/classification?all=1'),
      lireJson('/api/tags'),
    ]);
    if (!annuaire) return;   // 401, panne réseau : on garde l'annuaire précédent

    const parTenant = {};
    for (const item of (Array.isArray(annuaire.items) ? annuaire.items : [])) {
      if (!item || !item.tenantId || !item.type) continue;
      const cle = String(item.tenantId).toLowerCase();
      (parTenant[cle] = parTenant[cle] || []).push({
        type: String(item.type),
        approvedAt: item.approvedAt || '',
      });
    }

    /* Libellés et couleurs : les tags personnalisés viennent de /api/tags, les tags
       par défaut de la même réponse — repli sur la liste figée si l'API n'en donne pas
       (même repli que PREDEFINED_TAGS dans tenantpulse.js). */
    const defs = [];
    const pousser = (cle, nom, couleur) => {
      if (!cle || defs.some(d => d.key === cle)) return;
      defs.push({ key: String(cle), name: String(nom || cle), color: couleur || null });
    };
    if (definitions) {
      (Array.isArray(definitions.defaults) ? definitions.defaults : [])
        .forEach(d => pousser(d.key, d.name, d.color));
      (Array.isArray(definitions.tags) ? definitions.tags : [])
        .forEach(t => pousser(t.tagId, t.name, t.color));
    }

    try {
      chrome.storage.local.set({
        [TAGS_KEY]: { parTenant, definitions: defs, at: new Date().toISOString() },
      });
    } catch {}
  }

  async function lireJson(url) {
    try {
      const r = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  /* Détail d'un tenant — la seule voie pour connaître les demandes EN ATTENTE, que
     l'annuaire global ne porte pas. Répond à une demande relayée par le service
     worker depuis la popup ou le panneau Dynamics. */
  async function detailTenant(tenantId) {
    if (typeof tenantId !== 'string' || !/^[0-9a-f-]{36}$/i.test(tenantId)) return null;
    const d = await lireJson('/api/classification?tenantId=' + encodeURIComponent(tenantId));
    if (!d) return null;
    return {
      approuves: (Array.isArray(d.approvedTags) ? d.approvedTags : [])
        .map(t => ({ type: String(t.type), approvedAt: t.approvedAt || '' })),
      enAttente: (Array.isArray(d.pending) ? d.pending : [])
        .map(p => ({ type: String(p.type), count: p.count || 0, percent: p.percent })),
      at: new Date().toISOString(),
    };
  }

  /* Le service worker doit savoir dans quel onglet vit l'application pour lui relayer
     une demande de détail. On se signale à l'ouverture et à chaque retour au premier
     plan — aucune permission « tabs » n'est nécessaire, l'identifiant vient de
     l'expéditeur du message. */
  function seSignaler() {
    try { chrome.runtime.sendMessage({ type: 'tp-app-tab' }, () => void chrome.runtime.lastError); } catch {}
  }

  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== 'tp-tags-detail') return false;
      detailTenant(msg.tenantId).then(sendResponse, () => sendResponse(null));
      return true;   // réponse asynchrone
    });
  } catch {}

  function startPolling() {
    if (pollTimer !== null) return;
    pollTimer = setInterval(publish, POLL_MS);
  }
  function stopPolling() {
    if (pollTimer === null) return;
    clearInterval(pollTimer); pollTimer = null;
  }

  /* Sondage uniquement quand l'onglet est visible ; publication à chaque bascule
     et avant déchargement pour ne pas perdre une modification de dernière seconde. */
  function syncPollingWithVisibility() {
    if (document.visibilityState === 'visible') { startPolling(); seSignaler(); }
    else { stopPolling(); publish(); }
  }

  /* Reprise de l'attestation déjà stockée, puis premier miroir et renouvellement. */
  function start() {
    publish();
    syncPollingWithVisibility();
    document.addEventListener('visibilitychange', syncPollingWithVisibility);
    window.addEventListener('pagehide', publish);
    // L'événement « storage » ne se déclenche que pour les modifications venues d'un
    // AUTRE onglet de la même origine — complément indispensable au sondage local.
    window.addEventListener('storage', publish);
    refreshAuth();
    seSignaler();
    refreshTags();
    setInterval(refreshTags, TAGS_REFRESH_MS);
  }

  try {
    chrome.storage.local.get(MIRROR_KEY, (res) => {
      const prev = res && res[MIRROR_KEY];
      if (prev && prev.auth) auth = prev.auth;
      start();
    });
  } catch {
    start();
  }
})();
