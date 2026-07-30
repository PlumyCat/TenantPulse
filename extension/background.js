/* ──────────────────────────────────────────────────────────────────────────────
   background.js — service worker minimal, dédié à une seule chose : adapter
   l'icône de la barre d'outils au thème clair ou sombre.

   Chromium n'a pas d'équivalent au « theme_icons » de Firefox : une icône
   déclarée dans le manifest est figée. La seule voie est chrome.action.setIcon()
   à l'exécution — mais un service worker n'a ni window ni matchMedia.

   Le thème est donc observé là où c'est possible (la popup et le script de
   contenu, qui ont un DOM), écrit dans chrome.storage, et ce worker se contente
   de l'appliquer : au démarrage du navigateur, à l'installation, et à chaque
   changement. Sans lui, l'icône reviendrait au défaut du manifest à chaque
   redémarrage, jusqu'à la prochaine ouverture de la popup.
   ────────────────────────────────────────────────────────────────────────────── */

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
