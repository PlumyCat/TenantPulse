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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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

  /* Relais entre frames d'un même onglet : deux scripts de contenu ne peuvent pas se
     parler directement, et le panneau (frame principale) n'est pas toujours dans la
     frame qui détient l'enregistrement (une session Omnicanal a la sienne).

       tp-d365-etat   → frame 0 seule : l'état à afficher.
       tp-d365-manuel → toutes les frames : le domaine corrigé ; seule la frame
                        propriétaire de l'enregistrement y réagit. */
  if (msg.type === 'tp-d365-etat' || msg.type === 'tp-d365-manuel') {
    const tabId = sender && sender.tab && sender.tab.id;
    if (typeof tabId === 'number') {
      // « options » omis plutôt que passé à undefined : la signature de sendMessage
      // n'accepte pas la valeur, seulement l'absence de l'argument.
      const suite = () => void chrome.runtime.lastError;
      try {
        if (msg.type === 'tp-d365-etat') chrome.tabs.sendMessage(tabId, msg, { frameId: 0 }, suite);
        else chrome.tabs.sendMessage(tabId, msg, suite);
      } catch {}
    }
    return false;
  }

  /* Onglets de l'application, signalés par sync.js. Ils sont la seule voie vers
     /api/classification : le cookie de session n'accompagne que les requêtes parties
     de l'origine de l'app. Mémoriser l'identifiant de l'expéditeur évite d'avoir à
     demander la permission « tabs » pour retrouver ces onglets nous-mêmes. */
  if (msg.type === 'tp-app-tab') {
    const id = sender && sender.tab && sender.tab.id;
    if (typeof id === 'number') ongletsApp.add(id);
    return false;
  }

  /* Détail des tags d'un tenant (validés ET en attente) : relayé au premier onglet
     de l'application qui répond. Sans onglet ouvert, on rend null et l'appelant se
     rabat sur l'annuaire recopié, qui ne porte que les tags validés. */
  if (msg.type === 'tp-tags-detail') {
    detailTagsViaApp(msg.tenantId).then(sendResponse, () => sendResponse(null));
    return true;
  }

  if (msg.type === 'tp-d365-sync') {
    syncD365Scripts().then(etat => sendResponse({ ok: true, etat }), () => sendResponse({ ok: false }));
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
/* Onglets où l'application est ouverte. Un service worker peut être arrêté à tout
   moment : cet ensemble est une simple optimisation, reconstruite dès que sync.js se
   signale à nouveau (au chargement et à chaque retour au premier plan). */
const ongletsApp = new Set();

chrome.tabs.onRemoved.addListener((id) => ongletsApp.delete(id));

function interrogerOnglet(tabId, tenantId) {
  return new Promise(resolve => {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'tp-tags-detail', tenantId }, (rep) => {
        if (chrome.runtime.lastError) { ongletsApp.delete(tabId); resolve(null); return; }
        resolve(rep || null);
      });
    } catch { resolve(null); }
  });
}

async function detailTagsViaApp(tenantId) {
  for (const tabId of Array.from(ongletsApp)) {
    const rep = await interrogerOnglet(tabId, tenantId);
    if (rep) return rep;
  }
  return null;
}

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
    js: ['d365-origin.js', 'tp-core.js', 'tp-client.js', 'tp-badges.js', 'd365/panel.js', 'd365/ctx.js'],
    world: 'ISOLATED',
    allFrames: true,
    runAt: 'document_idle',
  },
];

const D365_SCRIPT_IDS = D365_SCRIPTS.map(s => s.id);

/* Aligne l'état d'enregistrement sur l'état de la permission. Idempotent : appelable
   au démarrage, à l'installation, et à chaque octroi ou retrait.

   Rend un état plutôt que rien : sans lui, un échec d'enregistrement est parfaitement
   silencieux — la popup annonce « actif » et il ne se passe rien dans Dynamics, sans
   le moindre indice. La popup affiche donc ce que ce diagnostic rapporte. */
async function syncD365Scripts() {
  const etat = { granted: false, registered: 0, erreur: null };

  try {
    etat.granted = await chrome.permissions.contains({ origins: [D365_ORIGIN_PATTERN] });
  } catch (e) {
    etat.erreur = 'permissions.contains — ' + ((e && e.message) || 'erreur inconnue');
    console.warn('[TenantPulse] panneau Dynamics :', etat.erreur);
    return etat;
  }

  /* Lecture SANS filtre, puis tri côté script : passer « ids » à
     getRegisteredContentScripts lève une erreur dès qu'un des identifiants demandés
     n'existe pas encore. Le filtre échouait donc précisément dans le cas où il servait
     à quelque chose, et l'enregistrement suivant butait sur un « Duplicate script ID ». */
  async function dejaEnregistres() {
    try {
      const tous = await chrome.scripting.getRegisteredContentScripts();
      return (tous || []).filter(s => D365_SCRIPT_IDS.includes(s.id)).map(s => s.id);
    } catch { return []; }
  }

  /* Désenregistrement un par un : un identifiant absent fait échouer l'appel groupé,
     et emporterait avec lui le retrait de ceux qui existent bel et bien. */
  async function retirer(ids) {
    for (const id of ids) {
      try { await chrome.scripting.unregisterContentScripts({ ids: [id] }); } catch {}
    }
  }

  try {
    // Ré-enregistrement complet : une définition modifiée par une mise à jour de
    // l'extension doit remplacer celle qui persiste depuis la session précédente.
    await retirer(await dejaEnregistres());
    if (etat.granted) {
      try {
        await chrome.scripting.registerContentScripts(D365_SCRIPTS);
      } catch (e) {
        // Filet : identifiant encore pris malgré le retrait → on force et on retente.
        if (!/duplicate script id/i.test((e && e.message) || '')) throw e;
        await retirer(D365_SCRIPT_IDS);
        await chrome.scripting.registerContentScripts(D365_SCRIPTS);
      }
      etat.registered = D365_SCRIPTS.length;
    }
  } catch (e) {
    etat.erreur = (e && e.message) || "échec d'enregistrement";
  }

  if (etat.erreur) console.warn('[TenantPulse] panneau Dynamics :', etat.erreur);
  else console.info('[TenantPulse] panneau Dynamics :',
    etat.granted ? `${etat.registered} script(s) enregistré(s)` : 'permission non accordée');
  return etat;
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
