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
  const POLL_MS = 2000;

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
    if (document.visibilityState === 'visible') startPolling();
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
