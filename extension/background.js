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
  if (!msg || msg.type !== 'tp-lookup') return false;
  const run = LOOKUPS[msg.kind];
  if (!run) { sendResponse({ ok: false }); return false; }
  Promise.resolve()
    .then(() => run(msg.value))
    .then(data => sendResponse({ ok: true, data: data === undefined ? null : data }))
    .catch(() => sendResponse({ ok: false }));
  return true; // réponse asynchrone : le canal reste ouvert
});

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
