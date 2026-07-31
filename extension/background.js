/* ──────────────────────────────────────────────────────────────────────────────
   background.js — service worker. Deux responsabilités :

   1. Porter les appels réseau de l'extension (tp-net.js). Un fetch émis depuis un
      script de contenu part avec l'origine de la page hôte, donc soumis au CORS et
      à la CSP de cette page ; depuis ici, ce sont les « host_permissions » du
      manifest qui s'appliquent. Popup et scripts de contenu demandent donc une
      résolution par message « tp-lookup ».

   2. Adapter l'icône de la barre d'outils au thème clair ou sombre.
      Chromium n'a pas d'équivalent au « theme_icons » de Firefox : une icône
      déclarée dans le manifest est figée. La seule voie est chrome.action.setIcon()
      à l'exécution — mais un service worker n'a ni window ni matchMedia.
      Le thème est donc observé là où c'est possible (la popup et le script de
      contenu, qui ont un DOM), écrit dans chrome.storage, et ce worker se contente
      de l'appliquer : au démarrage du navigateur, à l'installation, et à chaque
      changement. Sans lui, l'icône reviendrait au défaut du manifest à chaque
      redémarrage, jusqu'à la prochaine ouverture de la popup.
   ────────────────────────────────────────────────────────────────────────────── */

importScripts('tp-core.js', 'tp-net.js');

/* ── Routeur des demandes de résolution ──
   Seuls les contextes de cette extension peuvent adresser un message ici :
   « externally_connectable » n'est pas déclaré, donc une page web ne peut pas
   émettre vers l'extension. La validation de forme reste faite dans tp-net.js.

   Convention de réponse : { ok:true, data } où data vaut null quand aucun tenant
   n'a été trouvé — l'appelant traite « introuvable » et « réseau en échec » de la
   même façon, comme le faisait déjà la popup avant ce découpage. */
const LOOKUPS = {
  domain:   value => lookupByDomain(value),
  id:       value => lookupById(value),
  spTenant: value => lookupSpTenant(value),
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return false;

  if (msg.type === 'tp-lookup') {
    const run = LOOKUPS[msg.kind];
    if (!run) { sendResponse({ ok: false }); return false; }
    Promise.resolve()
      .then(() => run(msg.value))
      .then(data => sendResponse({ ok: true, data: data === undefined ? null : data }))
      .catch(() => sendResponse({ ok: false }));
    return true; // réponse asynchrone : le canal reste ouvert
  }

  if (msg.type === 'tp-d365-sync') {
    syncD365Scripts().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }

  return false;
});

/* ── Panneau Dynamics : enregistrement conditionnel des scripts de contenu ──
   L'accès à Dynamics est une permission OPTIONNELLE : tant que l'utilisateur ne
   l'accorde pas depuis la popup, rien n'est injecté et l'extension ne voit aucune
   page Dynamics. Les scripts ne peuvent donc pas être déclarés statiquement dans le
   manifest — ils sont enregistrés ici, à l'exécution, une fois la permission obtenue.

   ctx-main.js va dans le monde « MAIN » pour atteindre les API client de Dynamics
   (Xrm, Microsoft.Apm), invisibles depuis un monde isolé. Il n'a aucune permission
   d'extension et ne peut rien faire d'autre que poster un message à ctx.js, qui lui
   reste isolé et porte tous les garde-fous. */
const D365_ORIGIN_PATTERN = 'https://*.dynamics.com/*';

const D365_SCRIPTS = [
  {
    id: 'tp-d365-main',
    matches: [D365_ORIGIN_PATTERN],
    js: ['d365/ctx-main.js'],
    world: 'MAIN',
    allFrames: true,
    runAt: 'document_idle',
  },
  {
    id: 'tp-d365',
    matches: [D365_ORIGIN_PATTERN],
    js: ['d365-origin.js', 'tp-core.js', 'tp-client.js', 'd365/ctx.js'],
    world: 'ISOLATED',
    allFrames: true,
    runAt: 'document_idle',
  },
];

const D365_SCRIPT_IDS = D365_SCRIPTS.map(s => s.id);

/* Aligne l'état d'enregistrement sur l'état de la permission. Idempotent : appelable
   au démarrage, à l'installation, et à chaque octroi ou retrait. */
async function syncD365Scripts() {
  let granted = false;
  try { granted = await chrome.permissions.contains({ origins: [D365_ORIGIN_PATTERN] }); } catch { return; }

  let existing = [];
  try { existing = await chrome.scripting.getRegisteredContentScripts({ ids: D365_SCRIPT_IDS }); } catch {}

  try {
    if (!granted) {
      if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map(s => s.id) });
      return;
    }
    // Ré-enregistrement complet : une définition modifiée par une mise à jour de
    // l'extension doit remplacer celle qui persiste depuis la session précédente.
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map(s => s.id) });
    await chrome.scripting.registerContentScripts(D365_SCRIPTS);
  } catch { /* enregistrement impossible : le panneau reste simplement absent */ }
}

chrome.runtime.onInstalled.addListener(syncD365Scripts);
chrome.runtime.onStartup.addListener(syncD365Scripts);
chrome.permissions.onAdded.addListener(syncD365Scripts);
chrome.permissions.onRemoved.addListener(syncD365Scripts);

const THEME_KEY = 'tp_theme_v1';

/* Glyphe noir pour une barre d'outils claire, blanc pour une barre sombre. */
function applyIcon(theme) {
  const prefix = theme === 'dark' ? 'assets/icon-white-' : 'assets/icon-';
  try {
    chrome.action.setIcon({
      path: { 16: prefix + '16.png', 32: prefix + '32.png', 48: prefix + '48.png', 128: prefix + '128.png' }
    });
  } catch { /* API indisponible : l'icône du manifest reste en place */ }
}

function refreshIcon() {
  try {
    chrome.storage.local.get(THEME_KEY, (res) => {
      applyIcon(res && res[THEME_KEY] === 'dark' ? 'dark' : 'light');
    });
  } catch {}
}

chrome.runtime.onStartup.addListener(refreshIcon);
chrome.runtime.onInstalled.addListener(refreshIcon);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[THEME_KEY]) refreshIcon();
});
