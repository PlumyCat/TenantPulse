// ── Favicon dark mode (était inline dans <head>) ──
  (function () {
    const favicon = document.getElementById('favicon');
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (isDark) => { favicon.href = isDark ? 'assets/TP.png' : 'assets/DarkTP.png'; };
    apply(mql.matches);
    mql.addEventListener('change', (e) => apply(e.matches));
  })();

// ── Code principal ──
const PROXY_DATA = {
  dnsgoogle:      {title:'dns.google', desc:'API DNS-over-HTTPS de Google (DoH). Utilisée pour résoudre MX, SPF, DKIM, DMARC, DNSSEC, BIMI et MTA-STS. Aucune donnée personnelle transmise — seulement le nom de domaine.', url:'https://dns.google/resolve'},
  rdap:           {title:'rdap.org',   desc:'Service RDAP public (Registration Data Access Protocol). Utilisé pour récupérer les données WHOIS : registrar, serveurs NS, dates de création/expiration. Lecture seule.', url:'https://rdap.org/domain/'},
  mslogin:        {title:'login.microsoftonline.com', desc:'Endpoint public officiel Microsoft. Utilisé pour détecter le Tenant ID (OpenID Connect) et valider le GUID du tenant.', url:'https://login.microsoftonline.com/common/.well-known/openid-configuration'},
  googleaccounts: {title:'accounts.google.com', desc:'Endpoint public officiel Google. Utilisé pour détecter Google Workspace via OpenID Connect (issuer, token & authorization endpoints). Lecture seule.', url:'https://accounts.google.com/.well-known/openid-configuration'},
};

// ── Redirect buttons config ──
const REDIRECT_BUTTONS = [
  { key:'partnerCenter', label:'Partner Center',  sub:'Clients & licences CSP',       icon:'assets/Redirect.png',              href: id => `https://partner.microsoft.com/dashboard/v2/customers/${encodeURIComponent(id)}/servicemanagementpage` },
  { key:'entraId',       label:'Entra ID',         sub:'Identités & accès',             icon:'assets/MicrosoftEntraID.png',      href: id => `https://entra.microsoft.com/${encodeURIComponent(id)}` },
  { key:'m365Admin',     label:'M365 Admin',       sub:'Administration Microsoft 365',  icon:'assets/Microsoft365Admin.png',     href: (id, dom) => `https://admin.microsoft.com/?delegatedOrg=${encodeURIComponent(dom || '')}` },
  { key:'exchange',      label:'Exchange',          sub:'Messagerie & calendriers',      icon:'assets/MicrosoftExchange.png',     href: (id, dom) => `https://admin.exchange.microsoft.com/?delegatedOrg=${encodeURIComponent(dom || '')}` },
  { key:'intune',        label:'Intune',            sub:'Gestion des appareils',         icon:'assets/MicrosoftIntune.png',       href: id => `https://intune.microsoft.com/${encodeURIComponent(id)}` },
  { key:'teams',         label:'Teams',             sub:'Collaboration & réunions',      icon:'assets/MicrosoftTeams.png',        href: (id, dom) => `https://admin.teams.microsoft.com/?delegatedOrg=${encodeURIComponent(dom || '')}` },
  { key:'sharepoint',    label:'SharePoint',        sub:'Sites & documents',             icon:'assets/MicrosoftSharepoint.png',   href: (id, dom) => `https://admin.microsoft.com/sharepoint?delegatedOrg=${encodeURIComponent(dom || '')}` },
  { key:'azure',         label:'Azure',             sub:'Ressources cloud',              icon:'assets/MicrosoftAzure.png',        href: id => `https://portal.azure.com/${encodeURIComponent(id)}` },
  { key:'defender',      label:'Defender',          sub:'Sécurité & menaces',            icon:'assets/MicrosoftDefender.png',     href: id => `https://security.microsoft.com/?tid=${encodeURIComponent(id)}` },
];

/* Hôtes Microsoft autorisés pour les boutons de redirection.
   Défense en profondeur : si une entrée REDIRECT_BUTTONS était altérée (injection,
   compromission supply-chain), un lien hors de cette liste ne serait jamais rendu. */
const ALLOWED_REDIRECT_HOSTS = new Set([
  'partner.microsoft.com', 'entra.microsoft.com', 'admin.microsoft.com',
  'admin.exchange.microsoft.com', 'intune.microsoft.com', 'admin.teams.microsoft.com',
  'portal.azure.com', 'security.microsoft.com'
]);

/* Construit l'URL d'un bouton et ne la renvoie que si elle vise un hôte MS autorisé en HTTPS. */
function safeRedirectHref(hrefFn, id, dom) {
  let raw; try { raw = hrefFn(id, dom); } catch { return null; }
  let u;   try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  return ALLOWED_REDIRECT_HOSTS.has(u.hostname) ? u.href : null;
}

const PROFILE_KEY = 'tenantpulse_profile_v1';
const MHAELLE_PROFILE_KEY = 'mhaelle_profile_v1';

/* Origine cible des postMessage vers les iframes (Mhaelle, PsForge).
   En prod (http/https) les iframes sont même origine → on restreint à location.origin.
   Sur file:// : Chrome retourne 'null', Edge retourne 'file://' — dans les deux cas
   les iframes ont une origine opaque ('null') distincte, donc on utilise le wildcard. */
const FRAME_TARGET_ORIGIN = (location.origin && location.origin !== 'null' && location.origin !== 'file://') ? location.origin : '*';

/* Blocs Mhaelle configurables (label + colonne par défaut) */
const ML_BLOCKS = [
  { key: 'message', label: 'Message',          col: 'left'  },
  { key: 'smtp',    label: 'Chaîne SMTP',       col: 'left'  },
  { key: 'urls',    label: 'URLs détectées',    col: 'left'  },
  { key: 'reports', label: 'Rapports texte',    col: 'left'  },
  { key: 'auth',    label: 'Authentification',  col: 'right' },
  { key: 'ms',      label: 'Microsoft / EOP',   col: 'right' },
  { key: 'signals', label: 'Signaux détectés',  col: 'right' },
];

function loadMhaelleProfile() {
  try {
    const raw = localStorage.getItem(MHAELLE_PROFILE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p.left) && Array.isArray(p.right)) {
        if (!Array.isArray(p.defaultOpen)) p.defaultOpen = [];
        return p;
      }
    }
  } catch {}
  return {
    left:        ['message', 'smtp', 'urls', 'reports'],
    right:       ['auth', 'ms', 'signals'],
    hidden:      [],
    defaultOpen: []
  };
}
function saveMhaelleProfile(profile) {
  try { localStorage.setItem(MHAELLE_PROFILE_KEY, JSON.stringify(profile)); } catch {}
}

function loadProfile() {
  let profile = null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) profile = JSON.parse(raw);
  } catch {}
  if (!profile) {
    profile = {};
    REDIRECT_BUTTONS.forEach(b => profile[b.key] = true);
  }
  // Partner Center is always enabled (locked recommandé)
  profile.partnerCenter = true;
  return profile;
}
function saveProfile(profile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch {}
}
/* Retourne REDIRECT_BUTTONS dans l'ordre sauvegardé (partnerCenter toujours premier) */
function orderedRedirectButtons(profile) {
  const saved = profile.order;
  if (!saved || !saved.length) return REDIRECT_BUTTONS;
  const rest = saved
    .map(k => REDIRECT_BUTTONS.find(b => b.key === k))
    .filter(Boolean);
  const pc = REDIRECT_BUTTONS.find(b => b.key === 'partnerCenter');
  return pc ? [pc, ...rest] : rest;
}
function isButtonEnabled(key) {
  return loadProfile()[key] !== false;
}


function toggleDropSection(btn) {
  btn.classList.toggle('open');
  const body = btn.nextElementSibling;
  if (body) body.classList.toggle('open');
}

// ── Dropdown ──
function toggleDropdown() {
  document.getElementById('mainDropdown').classList.toggle('open');
}
document.addEventListener('click', e => {
  const d  = document.getElementById('mainDropdown');
  const ov = document.getElementById('proxyOverlay');
  if (!d.contains(e.target) && !ov.contains(e.target)) {
    d.classList.remove('open');
    hideProxyDetail();
  }
});
function showProxyDetail(key) {
  const p = PROXY_DATA[key]; if (!p) return;
  document.getElementById('pdTitle').textContent = p.title;
  document.getElementById('pdDesc').textContent  = p.desc;
  document.getElementById('pdUrl').textContent   = p.url;
  const menu  = document.getElementById('dropMenu');
  const panel = document.getElementById('proxyDetailPanel');
  const rect  = menu.getBoundingClientRect();
  panel.style.top   = rect.top + 'px';
  panel.style.right = (window.innerWidth - rect.left + 8) + 'px';
  panel.style.left  = 'auto';
  document.getElementById('proxyOverlay').classList.add('open');
  panel.classList.add('open');
}
function hideProxyDetail() {
  document.getElementById('proxyDetailPanel').classList.remove('open');
  document.getElementById('proxyOverlay').classList.remove('open');
}

// ── Dark mode ──
function syncDarkUI(isDark) {
  document.getElementById('darkLabel').textContent = isDark ? 'Mode clair' : 'Mode sombre';
  document.getElementById('darkSwitch').classList.toggle('on', isDark);
}
function toggleDark() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  syncDarkUI(!isDark);
}
(function () {
  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (isDark) document.documentElement.setAttribute('data-theme', 'dark');
  syncDarkUI(isDark);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    syncDarkUI(e.matches);
  });
})();

// ── Collapsible ──
function toggleCollapsible(bodyId, arrowId) {
  const body  = document.getElementById(bodyId);
  const arrow = document.getElementById(arrowId);
  const open  = body.classList.contains('open');
  body.classList.toggle('open', !open);
  arrow.classList.toggle('open', !open);
}

// ── History ──
const HISTORY_KEY = 'tenantIdHistory_v1';
const HISTORY_OPT_KEY = 'tenantIdHistory_enabled';
const HISTORY_MAX_KEY = 'tenantIdHistory_max';
const HISTORY_RETENTION_KEY = 'tenantIdHistory_retentionMs';
const HISTORY_MAX_DEFAULT = 20;
const HISTORY_RETENTION_DEFAULT_MS = 24 * 3600 * 1000; // 24h
const HISTORY_MAX_HARD_LIMIT = 40;

// Slider mapping for retention (index → label + ms). ms=0 → unlimited.
const RETENTION_STEPS = [
  { label: '5 min',     ms: 5 * 60 * 1000 },
  { label: '15 min',    ms: 15 * 60 * 1000 },
  { label: '30 min',    ms: 30 * 60 * 1000 },
  { label: '1 h',       ms: 1 * 3600 * 1000 },
  { label: '3 h',       ms: 3 * 3600 * 1000 },
  { label: '6 h',       ms: 6 * 3600 * 1000 },
  { label: '12 h',      ms: 12 * 3600 * 1000 },
  { label: '24 h',      ms: 24 * 3600 * 1000 },
  { label: '3 jours',   ms: 3 * 86400 * 1000 },
  { label: '7 jours',   ms: 7 * 86400 * 1000 },
  { label: '14 jours',  ms: 14 * 86400 * 1000 },
  { label: '30 jours',  ms: 30 * 86400 * 1000 },
  { label: '90 jours',  ms: 90 * 86400 * 1000 },
  { label: 'Illimité',  ms: 0 }
];
const RETENTION_DEFAULT_INDEX = 7; // = 24h

function getHistoryMax() {
  try {
    const raw = localStorage.getItem(HISTORY_MAX_KEY);
    if (raw === null) return HISTORY_MAX_DEFAULT;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return HISTORY_MAX_DEFAULT;
    return Math.min(n, HISTORY_MAX_HARD_LIMIT);
  } catch { return HISTORY_MAX_DEFAULT; }
}
function setHistoryMax(n) {
  const v = Math.max(0, Math.min(HISTORY_MAX_HARD_LIMIT, parseInt(n, 10) || 0));
  try { localStorage.setItem(HISTORY_MAX_KEY, String(v)); } catch {}
  // Trim existing history if new max is smaller
  const items = loadHistory();
  if (items.length > v) { saveHistory(items.slice(0, v)); }
  renderHistory(); syncCacheIndicator();
  return v;
}
function getRetentionIndex() {
  try {
    const raw = localStorage.getItem(HISTORY_RETENTION_KEY);
    if (raw === null) return RETENTION_DEFAULT_INDEX;
    const targetMs = parseInt(raw, 10);
    if (!Number.isFinite(targetMs)) return RETENTION_DEFAULT_INDEX;
    if (targetMs === 0) return RETENTION_STEPS.length - 1; // unlimited
    // Find closest matching step
    let idx = RETENTION_DEFAULT_INDEX;
    for (let i = 0; i < RETENTION_STEPS.length - 1; i++) {
      if (RETENTION_STEPS[i].ms === targetMs) { idx = i; break; }
    }
    return idx;
  } catch { return RETENTION_DEFAULT_INDEX; }
}
function setRetentionIndex(idx) {
  const i = Math.max(0, Math.min(RETENTION_STEPS.length - 1, parseInt(idx, 10) || 0));
  const ms = RETENTION_STEPS[i].ms;
  try { localStorage.setItem(HISTORY_RETENTION_KEY, String(ms)); } catch {}
  pruneExpiredHistory();
  renderHistory(); syncCacheIndicator();
  return i;
}
function getRetentionMs() { return RETENTION_STEPS[getRetentionIndex()].ms; }
function pruneExpiredHistory() {
  const ms = getRetentionMs();
  if (ms === 0) return; // unlimited, no prune
  const now = Date.now();
  const items = loadHistory();
  const kept = items.filter(it => (now - (it.at || 0)) < ms);
  if (kept.length !== items.length) saveHistory(kept);
}

function isHistoryEnabled() {
  try { return localStorage.getItem(HISTORY_OPT_KEY) === 'true'; } catch { return false; }
}
function setHistoryEnabled(val) {
  if (!val && isHistoryEnabled()) {
    const hasData = loadHistory().length > 0;
    if (hasData) {
      showDeleteConfirm();
      return;
    }
  }
  try { localStorage.setItem(HISTORY_OPT_KEY, val ? 'true' : 'false'); } catch {}
  syncHistoryToggleUI();
  if (!val) { saveHistory([]); renderHistory(); }
  else renderHistory();
  syncCacheIndicator();
}
function showDeleteConfirm() {
  const modal = document.getElementById('deleteConfirmModal');
  if (modal) modal.classList.add('open');
}
function hideDeleteConfirm() {
  const modal = document.getElementById('deleteConfirmModal');
  if (modal) modal.classList.remove('open');
}
function confirmDisableAndDelete() {
  hideDeleteConfirm();
  try { localStorage.setItem(HISTORY_OPT_KEY, 'false'); } catch {}
  syncHistoryToggleUI();
  clearHistory();
}
function confirmDisableKeep() {
  hideDeleteConfirm();
  try { localStorage.setItem(HISTORY_OPT_KEY, 'false'); } catch {}
  syncHistoryToggleUI();
  syncCacheIndicator();
  renderHistory();
}
function syncHistoryToggleUI() {
  const sw = document.getElementById('historyOptSwitch');
  if (sw) sw.classList.toggle('on', isHistoryEnabled());
  syncCacheSettingsAvailability();
}
function loadHistory()      { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } }
function saveHistory(items) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); } catch {} }
function addToHistory(domain, tenantId) {
  if (!tenantId || !isHistoryEnabled()) return;
  const max = getHistoryMax();
  if (max <= 0) return; // user disabled storage via slider
  pruneExpiredHistory();
  let items = loadHistory().filter(i => i.domain !== domain);
  items.unshift({ domain, tenantId, at: Date.now() });
  saveHistory(items.slice(0, max));
  renderHistory();
  syncCacheIndicator();
}
function clearHistory() {
  const fill = document.getElementById('cacheClearFill');
  const ind  = document.getElementById('cacheIndicator');
  const lbl  = document.getElementById('cacheIndicatorLabel');
  ind.className = 'cache-indicator state-clearing';
  lbl.textContent = 'Suppression…';
  fill.style.transition = 'none'; fill.style.width = '0%';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.style.transition = 'width .5s ease'; fill.style.width = '100%';
    setTimeout(() => {
      fill.style.transition = 'width .3s ease'; fill.style.width = '0%';
      saveHistory([]); renderHistory(); syncCacheIndicator();
    }, 540);
  }));
}
function syncCacheIndicator() {
  const ind = document.getElementById('cacheIndicator');
  const lbl = document.getElementById('cacheIndicatorLabel');
  if (!ind) return;
  const enabled = isHistoryEnabled();
  const items   = loadHistory();
  const hasData = items.length > 0;
  if (!enabled && !hasData) {
    ind.className = 'cache-indicator state-inactive';
    lbl.textContent = 'Cache inactif';
  } else if (!enabled && hasData) {
    ind.className = 'cache-indicator state-inactive';
    lbl.textContent = 'Cache désactivé';
  } else if (enabled && hasData) {
    ind.className = 'cache-indicator state-active';
    lbl.textContent = items.length + ' entrée' + (items.length > 1 ? 's' : '') + ' en cache';
  } else {
    ind.className = 'cache-indicator state-inactive';
    lbl.textContent = 'Cache vide';
  }
}
function relativeTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return "À l'instant";
  if (s < 3600)  return Math.floor(s / 60)   + 'min';
  if (s < 86400) return Math.floor(s / 3600)  + 'h';
  return Math.floor(s / 86400) + 'j';
}
function renderHistory() {
  const list = document.getElementById('historyList'); if (!list) return;
  list.textContent = '';
  if (!isHistoryEnabled()) {
    const empty = document.createElement('div'); empty.className = 'history-empty'; empty.textContent = 'Historique désactivé — activez-le dans Options'; list.appendChild(empty); return;
  }
  pruneExpiredHistory();
  const items = loadHistory();
  if (!items.length) {
    const empty = document.createElement('div'); empty.className = 'history-empty'; empty.textContent = 'Aucune analyse effectuée'; list.appendChild(empty); return;
  }
  items.forEach((item) => {
    const shortGuid = item.tenantId ? item.tenantId.slice(0, 8) + '…' : '—';
    const row = document.createElement('div'); row.className = 'history-item';
    row.addEventListener('click', () => loadFromHistory(item.domain));

    const iconSpan = document.createElement('span'); iconSpan.className = 'history-item-icon';
    const iconImg = document.createElement('img'); iconImg.src = 'assets/Microsoft.png'; iconImg.width = 14; iconImg.height = 14; iconImg.alt = 'Microsoft'; iconImg.style.cssText = 'display:inline-block;vertical-align:middle;flex-shrink:0;';
    iconSpan.appendChild(iconImg);

    const textWrap = document.createElement('div'); textWrap.style.cssText = 'flex:1;min-width:0';
    const domainEl = document.createElement('div'); domainEl.className = 'history-item-domain'; domainEl.textContent = item.domain;
    const guidEl   = document.createElement('div'); guidEl.className   = 'history-item-guid';   guidEl.textContent   = shortGuid;
    textWrap.appendChild(domainEl); textWrap.appendChild(guidEl);

    const timeEl = document.createElement('span'); timeEl.className = 'history-item-time'; timeEl.textContent = relativeTime(item.at);

    const copyBtn = document.createElement('button'); copyBtn.className = 'history-item-copy'; const copyImg = document.createElement('img'); copyImg.src = 'assets/copy.png'; copyImg.className = 'icon-adaptive'; copyImg.alt = ''; copyBtn.appendChild(copyImg);
    copyBtn.addEventListener('click', e => { e.stopPropagation(); copyHistoryGuid(item.tenantId, copyBtn); });

    row.appendChild(iconSpan); row.appendChild(textWrap); row.appendChild(timeEl); row.appendChild(copyBtn);
    list.appendChild(row);
  });
}
function loadFromHistory(domain) {
  emailInput.value = domain;
  emailInput.dispatchEvent(new Event('input'));
  checkFast();
}
function copyHistoryGuid(guid, btn) {
  navigator.clipboard.writeText(guid).then(() => { btn.replaceChildren(); const ck = document.createElement('img'); ck.src='assets/checked.png'; ck.className='icon-adaptive'; ck.alt=''; btn.appendChild(ck); setTimeout(() => { btn.replaceChildren(); const img = document.createElement('img'); img.src = 'assets/copy.png'; img.className = 'icon-adaptive'; img.alt = ''; btn.appendChild(img); }, 1500); });
}

// ── Onglets TenantPulse / Mhaelle / PsForge (vue type navigateur) ──
// Les iframes sont lazy-loaded au premier clic puis restent montées,
// ce qui préserve l'état de l'analyse des deux côtés au switch.
function switchAppTab(target) {
  const tabs = document.querySelectorAll('.app-tab');
  tabs.forEach(t => {
    const active = t.dataset.appTab === target;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const mlFrame = document.getElementById('mhaelleFrame');
  const pfFrame = document.getElementById('psforgeFrame');
  if (target === 'ml') {
    if (!mlFrame.src) mlFrame.src = 'ML/mhaelle.html?embedded=1';
    document.body.classList.add('view-ml');
    document.body.classList.remove('view-pf');
  } else if (target === 'pf') {
    if (!pfFrame.src) pfFrame.src = 'PF/psforge.html?embedded=1';
    document.body.classList.add('view-pf');
    document.body.classList.remove('view-ml');
  } else {
    document.body.classList.remove('view-ml');
    document.body.classList.remove('view-pf');
  }
}

// ── Central event binding ──
function bindEvents() {
  // ── Onglets TenantPulse / Mhaelle (architecture type navigateur) ──
  // L'iframe Mhaelle reste montée → l'état est préservé des deux côtés
  document.querySelectorAll('.app-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAppTab(tab.dataset.appTab));
  });

  document.getElementById('mainDropBtn').addEventListener('click', toggleDropdown);
  document.getElementById('btnDisableDelete').addEventListener('click', confirmDisableAndDelete);
  document.getElementById('btnDisableKeep').addEventListener('click', confirmDisableKeep);
  document.getElementById('btnDisableCancel').addEventListener('click', hideDeleteConfirm);
  document.getElementById('storageModal').addEventListener('click', hideStoragePanel);
  document.getElementById('storageModalInner').addEventListener('click', e => e.stopPropagation());
  document.getElementById('btnStorageClose').addEventListener('click', hideStoragePanel);
  document.getElementById('btnStorageCloseFooter').addEventListener('click', hideStoragePanel);
  document.getElementById('btnClearAllStorage').addEventListener('click', clearAllStorage);
  document.getElementById('btnShowStorage').addEventListener('click', showStoragePanel);
  document.querySelectorAll('[data-drop-section]').forEach(btn => {
    btn.addEventListener('click', () => toggleDropSection(btn));
  });
  document.getElementById('toggleDarkBtn').addEventListener('click', toggleDark);
  document.getElementById('toggleHistoryBtn').addEventListener('click', () => setHistoryEnabled(!isHistoryEnabled()));
  document.querySelectorAll('[data-proxy-key]').forEach(row => {
    row.addEventListener('click', () => showProxyDetail(row.dataset.proxyKey));
  });
  document.getElementById('proxyOverlay').addEventListener('click', hideProxyDetail);
  document.getElementById('proxyDetailPanel').addEventListener('click', e => e.stopPropagation());
  document.getElementById('proxyDetailBack').addEventListener('click', hideProxyDetail);
  document.getElementById('checkBtnFast').addEventListener('click', checkFast);
  document.getElementById('checkBtnFull').addEventListener('click', checkFull);
  document.getElementById('exportBtn').addEventListener('click', exportReport);
  document.getElementById('progList').addEventListener('click', e => {
    const cancel = e.target.closest('.p-step-cancel');
    const retry  = e.target.closest('.p-step-retry');
    if (cancel) cancelStep(cancel.dataset.step);
    if (retry)  retryStep(retry.dataset.step);
  });
  document.getElementById('btnHistoryToggle').addEventListener('click', () => toggleCollapsible('historyBody', 'historyArrow'));
  document.getElementById('btnClearHistory').addEventListener('click', clearHistory);
  document.getElementById('btnPrivacyToggle').addEventListener('click', () => toggleCollapsible('privacyBody', 'privacyArrow'));
  document.getElementById('btnPrivacyCta').addEventListener('click', () => {
    toggleDropdown();
    toggleCollapsible('privacyBody', 'privacyArrow');
  });
  document.getElementById('btnPanelClose').addEventListener('click', closePanel);
  document.getElementById('btnOpenProfiles').addEventListener('click', openProfilesModal);
  document.getElementById('btnProfilesClose').addEventListener('click', closeProfilesModal);
  document.addEventListener('click', e => {
    const modal = document.getElementById('profilesModal');
    const btn   = document.getElementById('btnOpenProfiles');
    if (modal.classList.contains('open') && !modal.contains(e.target) && !btn.contains(e.target)) {
      closeProfilesModal();
    }
  });
  document.getElementById('profilesModal').addEventListener('click', e => e.stopPropagation());
  document.getElementById('btnProfilesSave').addEventListener('click', saveProfilesModal);
  document.getElementById('btnProfilesSelectAll').addEventListener('click', () => {
    document.querySelectorAll('.profile-item-switch').forEach(sw => sw.classList.add('on'));
  });
  document.getElementById('btnProfilesNone').addEventListener('click', () => {
    document.querySelectorAll('.profile-item-switch').forEach(sw => sw.classList.remove('on'));
  });
  document.getElementById('profilesTabTP').addEventListener('click', () => switchProfilesTab('tp'));
  document.getElementById('profilesTabML').addEventListener('click', () => switchProfilesTab('ml'));
  document.getElementById('profilesTabPF').addEventListener('click', () => switchProfilesTab('pf'));
  document.getElementById('btnPFClearAll').addEventListener('click', clearAllPsForgeData);
  document.getElementById('btnMlBlocksReset').addEventListener('click', () => {
    saveMhaelleProfile({ left: ['message','smtp','urls','reports'], right: ['auth','ms','signals'], hidden: [], defaultOpen: [] });
    renderMhaelleProfilePane();
  });
  const dropInfoBtn = document.getElementById('btnDropInfoToggle');
  if (dropInfoBtn) {
    dropInfoBtn.addEventListener('click', () => {
      const body = document.getElementById('dropInfoBody');
      const arrow = document.getElementById('dropInfoArrow');
      const open = body.classList.toggle('open');
      arrow.classList.toggle('open', open);
      dropInfoBtn.classList.toggle('open', open);
      dropInfoBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  bindCacheSettings();
}

// ── Cache settings sliders ──
function bindCacheSettings() {
  const maxSlider = document.getElementById('maxTenantsSlider');
  const maxValue  = document.getElementById('maxTenantsValue');
  const retSlider = document.getElementById('retentionSlider');
  const retValue  = document.getElementById('retentionValue');
  const retWarn   = document.getElementById('retentionWarning');
  if (!maxSlider || !retSlider) return;

  // Init from localStorage
  const curMax = getHistoryMax();
  maxSlider.value = String(curMax);
  maxValue.textContent = curMax === 0 ? 'Désactivé' : String(curMax);

  const curRetIdx = getRetentionIndex();
  retSlider.value = String(curRetIdx);
  retValue.textContent = RETENTION_STEPS[curRetIdx].label;
  retWarn.hidden = curRetIdx !== RETENTION_STEPS.length - 1;

  maxSlider.addEventListener('input', () => {
    const v = parseInt(maxSlider.value, 10) || 0;
    maxValue.textContent = v === 0 ? 'Désactivé' : String(v);
  });
  maxSlider.addEventListener('change', () => {
    const applied = setHistoryMax(maxSlider.value);
    maxValue.textContent = applied === 0 ? 'Désactivé' : String(applied);
  });

  retSlider.addEventListener('input', () => {
    const i = parseInt(retSlider.value, 10) || 0;
    retValue.textContent = RETENTION_STEPS[i].label;
    retWarn.hidden = i !== RETENTION_STEPS.length - 1;
  });
  retSlider.addEventListener('change', () => {
    const applied = setRetentionIndex(retSlider.value);
    retValue.textContent = RETENTION_STEPS[applied].label;
    retWarn.hidden = applied !== RETENTION_STEPS.length - 1;
  });

  syncCacheSettingsAvailability();
}
function syncCacheSettingsAvailability() {
  const panel = document.getElementById('cacheSettings');
  if (!panel) return;
  const enabled = isHistoryEnabled();
  panel.classList.toggle('disabled', !enabled);
}

// ── Profiles modal ──
let _profilesActiveTab = 'tp';

function openProfilesModal() {
  /* Auto-sélection de l'onglet selon l'outil visible en arrière-plan */
  if (document.body.classList.contains('view-pf')) {
    _profilesActiveTab = 'pf';
  } else if (document.body.classList.contains('view-ml')) {
    _profilesActiveTab = 'ml';
  } else {
    _profilesActiveTab = 'tp';
  }
  renderTpProfilePane();
  renderMhaelleProfilePane();
  renderPsForgeProfilePane();
  requestPsForgeStats();   /* compteurs PsForge demandés à l'iframe (async) */
  switchProfilesTab(_profilesActiveTab);
  document.getElementById('profilesModal').classList.add('open');
}
function closeProfilesModal() {
  document.getElementById('profilesModal').classList.remove('open');
}
function switchProfilesTab(tab) {
  _profilesActiveTab = tab;
  document.getElementById('profilesPaneTP').classList.toggle('profiles-pane-hidden', tab !== 'tp');
  document.getElementById('profilesPaneML').classList.toggle('profiles-pane-hidden', tab !== 'ml');
  document.getElementById('profilesPanePF').classList.toggle('profiles-pane-hidden', tab !== 'pf');
  document.getElementById('profilesFooterTP').classList.toggle('profiles-footer-hidden', tab !== 'tp');
  document.getElementById('profilesFooterML').classList.toggle('profiles-footer-hidden', tab !== 'ml');
  document.getElementById('profilesFooterPF').classList.toggle('profiles-footer-hidden', tab !== 'pf');
  /* Masquer "Enregistrer" sur l'onglet PsForge — les actions sont immédiates */
  document.getElementById('btnProfilesSave').classList.toggle('profiles-save-btn-hidden', tab === 'pf');
  document.getElementById('profilesTabTP').classList.toggle('active', tab === 'tp');
  document.getElementById('profilesTabML').classList.toggle('active', tab === 'ml');
  document.getElementById('profilesTabPF').classList.toggle('active', tab === 'pf');
}

/* ── Onglet TenantPulse : toggles + drag-to-reorder ── */
function renderTpProfilePane() {
  const profile = loadProfile();
  const list = document.getElementById('profilesToggleList');
  list.replaceChildren();

  /* Partner Center — verrouillé, en tête de la section Raccourcis */
  const pc = REDIRECT_BUTTONS.find(b => b.key === 'partnerCenter');
  if (pc) {
    const lockedWrap = document.createElement('div'); lockedWrap.className = 'profiles-grid profiles-grid-locked';
    lockedWrap.appendChild(makeTpProfileItem(pc, profile, true));
    list.appendChild(lockedWrap);
  }

  /* Grille glissable (les 8 autres raccourcis) */
  const sortable = document.createElement('div'); sortable.className = 'profiles-grid';
  sortable.id = 'tpSortableGrid';
  const order = profile.order || REDIRECT_BUTTONS.filter(b => b.key !== 'partnerCenter').map(b => b.key);
  order.forEach(key => {
    const btn = REDIRECT_BUTTONS.find(b => b.key === key);
    if (btn) sortable.appendChild(makeTpProfileItem(btn, profile, false));
  });
  list.appendChild(sortable);
  setupTpDragReorder(sortable);
}

function makeTpProfileItem(btn, profile, locked) {
  const item = document.createElement('div');
  item.className = 'profile-item' + (locked ? ' locked' : '');
  item.dataset.key = btn.key;
  if (!locked) item.draggable = true;

  if (!locked) {
    const handle = document.createElement('span');
    handle.className = 'profile-drag-handle'; handle.textContent = '⠿';
    handle.setAttribute('aria-hidden', 'true');
    item.appendChild(handle);
  }
  const left = document.createElement('div'); left.className = 'profile-item-left';
  const icon = document.createElement('img'); icon.src = btn.icon; icon.alt = btn.label; icon.className = 'profile-item-icon';
  const name = document.createElement('span'); name.className = 'profile-item-name'; name.textContent = btn.label;
  left.appendChild(icon); left.appendChild(name);
  if (locked) {
    const badge = document.createElement('span'); badge.className = 'profile-item-badge'; badge.textContent = 'Recommandé';
    const info = document.createElement('span'); info.className = 'profile-item-info'; info.textContent = 'i';
    info.setAttribute('aria-label', 'Information'); info.setAttribute('tabindex', '0');
    info.title = "Le Partner Center permet de s'assurer que le tenant est bien présent dans votre base de données clients.";
    left.appendChild(badge); left.appendChild(info);
  }
  const sw = document.createElement('div');
  sw.className = 'drop-toggle-switch profile-item-switch' + (profile[btn.key] !== false ? ' on' : '') + (locked ? ' locked' : '');
  sw.dataset.key = btn.key; sw.style.flexShrink = '0';
  if (!locked) {
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', profile[btn.key] !== false ? 'true' : 'false');
    sw.addEventListener('click', e => {
      e.stopPropagation();
      const on = sw.classList.toggle('on');
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  item.appendChild(left); item.appendChild(sw);
  return item;
}

function setupTpDragReorder(grid) {
  let dragging = null;
  grid.addEventListener('dragstart', e => {
    dragging = e.target.closest('.profile-item[draggable]');
    if (dragging) { dragging.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
  });
  grid.addEventListener('dragend', () => {
    if (dragging) dragging.classList.remove('dragging');
    dragging = null;
    grid.querySelectorAll('.profile-item').forEach(i => i.classList.remove('drag-over'));
  });
  grid.addEventListener('dragover', e => {
    e.preventDefault();
    const target = e.target.closest('.profile-item[draggable]');
    if (target && target !== dragging) {
      grid.querySelectorAll('.profile-item').forEach(i => i.classList.remove('drag-over'));
      target.classList.add('drag-over');
      const rect = target.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) grid.insertBefore(dragging, target);
      else grid.insertBefore(dragging, target.nextSibling);
    }
  });
}

/* ── Onglet Mhaelle : toggles + drag-to-reorder ── */
function renderMhaelleProfilePane() {
  const mlProfile = loadMhaelleProfile();
  const hidden      = new Set(mlProfile.hidden || []);
  const defaultOpen = new Set(mlProfile.defaultOpen || []);
  const leftOrder   = mlProfile.left  || ['message', 'smtp', 'urls', 'reports'];
  const rightOrder  = mlProfile.right || ['auth', 'ms', 'signals'];

  const container = document.getElementById('mhaelleBlockList');
  container.replaceChildren();

  const cols = document.createElement('div'); cols.className = 'ml-block-cols';
  cols.appendChild(makeMlBlockSection('Colonne gauche', leftOrder, hidden, defaultOpen));
  cols.appendChild(makeMlBlockSection('Colonne droite', rightOrder, hidden, defaultOpen));
  container.appendChild(cols);
  /* Drag partagé entre les deux colonnes (cross-column) */
  setupMlCrossColDrag(cols);

}

function makeMlBlockSection(title, order, hidden, defaultOpen) {
  const section = document.createElement('div'); section.className = 'ml-block-section';
  const heading = document.createElement('div'); heading.className = 'ml-block-section-title';
  heading.textContent = title;
  section.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'ml-block-list';
  list.dataset.col = title === 'Colonne gauche' ? 'left' : 'right';

  order.forEach(key => {
    const block = ML_BLOCKS.find(b => b.key === key);
    if (!block) return;
    const item = document.createElement('div');
    item.className = 'ml-block-item'; item.dataset.key = key; item.draggable = true;

    const handle = document.createElement('span');
    handle.className = 'ml-block-handle'; handle.textContent = '⠿';
    handle.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'ml-block-name'; name.textContent = block.label;

    /* Case "Ouvert par défaut" */
    const openChk = document.createElement('div');
    openChk.className = 'ml-block-default-open' + (defaultOpen.has(key) ? ' checked' : '');
    openChk.dataset.key = key;
    openChk.title = 'Ouvrir ce bloc par défaut après chaque analyse';
    openChk.setAttribute('role', 'checkbox');
    openChk.setAttribute('aria-checked', defaultOpen.has(key) ? 'true' : 'false');
    const checkMark = document.createElement('span');
    checkMark.className = 'ml-block-check';
    checkMark.textContent = '✓';
    openChk.appendChild(checkMark);
    openChk.addEventListener('click', e => {
      e.stopPropagation();
      const on = openChk.classList.toggle('checked');
      openChk.setAttribute('aria-checked', on ? 'true' : 'false');
    });

    /* Switch visibilité — cliquable directement, pas via le row entier */
    const sw = document.createElement('div');
    sw.className = 'drop-toggle-switch ml-block-switch' + (hidden.has(key) ? '' : ' on');
    sw.dataset.key = key;
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', hidden.has(key) ? 'false' : 'true');
    sw.addEventListener('click', e => {
      e.stopPropagation();
      const on = sw.classList.toggle('on');
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
    });

    item.appendChild(handle); item.appendChild(name); item.appendChild(openChk); item.appendChild(sw);
    list.appendChild(item);
  });
  section.appendChild(list);
  return section;
}

/* Drag partagé entre les deux listes — permet de déplacer un bloc d'une colonne à l'autre. */
function setupMlCrossColDrag(cols) {
  let dragging = null;
  const lists = cols.querySelectorAll('.ml-block-list');

  const clearHints = () => {
    cols.querySelectorAll('.ml-block-item').forEach(i => i.classList.remove('drag-over'));
    cols.querySelectorAll('.ml-block-list').forEach(l => l.classList.remove('drag-target-empty'));
  };

  lists.forEach(list => {
    list.addEventListener('dragstart', e => {
      dragging = e.target.closest('.ml-block-item');
      if (dragging) { dragging.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
    });
    list.addEventListener('dragend', () => {
      if (dragging) dragging.classList.remove('dragging');
      dragging = null;
      clearHints();
    });
    list.addEventListener('dragover', e => {
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const target = e.target.closest('.ml-block-item');
      clearHints();
      if (target && target !== dragging) {
        target.classList.add('drag-over');
        const rect = target.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) list.insertBefore(dragging, target);
        else list.insertBefore(dragging, target.nextSibling);
      } else if (!target) {
        /* Survol d'une zone vide de la liste → on dépose à la fin */
        list.classList.add('drag-target-empty');
        if (dragging.parentElement !== list) list.appendChild(dragging);
      }
    });
  });
}

/* ── Sauvegarde commune ── */
function saveProfilesModal() {
  if (_profilesActiveTab === 'pf') return; /* PsForge : actions immédiates, rien à sauvegarder */
  if (_profilesActiveTab === 'ml') {
    saveMhaelleProfileFromModal();
  } else {
    saveTpProfileFromModal();
  }
}

/* ── Onglet PsForge : compteurs + effacements délégués à l'iframe (postMessage) ── */
let _pfProfileStats = null;   /* dernier instantané reçu (null = en attente) */
let _pfFrameReady   = false;  /* iframe PsForge chargée (load émis) */

function pfPostToFrame(msg) {
  const f = document.getElementById('psforgeFrame');
  if (f && f.contentWindow) {
    try { f.contentWindow.postMessage(msg, FRAME_TARGET_ORIGIN); } catch (e) {}
  }
}

/* Poste un message à l'iframe PsForge ; attend son chargement si nécessaire
   (et la charge si l'onglet n'a jamais été ouvert). */
function pfEnsureThenPost(type) {
  const f = document.getElementById('psforgeFrame');
  if (!f) return;
  if (_pfFrameReady && f.src) { pfPostToFrame({ type }); return; }
  f.addEventListener('load', function once() {
    f.removeEventListener('load', once);
    pfPostToFrame({ type });
  });
  if (!f.src) f.src = 'PF/psforge.html?embedded=1';
}
function requestPsForgeStats()   { pfEnsureThenPost('pf-profile-query'); }
function requestPsForgeStorage() { pfEnsureThenPost('pf-storage-list'); }

/* Réception des compteurs PsForge → re-render du panneau */
window.addEventListener('message', function (e) {
  const d = e.data;
  if (!d || d.type !== 'pf-profile-stats') return;
  _pfProfileStats = d.stats || {};
  renderPsForgeProfilePane();
});

function renderPsForgeProfilePane() {
  const pane = document.getElementById('psforgeDataPane');
  if (!pane) return;
  pane.replaceChildren();

  const s          = _pfProfileStats || {};
  const savedCnt   = s.saved      || 0;
  const favsCnt    = s.favorites  || 0;
  const importsCnt = (s.customCmds || 0) + (s.overrides || 0) + (s.groups || 0) + (s.groupOverrides || 0);
  const blocksCnt  = (s.blocksCount != null) ? s.blocksCount : 12;
  const hasCustomBlocks = !!s.blocksCustom;

  const sections = [
    {
      label:    'Commandes sauvegardées',
      iconSrc:  'assets/save.png',
      count:    savedCnt,
      desc:     savedCnt === 0 ? 'Aucune commande sauvegardée.' : savedCnt + ' commande(s) en mémoire.',
      btnLabel: 'Effacer les commandes',
      danger:   savedCnt > 0,
      action:   function () { pfPostToFrame({ type: 'pf-profile-clear', target: 'saved' }); }
    },
    {
      label:    'Commandes importées & personnalisées',
      iconSrc:  'assets/option.png',
      iconClass:'icon-adaptive-inv',  /* option.png est blanc → inversion en mode clair */
      count:    importsCnt,
      desc:     importsCnt === 0 ? 'Aucune commande importée ou personnalisée.' : importsCnt + ' élément(s) importé(s) / modifié(s).',
      btnLabel: 'Effacer les imports',
      danger:   importsCnt > 0,
      action:   function () { pfPostToFrame({ type: 'pf-profile-clear', target: 'imports' }); }
    },
    {
      label:    'Favoris',
      iconSrc:  'assets/history.png',
      count:    favsCnt,
      desc:     favsCnt === 0 ? 'Aucun favori enregistré.' : favsCnt + ' favori(s) enregistré(s).',
      btnLabel: 'Effacer les favoris',
      danger:   favsCnt > 0,
      action:   function () { pfPostToFrame({ type: 'pf-profile-clear', target: 'favorites' }); }
    },
    {
      label:    'Blocs de saisie',
      iconSrc:  'assets/option.png',
      iconClass:'icon-adaptive-inv',  /* option.png est blanc → inversion en mode clair */
      count:    blocksCnt,
      desc:     hasCustomBlocks ? 'Configuration personnalisée active.' : 'Configuration par défaut (12 blocs).',
      btnLabel: 'Réinitialiser les blocs',
      danger:   false,
      action:   function () { pfPostToFrame({ type: 'pf-profile-clear', target: 'blocks' }); }
    }
  ];

  sections.forEach(function (sec) {
    /* En-tête de section (collapsible — fermé par défaut) */
    const hd = document.createElement('button');
    hd.className = 'drop-section-btn';
    hd.setAttribute('data-drop-section', '');
    const hdLbl = document.createElement('span'); hdLbl.textContent = sec.label;
    const hdArr = document.createElement('span'); hdArr.className = 'ds-arrow'; hdArr.textContent = '▾';
    hd.appendChild(hdLbl); hd.appendChild(hdArr);
    hd.addEventListener('click', function () {
      hd.classList.toggle('open');
      body.classList.toggle('open');
    });
    pane.appendChild(hd);

    /* Corps */
    const body = document.createElement('div');
    body.className = 'drop-section-body';

    /* Ligne stats */
    const statsRow = document.createElement('div');
    statsRow.className = 'pf-prof-stats-row';

    const iconEl = document.createElement('img');
    iconEl.src = sec.iconSrc; iconEl.className = (sec.iconClass || 'icon-adaptive') + ' pf-prof-icon'; iconEl.alt = '';

    const descEl = document.createElement('span');
    descEl.className = 'pf-prof-desc'; descEl.textContent = sec.desc;

    const badge = document.createElement('span');
    badge.className = 'pf-prof-count' + (sec.count > 0 ? ' has-data' : '');
    badge.textContent = sec.count;

    statsRow.appendChild(iconEl);
    statsRow.appendChild(descEl);
    statsRow.appendChild(badge);
    body.appendChild(statsRow);

    /* Bouton d'action */
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'pf-prof-action-btn' + (sec.danger ? ' pf-prof-action-danger' : '');
    actionBtn.textContent = sec.btnLabel;
    actionBtn.addEventListener('click', sec.action);
    body.appendChild(actionBtn);

    pane.appendChild(body);
  });
}

function clearAllPsForgeData() {
  pfPostToFrame({ type: 'pf-profile-clear', target: 'all' });
}

function saveTpProfileFromModal() {
  const profile = {};
  document.querySelectorAll('.profile-item-switch').forEach(sw => {
    profile[sw.dataset.key] = sw.classList.contains('on');
  });
  profile.partnerCenter = true;
  /* Ordre des boutons glissables */
  const sortable = document.getElementById('tpSortableGrid');
  if (sortable) {
    profile.order = [...sortable.querySelectorAll('.profile-item[draggable]')].map(i => i.dataset.key);
  }
  saveProfile(profile);
  closeProfilesModal();
  if (currentState.ms && currentState.domain) {
    const center = document.getElementById('centerCol');
    const oldHero = center.querySelector('.tenant-hero');
    if (oldHero) {
      const confidence = computeConfidence(currentState.ms);
      center.replaceChild(renderHero(currentState.ms, currentState.domain, confidence), oldHero);
    }
  }
}

function saveMhaelleProfileFromModal() {
  const leftList  = document.querySelector('.ml-block-list[data-col="left"]');
  const rightList = document.querySelector('.ml-block-list[data-col="right"]');
  const left  = leftList  ? [...leftList.querySelectorAll('.ml-block-item')].map(i => i.dataset.key)  : [];
  const right = rightList ? [...rightList.querySelectorAll('.ml-block-item')].map(i => i.dataset.key) : [];
  const hidden = [];
  document.querySelectorAll('.ml-block-switch:not(.on)').forEach(sw => hidden.push(sw.dataset.key));
  const defaultOpen = [];
  document.querySelectorAll('.ml-block-default-open.checked').forEach(el => defaultOpen.push(el.dataset.key));
  const profile = { left, right, hidden, defaultOpen };
  saveMhaelleProfile(profile);
  /* Envoyer au iframe */
  const frame = document.getElementById('mhaelleFrame');
  if (frame && frame.contentWindow) {
    try { frame.contentWindow.postMessage({ type: 'ml-profile', profile }, FRAME_TARGET_ORIGIN); } catch {}
  }
  closeProfilesModal();
}

window.addEventListener('load', () => {
  bindEvents();
  syncHistoryToggleUI();
  renderHistory();
  syncCacheIndicator();

  // ── Synchronisation thème clair/sombre → iframes Mhaelle & PsForge ──
  // Utilise postMessage (fonctionne même avec le protocole file://)
  const mhaelleFrame = document.getElementById('mhaelleFrame');
  const psforgeFrame = document.getElementById('psforgeFrame');
  function postThemeToFrames() {
    const msg = { type: 'tp-theme', theme: document.documentElement.getAttribute('data-theme') || 'light' };
    [mhaelleFrame, psforgeFrame].forEach(f => {
      if (f && f.contentWindow) try { f.contentWindow.postMessage(msg, FRAME_TARGET_ORIGIN); } catch(e) {}
    });
  }
  // Envoie le thème dès que chaque iframe est chargée (1er accès ou rechargement)
  mhaelleFrame.addEventListener('load', postThemeToFrames);
  psforgeFrame.addEventListener('load', () => { _pfFrameReady = true; postThemeToFrames(); });
  // Suit tous les changements ultérieurs de data-theme sur le document parent
  new MutationObserver(postThemeToFrames)
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
});

// ── Panel ──
let openCardId = null;
let lastReport = null;
let currentState = { domain:null, ms:null, dns:null, goog:null, health:null, others:null, host:null, fullDone:false };

function panelTitle(src, cls, text) { const img = document.createElement('img'); img.src=src; img.className=cls; img.alt=''; return [img, document.createTextNode(' '+text)]; }
function openPanel(id, title, buildFn) {
  const panel   = document.getElementById('detailPanel');
  const body    = document.getElementById('panelBody');
  const titleEl = document.getElementById('panelTitle');
  document.querySelectorAll('.result-card').forEach(c => c.className = c.className.replace(/\bsel-\w+\b|\bselected\b/g, '').trim());
  if (openCardId === id) { openCardId = null; panel.classList.remove('open'); return; }
  openCardId = id;
  const card = document.getElementById('card-' + id);
  if (card) card.classList.add(card.dataset.selClass || 'selected');
  if (typeof title === 'string') { titleEl.textContent = title; } else { titleEl.replaceChildren(...title); }
  body.replaceChildren(); // FIX 2a : remplacé body.innerHTML = ''
  buildFn(body);
  panel.classList.add('open');
}
function closePanel() {
  const panel = document.getElementById('detailPanel');
  panel.classList.remove('open');
  document.querySelectorAll('.result-card').forEach(c => c.className = c.className.replace(/\bsel-\w+\b|\bselected\b/g, '').trim());
  openCardId = null;
}

// ── Input ──
const emailInput = document.getElementById('emailInput');
function extractDomain(val) {
  val = val.trim();
  if (val.startsWith('@')) val = val.slice(1);
  if (val.includes('@'))   val = val.split('@').pop();
  return val.toLowerCase().trim();
}
emailInput.addEventListener('input', () => {
  const d = extractDomain(emailInput.value) || 'domaine.com';
  const preview = document.getElementById('endpointPreview');
  preview.textContent = '';
  const pre = document.createTextNode('https://login.microsoftonline.com/');
  const domSpan = document.createElement('span'); domSpan.className = 'domain'; domSpan.textContent = d;
  const post = document.createTextNode('/.well-known/openid-configuration');
  preview.appendChild(pre); preview.appendChild(domSpan); preview.appendChild(post);
});
emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') checkFast(); });

// ── Step helpers ──
const stepControllers = {};
const stepRetryFns    = {};
const STEP_LABELS = {
  ms:     { active:'Interrogation Microsoft 365…', done:'Microsoft 365 ✓',   fail:'Microsoft 365 — Non trouvé',   timeout:'Microsoft 365 — Annulé' },
  google: { active:'Interrogation Google…',        done:'Google Workspace ✓', fail:'Google — Non détecté',         timeout:'Google — Annulé' },
  dns:    { active:'Récupération DNS…',            done:'DNS ✓',              fail:'DNS — Vide',                   timeout:'DNS — Annulé' },
  health: { active:'Vérification DKIM/DMARC…',    done:'Sécurité analysée ✓',fail:'Sécurité — Partiel',           timeout:'Sécurité — Annulé' },
  others: { active:'Détection services…',          done:'Autres services ✓',  fail:'Services — Partiel',           timeout:'Services — Annulé' },
  host:   { active:'Recherche hébergeur (WHOIS)…', done:'Hébergeur trouvé ✓', fail:'Hébergeur — Non trouvé',       timeout:'Hébergeur — Annulé' },
};
function setStep(id, state, label) {
  const el = document.getElementById(id); if (!el) return;
  el.className = 'p-step ' + state;
  const key    = id.replace('step-', '');
  const lbl    = label || STEP_LABELS[key]?.[state];
  if (lbl) { const labelEl = el.querySelector('.p-step-label'); if (labelEl) labelEl.textContent = lbl; }
}
function showSteps(ids) {
  document.querySelectorAll('.p-step').forEach(el => el.style.display = 'none');
  ids.forEach(id => { const el = document.getElementById('step-' + id); if (el) el.style.display = 'flex'; });
  document.getElementById('progList').style.display = 'flex';
}
function cancelStep(key) {
  const ctrl = stepControllers[key];
  if (ctrl) { ctrl.abort(); delete stepControllers[key]; }
  setStep('step-' + key, 'timeout');
}
async function retryStep(key) {
  const fn = stepRetryFns[key]; if (!fn) return;
  setStep('step-' + key, 'active');
  try { await fn(); } catch { setStep('step-' + key, 'timeout'); }
}

// ── Fetch helpers ──
async function fetchWithAbort(url, key, timeout, isJson) {
  const ctrl = new AbortController();
  stepControllers[key] = ctrl;
  const tid = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid); delete stepControllers[key];
    if (!r.ok) return null;
    return isJson ? await r.json() : await r.text();
  } catch { clearTimeout(tid); delete stepControllers[key]; return null; }
}
const fetchJsonC = (url, key, t=10000) => fetchWithAbort(url, key, t, true);
const fetchTextC = (url, key, t=10000) => fetchWithAbort(url, key, t, false);

async function fetchJson(url, timeout=9000) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeout);
  try { const r = await fetch(url, { signal: ctrl.signal }); clearTimeout(tid); if (!r.ok) return null; return await r.json(); }
  catch { clearTimeout(tid); return null; }
}
async function dnsQuery(name, type) {
  const d = await fetchJson(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`);
  return d ? (d.Answer || []) : [];
}

function extractGuid(s) {
  if (!s) return null;
  const m = s.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : null;
}

const MS_GENERIC_GUIDS = new Set(['9188040d-6c67-4c5b-b112-36a304b66dad','f8cdef31-a31e-4b4a-93e4-5f571e91255a','2f4a9838-26b7-47ee-be60-cfe0807d0ea7']);

async function validateTenantGuid(guid) {
  try {
    const r = await fetchJson(`https://login.microsoftonline.com/${guid}/.well-known/openid-configuration`, 6000);
    if (!r) return false;
    if (!r.issuer?.includes(guid)) return false;
    return !MS_GENERIC_GUIDS.has(guid.toLowerCase());
  } catch { return false; }
}

// ── Confidence tooltip ──
function showConfTooltip(e, confidence, ms) {
  const tip = document.getElementById('confTooltip');
  const rows = [
    { label: 'Tenant ID trouvé',      val: ms?.tenantId    ? '+45 pts ✓' : '0 pts —', earned: !!ms?.tenantId },
    { label: 'GUID validé Microsoft', val: ms?.tenantValid  ? '+30 pts ✓' : '0 pts —', earned: !!ms?.tenantValid },
    { label: 'Issuer présent',         val: ms?.issuer       ? '+15 pts ✓' : '0 pts —', earned: !!ms?.issuer },
    { label: 'Token endpoint',         val: ms?.tokenEndpoint? '+10 pts ✓' : '0 pts —', earned: !!ms?.tokenEndpoint },
  ];
  tip.replaceChildren(); // FIX 2b : remplacé tip.innerHTML = ''
  const title = document.createElement('div'); title.className = 'conf-tooltip-title'; title.textContent = 'Indice de confiance — ' + confidence + '%';
  tip.appendChild(title);
  rows.forEach(r => {
    const row = document.createElement('div'); row.className = 'conf-tooltip-row';
    const lbl = document.createElement('span'); lbl.className = 'conf-tooltip-label'; lbl.textContent = r.label;
    const val = document.createElement('span'); val.className = 'conf-tooltip-val'; val.textContent = r.val;
    val.style.color = r.earned ? '#86efac' : 'rgba(255,255,255,.35)';
    row.appendChild(lbl); row.appendChild(val); tip.appendChild(row);
  });
  const note = document.createElement('div');
  note.style.cssText = 'margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,.1);font-size:var(--text-xs);color:rgba(255,255,255,.38);line-height:1.5;font-style:italic';
  note.textContent = 'Namespace type non vérifiable depuis TenantPulse (bloqué par CORS navigateur).';
  tip.appendChild(note);
  const x = Math.min(e.clientX + 10, window.innerWidth - 260);
  const y = Math.min(e.clientY + 10, window.innerHeight - 200);
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
  tip.classList.add('visible');
}
function hideConfTooltip() {
  const tip = document.getElementById('confTooltip');
  if (tip) tip.classList.remove('visible');
}
document.addEventListener('mouseup', hideConfTooltip);

// ── Storage inspector ──
function fmtStorageSize(bytes) {
  if (bytes < 1024) return bytes + ' o';
  return (bytes / 1024).toFixed(1) + ' Ko';
}
function updateStorageSummary() {
  const sum = document.getElementById('storageModalSummary');
  if (!sum) return;
  const entries = document.querySelectorAll('.storage-entry');
  let total = 0;
  entries.forEach(e => { total += parseInt(e.dataset.bytes || '0', 10); });
  if (!entries.length) sum.textContent = 'Aucune donnée stockée';
  else sum.textContent = entries.length + (entries.length > 1 ? ' entrées' : ' entrée') + ' · ' + fmtStorageSize(total) + ' au total';
}
/* Entrée d'inspecteur (header dépliable + valeur + ×). onDelete(entry) décide
   de la suppression (locale pour le shell, postMessage pour l'iframe PsForge). */
function buildStorageEntry(key, raw, onDelete) {
  raw = raw || '';
  const sizeBytes = new Blob([raw]).size;
  let display = raw;
  try { display = JSON.stringify(JSON.parse(raw), null, 2); } catch {}
  const entry = document.createElement('div'); entry.className = 'storage-entry'; entry.dataset.bytes = String(sizeBytes);
  const head  = document.createElement('div'); head.className = 'storage-entry-head';
  const left  = document.createElement('div'); left.className = 'storage-entry-head-left';
  const keyEl = document.createElement('code'); keyEl.className = 'storage-entry-key'; keyEl.textContent = key;
  const size  = document.createElement('span'); size.className = 'storage-entry-size'; size.textContent = fmtStorageSize(sizeBytes);
  const arrow = document.createElement('span'); arrow.className = 'storage-entry-arrow'; arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '▾';
  left.appendChild(keyEl); left.appendChild(size);
  head.addEventListener('click', e => {
    if (e.target.closest('.storage-entry-del')) return;
    const isOpen = entry.classList.toggle('open');
    arrow.style.transform = isOpen ? 'rotate(180deg)' : '';
  });
  const del = document.createElement('button'); del.className = 'storage-entry-del'; del.title = 'Supprimer cette entrée'; del.setAttribute('aria-label', 'Supprimer ' + key);
  del.textContent = '×';
  del.addEventListener('click', () => onDelete(entry));
  head.appendChild(left); head.appendChild(arrow); head.appendChild(del);
  const val = document.createElement('pre'); val.className = 'storage-entry-val'; val.textContent = display;
  entry.appendChild(head); entry.appendChild(val);
  return entry;
}
function buildStorageEmptyMsg() {
  const msg = document.createElement('div'); msg.className = 'storage-empty-msg';
  const icon = document.createElement('div'); icon.className = 'storage-empty-icon';
  const img = document.createElement('img'); img.src = 'assets/save.png'; img.className = 'icon-adaptive'; img.alt = ''; img.style.cssText = 'width:2em;height:2em;opacity:.4';
  icon.appendChild(img);
  const txt = document.createElement('div'); txt.textContent = 'Aucune donnée stockée dans ce navigateur.';
  msg.appendChild(icon); msg.appendChild(txt);
  return msg;
}
/* Ajoute/retire le message « vide » selon le nombre d'entrées présentes */
function refreshStorageEmptyState() {
  const body = document.getElementById('storageInspectorBody');
  if (!body) return;
  const has = body.querySelectorAll('.storage-entry').length > 0;
  const existing = body.querySelector('.storage-empty-msg');
  if (has) { if (existing) existing.remove(); }
  else if (!existing) { body.appendChild(buildStorageEmptyMsg()); }
}

/* Réception du dump de stockage PsForge → (re)rendu de son groupe */
window.addEventListener('message', function (e) {
  const d = e.data;
  if (!d || d.type !== 'pf-storage-data') return;
  const group = document.getElementById('storagePfGroup');
  if (!group) return;
  group.replaceChildren();
  (d.entries || []).forEach(en => {
    group.appendChild(buildStorageEntry(en.key, en.value, () => {
      pfPostToFrame({ type: 'pf-storage-remove', key: en.key });   /* suppression + re-render via pf-storage-data */
    }));
  });
  refreshStorageEmptyState();
  updateStorageSummary();
});

function showStoragePanel() {
  document.getElementById('mainDropdown').classList.remove('open');
  const body = document.getElementById('storageInspectorBody');
  body.replaceChildren();

  /* Clés du shell (TenantPulse + profil Mhaelle). Les clés psforge_* vivent
     dans l'iframe (partition séparée en file://) → récupérées via postMessage. */
  const keys = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('psforge') !== 0) keys.push(k); } } catch {}
  keys.sort().forEach(key => {
    let raw = ''; try { raw = localStorage.getItem(key) || ''; } catch {}
    body.appendChild(buildStorageEntry(key, raw, entry => {
      try { localStorage.removeItem(key); } catch {}
      entry.remove();
      syncCacheIndicator(); syncHistoryToggleUI();
      updateStorageSummary(); refreshStorageEmptyState();
    }));
  });

  /* Groupe PsForge — rempli en asynchrone par le listener pf-storage-data */
  const pfGroup = document.createElement('div'); pfGroup.id = 'storagePfGroup';
  body.appendChild(pfGroup);
  requestPsForgeStorage();

  refreshStorageEmptyState();
  updateStorageSummary();
  document.getElementById('storageModal').classList.add('open');
}
function hideStoragePanel() {
  document.getElementById('storageModal').classList.remove('open');
}
function clearAllStorage() {
  /* Shell : toutes les clés (historique, profils TP & Mhaelle) */
  try {
    const ks = [];
    for (let i = 0; i < localStorage.length; i++) ks.push(localStorage.key(i));
    ks.forEach(k => { try { localStorage.removeItem(k); } catch {} });
  } catch {}
  /* PsForge : iframe (partition séparée en file://) */
  pfPostToFrame({ type: 'pf-storage-clear' });

  syncCacheIndicator(); syncHistoryToggleUI(); renderHistory();
  if (document.getElementById('storageModal').classList.contains('open')) showStoragePanel();
  const fill = document.getElementById('cacheClearFill');
  fill.style.transition = 'none'; fill.style.width = '0%';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.style.transition = 'width .5s ease'; fill.style.width = '100%';
    setTimeout(() => { fill.style.transition = 'width .3s ease'; fill.style.width = '0%'; syncCacheIndicator(); }, 540);
  }));
}

function computeConfidence(ms) {
  if (!ms) return 0;
  let score = 0;
  if (ms.tenantId)                                   score += 45;
  if (ms.tenantValid)                                score += 30;
  if (ms.issuer)                                     score += 15;
  if (ms.tokenEndpoint)                              score += 10;
  return Math.min(score, 100);
}

// ── Core checks ──

/**
 * Interroge les endpoints publics Microsoft pour identifier le tenant.
 * Usage interne uniquement — ne pas exposer comme API publique.
 * Appels : OIDC endpoint + federation metadata (lecture seule, pas d'auth).
 * @param {string} domain - Domaine à analyser (ex: contoso.com)
 */
/**
 * Interroge les endpoints publics Microsoft pour identifier le tenant.
 * Usage interne uniquement — ne pas exposer comme API publique.
 * Appels : OIDC endpoint + federation metadata (lecture seule, pas d'auth).
 * @param {string} domain - Domaine à analyser (ex: contoso.com)
 */
async function checkMicrosoft(domain) {
  let tenantId = null, realmData = null, oidcData = null, tenantValid = false;
  // FIX : userrealm supprimé — bloqué par CORS navigateur, redondant avec l'endpoint OIDC
  const direct = await fetchJsonC(`https://login.microsoftonline.com/${domain}/.well-known/openid-configuration`, 'ms', 8000);
  if (direct) {
    const c = extractGuid(direct.issuer) || extractGuid(direct.token_endpoint) || extractGuid(direct.authorization_endpoint);
    if (c && !MS_GENERIC_GUIDS.has(c.toLowerCase()) && direct.issuer?.includes(c)) { oidcData = direct; tenantId = c; tenantValid = true; }
  }
  if (!tenantId) {
    try {
      const x = await fetchTextC(`https://login.microsoftonline.com/${domain}/federationmetadata/2007-06/federationmetadata.xml`, 'ms', 8000);
      if (x) { const c = extractGuid(x); if (c && !MS_GENERIC_GUIDS.has(c.toLowerCase())) { const v = await validateTenantGuid(c); if (v) { tenantId = c; tenantValid = true; } } }
    } catch {}
  }
  if (tenantId && !tenantValid) { tenantValid = await validateTenantGuid(tenantId); if (!tenantValid) tenantId = null; }
  if (tenantId) return { tenantId, tenantValid, namespaceType: realmData?.NameSpaceType || null, federationType: realmData?.federation_protocol || null, cloudInstance: realmData?.cloud_instance_name || 'microsoftonline.com', issuer: oidcData?.issuer || null, tokenEndpoint: oidcData?.token_endpoint || null, authorizationEndpoint: oidcData?.authorization_endpoint || null, userInfoEndpoint: oidcData?.userinfo_endpoint || null };
  return null;
}

async function checkGoogle(domain) {
  try {
    const [oidc, mx] = await Promise.all([fetchJson('https://accounts.google.com/.well-known/openid-configuration'), fetchJson(`https://dns.google/resolve?name=${domain}&type=MX`)]);
    if (!oidc || !mx) return null;
    const ans = mx.Answer || [];
    if (!ans.some(a => a.data?.toLowerCase().includes('google'))) return null;
    return { issuer: oidc.issuer, authorizationEndpoint: oidc.authorization_endpoint, tokenEndpoint: oidc.token_endpoint, userInfoEndpoint: oidc.userinfo_endpoint, mxRecords: ans.map(a => a.data).filter(Boolean) };
  } catch { return null; }
}

async function checkDNS(domain) {
  const r = { mx: [], spf: null, txt: [], detectedProviders: [] };
  const mx  = await fetchJson(`https://dns.google/resolve?name=${domain}&type=MX`);  if (mx)  r.mx  = (mx.Answer  || []).map(a => a.data).filter(Boolean);
  const txt = await fetchJson(`https://dns.google/resolve?name=${domain}&type=TXT`); if (txt) { const all = (txt.Answer || []).map(a => a.data).filter(Boolean); r.spf = all.find(t => t.includes('v=spf1')) || null; r.txt = all; }
  const ms = r.mx.join(' ').toLowerCase(), ss = (r.spf || '').toLowerCase(), ts = r.txt.join(' ').toLowerCase();
  const providers = [
    [['google','googlemail'],              ['google'],                      'Google Workspace'],
    [['outlook','microsoft','protection.outlook'], ['microsoft','protection.outlook'], 'Microsoft 365'],
    [['amazonses'],                        ['amazonses'],                   'Amazon SES'],
    [['ovh'],                              [],                              'OVH Mail'],
    [['ionos','1and1'],                    ['ionos','1&1'],                 'IONOS / 1&1'],
    [['protonmail'],                       ['protonmail'],                  'Proton Mail'],
    [['zoho'],                             ['zoho'],                        'Zoho Mail'],
    [['mimecast'],                         ['mimecast'],                    'Mimecast'],
    [['pphosted','proofpoint'],            ['proofpoint'],                  'Proofpoint'],
    [['mailinblack'],                      ['mailinblack','spf.mailinblack'],'Mailinblack'],
    [['vadecloud','vadesecure'],           ['vadecloud','vadesecure'],      'Vade Secure'],
    [['barracudanetworks'],                ['barracudanetworks'],           'Barracuda'],
    [['hornetsecurity'],                   ['hornetsecurity'],              'Hornetsecurity'],
    [['spamtitan'],                        ['spamtitan'],                   'SpamTitan'],
    [['brevo','sendinblue'],               ['brevo','sendinblue'],          'Brevo'],
    [['mailjet'],                          ['mailjet'],                     'Mailjet'],
    [['sendgrid'],                         ['sendgrid'],                    'SendGrid'],
    [['mandrillapp','mandrill'],           ['mandrillapp'],                 'Mailchimp / Mandrill'],
    [['postmarkapp'],                      ['postmarkapp','spf.mtasv'],     'Postmark'],
  ];
  for (const [mxKeys, spfKeys, name] of providers) {
    if (mxKeys.some(k => ms.includes(k)) || spfKeys.some(k => ss.includes(k)) || (name === 'Proton Mail' && ts.includes('protonmail')))
      r.detectedProviders.push(name);
  }
  return r;
}

async function checkHealth(domain) {
  const checks = []; let score = 0;
  const mxA = await dnsQuery(domain, 'MX');
  if (mxA.length > 0) { score += 15; checks.push({ t:'ok',    icon:'assets/checked.png', title:'MX Records présents', desc: mxA.map(a => a.data).join(' | ') }); }
  else                              checks.push({ t:'error', icon:'assets/warning.png', title:'MX Records manquants',  desc: 'Aucun enregistrement MX.' });

  const txtA = await dnsQuery(domain, 'TXT'), allTxt = txtA.map(a => a.data).filter(Boolean), spf = allTxt.find(t => t.includes('v=spf1'));
  if (spf) { score += 15; checks.push({ t: spf.includes('-all') ? 'ok' : 'warn', icon: spf.includes('-all') ? 'assets/checked.png' : 'assets/warning.png', title: spf.includes('-all') ? 'SPF strict (-all)' : 'SPF (softfail ~all)', desc: spf }); }
  else     checks.push({ t:'error', icon:'assets/warning.png', title:'SPF manquant', desc:'Risque de spoofing.' });

  const dmarcA = await dnsQuery(`_dmarc.${domain}`, 'TXT'), dmarc = dmarcA.map(a => a.data).find(d => d.includes('v=DMARC1'));
  let dmarcIsQuarantine = false;
  if (dmarc) {
    const p = (dmarc.match(/p=([^;]+)/i) || [])[1]?.trim().toLowerCase();
    if (p === 'reject')     { score += 20; checks.push({ t:'ok',   icon:'assets/checked.png', title:'DMARC p=reject', desc: dmarc }); }
    else if (p === 'quarantine') { score += 20; dmarcIsQuarantine = true; checks.push({ t:'ok',   icon:'assets/checked.png', title:'DMARC p=quarantine (*)', desc: dmarc + ' — Niveau équivalent à reject. (*) p=reject serait préférable.' }); }
    else                    { score += 5;  checks.push({ t:'warn', icon:'assets/warning.png', title:'DMARC p=none',   desc: dmarc }); }
  } else checks.push({ t:'error', icon:'assets/warning.png', title:'DMARC manquant', desc: `Aucun _dmarc.${domain}` });

  const dkimSelectors = ['selector1','selector2','default','google','microsoft','k1','mail','dkim','smtp','email','mailjet','sendgrid','mandrill','amazonses','postmark','sparkpost','mxroute','zoho','protonmail','brevo','s1','s2','sig1'];
  const dkimResults   = {};
  for (const s of dkimSelectors) {
    const a = await dnsQuery(`${s}._domainkey.${domain}`, 'TXT');
    dkimResults[s] = a.map(x => x.data).find(d => d.includes('v=DKIM1') || d.includes('p=')) || null;
  }
  const foundSelectors = Object.entries(dkimResults).filter(([, v]) => v !== null);
  const hasSel1 = dkimResults['selector1'] !== null, hasSel2 = dkimResults['selector2'] !== null;
  if (foundSelectors.length > 0) {
    score += 25;
    const selNames = foundSelectors.map(([k]) => k).join(', ');
    let dkimDesc = `Sélecteurs actifs : ${selNames}`;
    if (hasSel1 && hasSel2)   dkimDesc += ' — (OK) Rotation Microsoft 365 (selector1 + selector2 actifs)';
    else if (hasSel1)          dkimDesc += ' — (!) selector1 actif, selector2 absent';
    else if (hasSel2)          dkimDesc += ' — (!) selector2 actif, selector1 absent';
    checks.push({ t:'ok', icon:'assets/checked.png', title:`DKIM actif (${selNames})`, desc: dkimDesc, dkimResults, hasSel1, hasSel2 });
  } else checks.push({ t:'error', icon:'assets/warning.png', title:'DKIM non détecté', desc:'Aucun DKIM sur les sélecteurs testés.', dkimResults, hasSel1:false, hasSel2:false });

  const cnA = await dnsQuery(`www.${domain}`, 'CNAME'), aA = await dnsQuery(`www.${domain}`, 'A');
  if      (cnA.length > 0) { score += 5; checks.push({ t:'ok',   icon:'assets/checked.png', title:'CNAME www',          desc: cnA.map(a => a.data).join(', ') }); }
  else if (aA.length  > 0) { score += 4; checks.push({ t:'info', icon:'assets/information.png', title:'www via A record',   desc: aA.map(a  => a.data).join(', ') }); }
  else                              checks.push({ t:'warn', icon:'assets/warning.png', title:'www non résolu',           desc: `Aucun CNAME ni A pour www.${domain}.` });

  const dsA = await dnsQuery(domain, 'DS'), dkA = await dnsQuery(domain, 'DNSKEY');
  if (dsA.length > 0 || dkA.length > 0) { score += 10; checks.push({ t:'ok',   icon:'assets/checked.png', title:'DNSSEC activé',          desc: `${dsA.length} DS, ${dkA.length} DNSKEY.` }); }
  else                                               checks.push({ t:'warn', icon:'assets/warning.png', title:'DNSSEC non activé',         desc: 'Vulnérable au DNS spoofing.' });

  const mtaSts = await dnsQuery(`_mta-sts.${domain}`, 'TXT'), mtaRec = mtaSts.map(a => a.data).find(d => d.includes('v=STSv1'));
  if (mtaRec) { score += 5; checks.push({ t:'ok',   icon:'assets/checked.png', title:'MTA-STS activé',         desc: mtaRec }); }
  else                  checks.push({ t:'info', icon:'assets/information.png', title:'MTA-STS non configuré',  desc: 'Recommandé pour les domaines pro.' });

  const bimiA = await dnsQuery(`default._bimi.${domain}`, 'TXT'), bimiRec = bimiA.map(a => a.data).find(d => d.includes('v=BIMI1'));
  if (bimiRec) { score += 5; checks.push({ t:'ok',   icon:'assets/checked.png', title:'BIMI configuré',          desc: bimiRec }); }
  else                  checks.push({ t:'info', icon:'assets/information.png', title:'BIMI absent',              desc: 'Nécessite DMARC p=quarantine ou reject.' });

  return { score: Math.min(score, 100), checks, dkimResults, hasSel1, hasSel2, dmarcIsQuarantine };
}

async function checkOtherTenants(domain, dns) {
  const t  = [], ms = (dns.mx || []).join(' ').toLowerCase(), ss = (dns.spf || '').toLowerCase(), ts = (dns.txt || []).join(' ').toLowerCase();

  t.push({ name:'Google Workspace', imgSrc:'assets/google.png',          on: ms.includes('google.com') || ms.includes('googlemail.com') });
  t.push({ name:'Mailinblack',      imgSrc:'assets/mailinblack.jpeg',    on: ms.includes('mailinblack') || ss.includes('mailinblack') });
  t.push({ name:'Mimecast',         imgSrc:'assets/Mimecast.png',        on: ms.includes('mimecast') || ss.includes('mimecast') });
  t.push({ name:'Proofpoint',       imgSrc:'assets/Proofpoint.png',      on: ms.includes('pphosted') || ms.includes('proofpoint') || ss.includes('proofpoint') });
  t.push({ name:'Vade Secure',      imgSrc:'assets/Vade.png',            on: ms.includes('vadecloud') || ms.includes('vadesecure') || ss.includes('vadecloud') });
  t.push({ name:'Barracuda',        imgSrc:'assets/Barracuda.png',       on: ms.includes('barracudanetworks') || ss.includes('barracudanetworks') });
  t.push({ name:'Hornetsecurity',   imgSrc:'assets/Hornetsecurity.png',  on: ms.includes('hornetsecurity') || ss.includes('hornetsecurity') });
  t.push({ name:'Brevo',            imgSrc:'assets/Brevo.jpeg',          on: ss.includes('brevo') || ss.includes('sendinblue') || ms.includes('sendinblue') });
  t.push({ name:'Mailjet',          imgSrc:'assets/Mailjet.png',         on: ss.includes('mailjet') || (await dnsQuery(`mailjet._domainkey.${domain}`, 'TXT')).length > 0 });
  t.push({ name:'SendGrid',         imgSrc:'assets/SendGrid.png',        on: ss.includes('sendgrid') || (await dnsQuery(`s1._domainkey.${domain}`, 'CNAME')).length > 0 });
  t.push({ name:'Postmark',         imgSrc:'assets/Postmark.png',        on: ss.includes('spf.mtasv') || ss.includes('postmarkapp') });

  const odoo = ts.includes('odoo') || ss.includes('odoo') || ms.includes('odoo') || (await dnsQuery(`odoo.${domain}`, 'CNAME')).length > 0;
  t.push({ name:'Odoo',             imgSrc:'assets/Odoo.png',            on: odoo });
  t.push({ name:'Salesforce',       imgSrc:'assets/Salesforce.png',      on: ts.includes('salesforce') || ss.includes('salesforce') });
  const hs = ts.includes('hubspot') || ss.includes('hubspot') || (await dnsQuery(`hs1._domainkey.${domain}`, 'CNAME')).length > 0;
  t.push({ name:'HubSpot',          imgSrc:'assets/HubSpot.png',         on: hs });
  t.push({ name:'Zendesk',          imgSrc:'assets/Zendesk.png',         on: ts.includes('zendesk') || ss.includes('zendesk') });
  t.push({ name:'Slack',            imgSrc:'assets/Slack.png',           on: ts.includes('slack') || ss.includes('slack-mail') });
  const atl = ts.includes('atlassian') || !!(dns.txt || []).find(x => x.toLowerCase().includes('atlassian-domain-verification'));
  t.push({ name:'Atlassian',        imgSrc:'assets/Atlassian.png',       on: atl });
  t.push({ name:'Amazon SES',       imgSrc:'assets/Amazon.png',          on: ss.includes('amazonses') || ms.includes('amazonses') });
  return t;
}

const MSA_DOMAINS = new Set(['outlook.com','outlook.fr','outlook.be','outlook.es','outlook.de','outlook.it','outlook.co.uk','outlook.jp','outlook.pt','outlook.dk','outlook.at','outlook.ch','hotmail.com','hotmail.fr','hotmail.be','hotmail.es','hotmail.de','hotmail.it','hotmail.co.uk','hotmail.nl','hotmail.pt','hotmail.dk','hotmail.se','hotmail.no','live.com','live.fr','live.be','live.nl','live.co.uk','live.de','live.it','live.es','live.se','live.dk','live.no','live.ca','live.com.au','msn.com','passport.com','windowslive.com']);
const isMsaPersonalDomain = d => MSA_DOMAINS.has(d.toLowerCase());

async function checkHost(domain) {
  function parseRdap(r) {
    const entities  = r.entities || []; let registrar = null;
    for (const e of entities) { if ((e.roles || []).includes('registrar')) { const fn = (e.vcardArray?.[1] || []).find(x => x[0] === 'fn'); if (fn) { registrar = fn[3]; break; } } }
    const ns      = (r.nameservers || []).map(n => n.ldhName).filter(Boolean);
    const events  = r.events || [];
    const created = events.find(e => e.eventAction === 'registration')?.eventDate;
    const expires = events.find(e => e.eventAction === 'expiration')?.eventDate;
    const updated = events.find(e => e.eventAction === 'last changed')?.eventDate;
    return { registrar, ns, status: r.status || [], created, expires, updated, hostName: detectHostFromNS(ns.join(' ').toLowerCase(), registrar || '') };
  }
  try { const r = await fetchJsonC(`https://rdap.org/domain/${domain}`, 'host', 12000); if (r) return parseRdap(r); } catch {}
  return null;
}

function detectHostFromNS(nsStr, registrar) {
  const r = registrar.toLowerCase();
  const map = [
    [['ovh'],                              ['ovh'],                         'OVH'],
    [['gandi'],                            ['gandi'],                       'Gandi'],
    [['cloudflare'],                       ['cloudflare'],                  'Cloudflare'],
    [['awsdns'],                           ['amazon','aws'],                'Amazon AWS / Route 53'],
    [['google'],                           ['google'],                      'Google Domains / Cloud DNS'],
    [['azure','microsoft'],                ['microsoft'],                   'Microsoft Azure DNS'],
    [['ionos','1and1'],                    ['ionos','1&1'],                  'IONOS / 1&1'],
    [['godaddy'],                          ['godaddy'],                     'GoDaddy'],
    [['namecheap'],                        ['namecheap'],                   'Namecheap'],
    [['infomaniak'],                       ['infomaniak'],                  'Infomaniak'],
    [['online.net'],                       ['online.net','scaleway'],       'Scaleway / Online.net'],
    [['o2switch'],                         ['o2switch'],                    'o2switch'],
    [['planethoster'],                     ['planethoster'],                'PlanetHoster'],
    [['nameshield'],                       ['nameshield'],                  'Nameshield'],
    [['amen.fr'],                          ['amen','agence des m'],         'AMEN'],
    [['cscdbs.com','cscglobal'],           ['csc corporate','csc global','corporation service'], 'CSC Corporate Domains'],
    [['markmonitor'],                      ['markmonitor'],                 'MarkMonitor'],
    [['verisign'],                         ['verisign'],                    'VeriSign'],
    [['networksolutions'],                 ['network solutions'],           'Network Solutions'],
    [['register.com'],                     ['register.com'],                'Register.com'],
    [['nic.fr'],                           ['afnic','nic.fr'],              'AFNIC'],
    [['bookmyname'],                       ['bookmyname'],                  'BookMyName'],
    [['hostinger'],                        ['hostinger'],                   'Hostinger'],
    [['siteground'],                       ['siteground'],                  'SiteGround'],
    [['bluehost'],                         ['bluehost'],                    'Bluehost'],
    [['dreamhost'],                        ['dreamhost'],                   'DreamHost'],
    [['wpengine'],                         ['wp engine'],                   'WP Engine'],
    [['hetzner'],                          ['hetzner'],                     'Hetzner'],
    [['digitalocean'],                     ['digitalocean'],                'DigitalOcean'],
    [['linode'],                           ['linode','akamai'],             'Akamai / Linode'],
    [['vultr'],                            ['vultr'],                       'Vultr'],
    [['dnsimple'],                         ['dnsimple'],                    'DNSimple'],
    [['name.com'],                         ['name.com'],                    'Name.com'],
    [['dynadot'],                          ['dynadot'],                     'Dynadot'],
    [['porkbun'],                          ['porkbun'],                     'Porkbun'],
    [['hover'],                            ['hover'],                       'Hover'],
    [['cloudns'],                          ['cloudns'],                     'ClouDNS'],
  ];
  for (const [nsKeys, rKeys, label] of map) {
    if (nsKeys.some(k => nsStr.includes(k)) || rKeys.some(k => r.includes(k))) return label;
  }
  return registrar || 'Inconnu';
}

function formatDate(d) {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }); } catch { return d; }
}

const HOST_LOGO_MAP = {
  ovh:              {domain:'ovh.com',               color:'#007DC5', label:'OVH'},
  cloudflare:       {domain:'cloudflare.com',         color:'#F48120', label:'CF'},
  gandi:            {domain:'gandi.net',              color:'#2E7D32', label:'GN'},
  godaddy:          {domain:'godaddy.com',            color:'#1BDB00', label:'GD'},
  namecheap:        {domain:'namecheap.com',          color:'#DE3723', label:'NC'},
  ionos:            {domain:'ionos.com',              color:'#003D8F', label:'IO'},
  '1and1':          {domain:'ionos.com',              color:'#003D8F', label:'IO'},
  infomaniak:       {domain:'infomaniak.com',         color:'#0098FF', label:'IK'},
  scaleway:         {domain:'scaleway.com',           color:'#7B5EA7', label:'SCW'},
  'online.net':     {domain:'online.net',             color:'#7B5EA7', label:'ONL'},
  amazon:           {domain:'aws.amazon.com',         color:'#FF9900', label:'AWS'},
  aws:              {domain:'aws.amazon.com',         color:'#FF9900', label:'AWS'},
  google:           {domain:'domains.google',         color:'#4285F4', label:'G'},
  microsoft:        {domain:'microsoft.com',          color:'#0078D4', label:'MS'},
  azure:            {domain:'azure.microsoft.com',    color:'#0078D4', label:'AZ'},
  o2switch:         {domain:'o2switch.fr',            color:'#2ECC71', label:'O2'},
  planethoster:     {domain:'planethoster.com',       color:'#E74C3C', label:'PH'},
  nameshield:       {domain:'nameshield.net',         color:'#003566', label:'NSH'},
  amen:             {domain:'amen.fr',                color:'#E2001A', label:'AMN'},
  'csc corporate':  {domain:'cscglobal.com',          color:'#1A1A2E', label:'CSC'},
  markmonitor:      {domain:'markmonitor.com',        color:'#003087', label:'MM'},
  verisign:         {domain:'verisign.com',           color:'#005A8E', label:'VS'},
  'network solutions':{domain:'networksolutions.com', color:'#E8622A', label:'NS'},
  'register.com':   {domain:'register.com',           color:'#0069AA', label:'RC'},
  afnic:            {domain:'afnic.fr',               color:'#003189', label:'AF'},
  bookmyname:       {domain:'bookmyname.com',         color:'#FF6600', label:'BM'},
  hostinger:        {domain:'hostinger.com',          color:'#7B2FBE', label:'HG'},
  siteground:       {domain:'siteground.com',         color:'#F7941D', label:'SG'},
  bluehost:         {domain:'bluehost.com',           color:'#003768', label:'BH'},
  dreamhost:        {domain:'dreamhost.com',          color:'#00ADEF', label:'DH'},
  'wp engine':      {domain:'wpengine.com',           color:'#40BFB0', label:'WP'},
  hetzner:          {domain:'hetzner.com',            color:'#D50C2D', label:'HZ'},
  digitalocean:     {domain:'digitalocean.com',       color:'#0080FF', label:'DO'},
  akamai:           {domain:'akamai.com',             color:'#009BDE', label:'AK'},
  linode:           {domain:'linode.com',             color:'#009BDE', label:'LN'},
  vultr:            {domain:'vultr.com',              color:'#007BFC', label:'VT'},
  dnsimple:         {domain:'dnsimple.com',           color:'#1083C6', label:'DS'},
  'name.com':       {domain:'name.com',               color:'#3E9A47', label:'NM'},
  dynadot:          {domain:'dynadot.com',            color:'#FF6600', label:'DY'},
  porkbun:          {domain:'porkbun.com',            color:'#F26522', label:'PB'},
  hover:            {domain:'hover.com',              color:'#41B6E6', label:'HV'},
  cloudns:          {domain:'cloudns.net',            color:'#2196F3', label:'CN'},
};

function _hostInitial(letter, color) {
  const s = document.createElement('span');
  s.style.cssText = `display:inline-flex;width:22px;height:22px;border-radius:4px;background:${color};color:#fff;font-size:9px;font-weight:500;align-items:center;justify-content:center`;
  s.textContent = letter;
  return s;
}

function hostLogo(hostName) {
  if (!hostName) return { el: _hostInitial('?', '#9ca3af') };
  const l = hostName.toLowerCase();
  for (const [key, val] of Object.entries(HOST_LOGO_MAP)) {
    if (l.includes(key)) {
      const wrap = document.createElement('span'); wrap.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px';
      const img = document.createElement('img'); img.src = `https://www.google.com/s2/favicons?domain=${val.domain}&sz=64`; img.style.cssText = 'width:22px;height:22px;object-fit:contain;border-radius:4px'; img.alt = val.label; img.loading = 'lazy';
      const fallback = _hostInitial(val.label.slice(0,2), val.color); fallback.style.display = 'none';
      img.onerror = () => { img.style.display = 'none'; fallback.style.display = 'inline-flex'; };
      wrap.appendChild(img); wrap.appendChild(fallback);
      return { el: wrap };
    }
  }
  return { el: _hostInitial(hostName[0]?.toUpperCase() || '?', '#6b7280') };
}

function makeImgIcon(src, alt, size) {
  const img = document.createElement('img');
  img.src = src; img.alt = alt;
  img.width = size || 20; img.height = size || 20;
  img.style.cssText = 'object-fit:contain;border-radius:3px;';
  return img;
}
function makeGoogleSvgIcon() {
  const NS  = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  [
    ['#4285F4', 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'],
    ['#34A853', 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'],
    ['#FBBC05', 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z'],
    ['#EA4335', 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'],
  ].forEach(([fill, d]) => {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('fill', fill);
    path.setAttribute('d', d);
    svg.appendChild(path);
  });
  return svg;
}

// ── UI helpers ──
function addRow(b, label, value, hiClass = '') {
  if (!value) return;
  const id  = 'rv_' + Math.random().toString(36).slice(2);
  const row = document.createElement('div');
  row.className = 'd-row' + (hiClass ? ' ' + hiClass : '');
  const lbl = document.createElement('div'); lbl.className = 'd-label'; lbl.textContent = label;
  const val = document.createElement('div'); val.className = 'd-value';
  const sp  = document.createElement('span'); sp.id = id; sp.style.flex = '1';
  String(value).split('\n').forEach((line, i) => { if (i > 0) sp.appendChild(document.createElement('br')); sp.appendChild(document.createTextNode(line)); });
  const btn = document.createElement('button'); btn.className = 'copy-btn'; btn.textContent = 'Copier';
  btn.addEventListener('click', () => copyVal(id, btn));
  val.appendChild(sp); val.appendChild(btn);
  row.appendChild(lbl); row.appendChild(val);
  b.appendChild(row);
}
function addSectionTitle(b, title) {
  const d = document.createElement('div'); d.className = 'panel-section-title'; d.textContent = title; b.appendChild(d);
}
function showError(msg) { const b = document.getElementById('errBox'); b.textContent = msg; b.style.display = 'block'; }
function copyVal(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText).then(() => { btn.textContent = '✓ Copié'; btn.classList.add('copied'); setTimeout(() => { btn.textContent = 'Copier'; btn.classList.remove('copied'); }, 1500); });
}
function lockButtons()     { document.getElementById('checkBtnFast').disabled = true;  document.getElementById('checkBtnFull').disabled = true; }
function unlockButtons()   { document.getElementById('checkBtnFast').disabled = false; document.getElementById('checkBtnFull').disabled = false; }
function setFastLoading(on){ document.getElementById('btnFastText').style.display = on ? 'none' : 'inline-flex'; document.getElementById('spinnerFast').style.display = on ? 'inline-block' : 'none'; }
function setFullLoading(on){ document.getElementById('btnFullText').style.display  = on ? 'none' : 'inline-flex'; document.getElementById('spinnerFull').style.display  = on ? 'inline-block' : 'none'; }

function buildScoreRing(score, dmarcIsQuarantine) {
  const r      = 22, circ = 2 * Math.PI * r, offset = circ - (score / 100) * circ;
  const color  = score < 40 ? '#dc2626' : score < 70 ? '#d97706' : '#16a34a';
  const lbl    = score >= 80 ? 'Excellent' : score >= 60 ? 'Bon' : score >= 40 ? 'Moyen' : 'Faible';
  const lblClr = score < 40 ? '#dc2626' : score < 70 ? '#b45309' : '#15803d';
  const bg     = score < 40 ? '#1A1010' : score < 70 ? '#12100C' : '#0C120C';

  const el = document.createElement('div'); el.className = 'score-block'; el.style.background = bg; el.style.borderColor = color + '44';

  const NS = 'http://www.w3.org/2000/svg';
  const ring = document.createElement('div'); ring.className = 'score-ring';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 54 54');
  const trk = document.createElementNS(NS, 'circle'); trk.setAttribute('class','trk'); trk.setAttribute('cx','27'); trk.setAttribute('cy','27'); trk.setAttribute('r', String(r));
  const fll = document.createElementNS(NS, 'circle'); fll.setAttribute('class','fll'); fll.setAttribute('cx','27'); fll.setAttribute('cy','27'); fll.setAttribute('r', String(r)); fll.setAttribute('stroke', color); fll.setAttribute('stroke-dasharray', String(circ)); fll.setAttribute('stroke-dashoffset', String(offset));
  svg.appendChild(trk); svg.appendChild(fll);
  const lbl_el = document.createElement('div'); lbl_el.className = 'lbl'; lbl_el.textContent = score + '%';
  if (dmarcIsQuarantine) { const star = document.createElement('span'); star.style.fontSize = '8px'; star.textContent = '*'; lbl_el.appendChild(star); }
  ring.appendChild(svg); ring.appendChild(lbl_el);

  const info = document.createElement('div'); info.className = 'score-info';
  const title = document.createElement('div'); title.className = 'score-title'; title.style.color = lblClr; title.textContent = 'Sécurité : ' + lbl;
  const desc  = document.createElement('div'); desc.className  = 'score-desc';  desc.textContent  = 'MX · SPF · DMARC · DKIM · DNSSEC · MTA-STS · BIMI';
  info.appendChild(title); info.appendChild(desc);
  if (dmarcIsQuarantine) { const star = document.createElement('div'); star.style.cssText = 'font-size:9.5px;font-weight:500;color:#b45309;margin-top:3px'; star.textContent = '* DMARC p=quarantine — score plein, p=reject recommandé'; info.appendChild(star); }

  el.appendChild(ring); el.appendChild(info);
  return el;
}

function buildDkimBlock(b, dkimResults, hasSel1, hasSel2) {
  addSectionTitle(b, 'Détail des sélecteurs DKIM testés');
  const priority = ['selector1', 'selector2'];
  const others   = Object.keys(dkimResults).filter(k => !priority.includes(k));
  for (const sel of [...priority, ...others]) {
    const val     = dkimResults[sel], present = val !== null;
    const isPri   = priority.includes(sel);
    const shortV  = val && val.length > 100 ? val.slice(0, 100) + '…' : val;
    const div     = document.createElement('div'); div.className = 'dkim-detail';
    const head = document.createElement('div'); head.className = 'dkim-detail-head';
    const selLbl = document.createElement('span'); selLbl.style.cssText = 'font-size:10.5px;font-weight:500;color:var(--text)';
    selLbl.textContent = sel + '._domainkey';
    if (isPri) { const tag = document.createElement('span'); tag.style.cssText = 'font-size:8px;color:#0078d4;font-weight:500;margin-left:4px'; tag.textContent = '[MS365]'; selLbl.appendChild(tag); }
    const badge = document.createElement('span'); badge.className = 'dkim-sel-badge' + (present ? '' : ' absent'); if (present) { const ck = document.createElement('img'); ck.src='assets/checked.png'; ck.className='icon-adaptive'; ck.alt=''; badge.appendChild(ck); badge.appendChild(document.createTextNode(' Présent')); } else { const ab = document.createElement('img'); ab.src='assets/warning.png'; ab.className='icon-adaptive'; ab.alt=''; badge.appendChild(ab); badge.appendChild(document.createTextNode(' Absent')); }
    head.appendChild(selLbl); head.appendChild(badge);
    div.appendChild(head);
    if (present && shortV) { const dv = document.createElement('div'); dv.className = 'dkim-val'; dv.textContent = shortV; div.appendChild(dv); }
    b.appendChild(div);
  }
}

function makeCard({ id, iconEl, iconBg, title, sub, badge, badgeCls, selCls, onClick }) {
  const card = document.createElement('div');
  card.className = 'result-card'; card.id = 'card-' + id; card.dataset.selClass = selCls;
  const row = document.createElement('div'); row.className = 'card-row';
  const left = document.createElement('div'); left.className = 'card-left';
  const iconWrap = document.createElement('div'); iconWrap.className = 'card-icon-wrap ' + iconBg;
  if (iconEl) iconWrap.appendChild(iconEl);
  const textWrap = document.createElement('div'); textWrap.style.cssText = 'flex:1;min-width:0;overflow:hidden';
  const titleEl = document.createElement('div'); titleEl.className = 'card-title'; titleEl.textContent = title;
  const subEl   = document.createElement('div'); subEl.className   = 'card-sub';   subEl.textContent   = sub;
  textWrap.appendChild(titleEl); textWrap.appendChild(subEl);
  left.appendChild(iconWrap); left.appendChild(textWrap);
  row.appendChild(left);
  if (badge) { const b = document.createElement('span'); b.className = 'card-badge ' + badgeCls; b.textContent = badge; row.appendChild(b); }
  const chev = document.createElement('span'); chev.className = 'card-chevron'; chev.textContent = '›';
  row.appendChild(chev);
  card.appendChild(row);
  card.addEventListener('click', onClick);
  return card;
}

// ── Hero renderer ──
function renderHero(ms, domain, confidence) {
  const hero = document.createElement('div'); hero.className = 'tenant-hero';
  const msLogoEl = () => { const i = document.createElement('img'); i.src='assets/Microsoft.png'; i.width=14; i.height=14; i.alt='Microsoft'; i.style.cssText='display:inline-block;vertical-align:middle;flex-shrink:0;opacity:.85;'; return i; };

  const mkLabel = (text) => {
    const d = document.createElement('div'); d.className = 'hero-label';
    const s = document.createElement('span'); s.style.cssText = 'display:inline-flex;align-items:center;gap:5px;';
    s.appendChild(msLogoEl()); s.appendChild(document.createTextNode(' ' + text));
    d.appendChild(s); return d;
  };
  const mkDomain = () => { const d = document.createElement('div'); d.className = 'hero-domain'; d.textContent = domain; return d; };

  if (!ms) {
    hero.style.background = 'linear-gradient(135deg,#374151 0%,#4b5563 100%)';
    hero.appendChild(mkLabel('Microsoft 365'));
    const none = document.createElement('div'); none.className = 'hero-none'; none.textContent = 'Aucun tenant Microsoft 365 détecté pour ce domaine';
    hero.appendChild(none); hero.appendChild(mkDomain());
  } else if (ms.tenantId && !ms.tenantValid) {
    hero.appendChild(mkLabel('Microsoft Tenant ID'));
    const guid = document.createElement('div'); guid.className = 'hero-guid'; guid.style.cssText = 'opacity:.45;text-decoration:line-through;font-size:15px';
    const sp = document.createElement('span'); sp.textContent = ms.tenantId; guid.appendChild(sp);
    hero.appendChild(guid); hero.appendChild(mkDomain());
    const alert = document.createElement('div'); alert.className = 'dup-alert warn';
    const ico = document.createElement('div'); ico.className = 'dup-icon'; const warnImg = document.createElement('img'); warnImg.src='assets/warning.png'; warnImg.className='icon-adaptive'; warnImg.alt=''; ico.appendChild(warnImg);
    const body = document.createElement('div'); body.className = 'dup-body';
    const t = document.createElement('div'); t.className = 'dup-title'; t.textContent = 'Tenant ID invalide';
    const desc = document.createElement('div'); desc.className = 'dup-desc'; desc.textContent = 'Le GUID ne correspond pas à un tenant 365 actif.';
    body.appendChild(t); body.appendChild(desc); alert.appendChild(ico); alert.appendChild(body);
    hero.appendChild(alert);
  } else {
    const hid = 'tid_' + Math.random().toString(36).slice(2);
    const confClass = confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low';
    const confLabel = confidence >= 80 ? 'Confiance élevée' : confidence >= 50 ? 'Confiance moyenne' : 'Confiance faible';
    hero.appendChild(mkLabel('Microsoft Tenant ID'));
    if (ms.tenantId) {
      const guid = document.createElement('div'); guid.className = 'hero-guid';
      const sp = document.createElement('span'); sp.id = hid; sp.textContent = ms.tenantId;
      const copyBtn = document.createElement('button'); copyBtn.className = 'hero-copy-btn'; copyBtn.textContent = 'Copier';
      copyBtn.addEventListener('click', () => copyVal(hid, copyBtn));
      const badge = document.createElement('span'); badge.className = 'confidence-badge ' + confClass;
      badge.textContent = confidence + '% — ' + confLabel;
      const infoBtn = document.createElement('button'); infoBtn.className = 'conf-info-btn'; infoBtn.textContent = 'i'; infoBtn.setAttribute('aria-label', 'Détail de l\'indice de confiance');
      infoBtn.addEventListener('mousedown', (e) => { e.preventDefault(); showConfTooltip(e, confidence, ms); });
      badge.appendChild(infoBtn);
      guid.appendChild(sp); guid.appendChild(copyBtn); guid.appendChild(badge);
      hero.appendChild(guid);
    } else {
      const none = document.createElement('div'); none.className = 'hero-none'; none.textContent = 'GUID non résolu — domaine Microsoft détecté';
      hero.appendChild(none);
    }
    hero.appendChild(mkDomain());
    if (ms.tenantId && ms.tenantValid) {
      const profile = loadProfile();
      const enabled = orderedRedirectButtons(profile).filter(b => profile[b.key] !== false);
      if (enabled.length > 0) {
        const actions = document.createElement('div'); actions.className = 'hero-actions';
        enabled.forEach(btn => {
          const safeHref = safeRedirectHref(btn.href, ms.tenantId, domain);
          if (!safeHref) return; // cible non fiable → bouton non rendu
          const a = document.createElement('a');
          a.className = 'hero-partner-btn' + (btn.key === 'partnerCenter' ? ' recommended' : '');
          a.href = safeHref;
          a.target = '_blank'; a.rel = 'noopener noreferrer';
          const icon = document.createElement('img'); icon.src = btn.icon; icon.alt = btn.label; icon.className = 'hero-partner-btn-icon';
          const text = document.createElement('div'); text.className = 'hero-partner-btn-text';
          const label = document.createElement('span'); label.className = 'hero-partner-btn-label'; label.textContent = btn.label;
          const sub = document.createElement('span'); sub.className = 'hero-partner-btn-sub'; sub.textContent = btn.sub;
          text.appendChild(label); text.appendChild(sub);
          a.appendChild(icon); a.appendChild(text);
          if (btn.key === 'partnerCenter') {
            const ribbon = document.createElement('span'); ribbon.className = 'hero-partner-btn-ribbon';
            const rLabel = document.createElement('span'); rLabel.className = 'hero-partner-btn-ribbon-label'; rLabel.textContent = 'Recommandé';
            const rInfo = document.createElement('span'); rInfo.className = 'hero-partner-btn-ribbon-info'; rInfo.textContent = 'i';
            rInfo.title = "Le Partner Center permet de s'assurer que le tenant est bien présent dans votre base de données clients.";
            rInfo.setAttribute('aria-label', 'Information');
            rInfo.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
            ribbon.appendChild(rLabel); ribbon.appendChild(rInfo);
            a.appendChild(ribbon);
          }
          actions.appendChild(a);
        });
        hero.appendChild(actions);
      }
    }
  }
  return hero;
}

// ── Export ──
function exportReport() {
  if (!lastReport) return;
  const r   = lastReport;
  const HR  = '_'.repeat(36);
  const dateStr = new Date(r.analysedAt).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
  const lines = [];

  // ── Header ──────────────────────────────────
  lines.push('TENANTPULSE \u2014 SECURITY SUMMARY REPORT');
  lines.push(r.domain + '  ' + dateStr);
  lines.push(HR);
  lines.push('');

  // ── Tenant MS365 ────────────────────────────
  if (r.microsoft?.tenantId && r.microsoft.tenantValid) {
    lines.push('MS365 Tenant: Valid\u00e9');
    lines.push('Tenant ID: ' + r.microsoft.tenantId);
  } else if (r.microsoft?.tenantId && !r.microsoft.tenantValid) {
    lines.push('MS365 Tenant: GUID invalide');
    lines.push('Tenant ID: ' + r.microsoft.tenantId + ' (non valid\u00e9)');
  } else {
    lines.push('MS365 Tenant: Non d\u00e9tect\u00e9');
  }
  lines.push(HR);
  lines.push('');

  // ── Security Checks ─────────────────────────
  lines.push('SECURITY CHECKS:');
  lines.push('');
  if (r.health) {
    const mapCheck = (c) => {
      const t = c.title;
      if (t.includes('MX Records pr\u00e9sents'))       return 'MX Records: OK';
      if (t.includes('MX Records manquants'))             return 'MX Records: MANQUANT';
      if (t.includes('SPF strict'))                       return 'SPF: OK';
      if (t.includes('SPF (softfail'))                    return 'SPF: OK (softfail \u2014 ~all)';
      if (t.includes('SPF manquant'))                     return 'SPF: MANQUANT';
      if (t.includes('DMARC p=reject'))                   return 'DMARC: OK (p=reject)';
      if (t.includes('DMARC p=quarantine'))               return 'DMARC: OK (p=quarantine *)';
      if (t.includes('DMARC p=none'))                     return 'DMARC: KO (p=none)';
      if (t.includes('DMARC manquant'))                   return 'DMARC: MANQUANT';
      if (t.includes('DKIM actif')) {
        const m = t.match(/DKIM actif \((.+)\)/);
        return 'DKIM: OK' + (m ? ' (' + m[1] + ')' : '');
      }
      if (t.includes('DKIM non d\u00e9tect\u00e9'))      return 'DKIM: MANQUANT';
      if (t.includes('CNAME www'))                        return 'www via CNAME: OK';
      if (t.includes('www via A record'))                 return 'www via A record: [i]';
      if (t.includes('www non r\u00e9solu'))              return 'www: KO';
      if (t.includes('DNSSEC activ\u00e9'))               return 'DNSSEC: OK';
      if (t.includes('DNSSEC non'))                       return 'DNSSEC: KO';
      if (t.includes('MTA-STS activ\u00e9'))              return 'MTA-STS: OK';
      if (t.includes('MTA-STS non'))                      return 'MTA-STS: KO';
      if (t.includes('BIMI configur\u00e9'))              return 'BIMI: OK';
      if (t.includes('BIMI absent'))                      return 'BIMI: KO';
      const status = c.type === 'ok' ? 'OK' : c.type === 'warn' ? 'KO' : c.type === 'error' ? 'MANQUANT' : '[i]';
      return t + ': ' + status;
    };
    r.health.checks.forEach(c => lines.push(mapCheck(c)));
  } else {
    lines.push('(Analyse rapide \u2014 s\u00e9curit\u00e9 non v\u00e9rifi\u00e9e)');
    lines.push('Lancez l\u2019analyse compl\u00e8te pour voir SPF, DMARC, DKIM\u2026');
  }
  lines.push(HR);
  lines.push('');

  // ── Infrastructure ──────────────────────────
  lines.push('INFRASTRUCTURE:');
  lines.push('');
  const cloud = r.microsoft
    ? 'Microsoft 365'
    : r.google
      ? 'Google Workspace'
      : r.dns?.detectedProviders?.[0] || '\u2014';
  if (r.host?.hostName)              lines.push('Provider: '       + r.host.hostName);
  lines.push(                                    'Cloud Platform: ' + cloud);
  if (r.host?.registrar)             lines.push('Registrar: '      + r.host.registrar);
  if (r.microsoft?.cloudInstance)    lines.push('Cloud Instance: ' + r.microsoft.cloudInstance);
  if (r.host?.created)               lines.push('Domain Since: '   + new Date(r.host.created).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }));
  if (r.host?.expires)               lines.push('Expires: '        + new Date(r.host.expires).toLocaleDateString('en-GB',  { day:'2-digit', month:'short', year:'numeric' }));
  if (r.dns?.mx?.length)             lines.push('MX: '             + r.dns.mx[0] + (r.dns.mx.length > 1 ? ' (+' + (r.dns.mx.length - 1) + ')' : ''));
  lines.push(HR);
  lines.push('');

  // ── Key Risks ───────────────────────────────
  if (r.health) {
    const RISK_MAP = [
      { match: t => t.includes('MX Records manquants'),                  msg: 'No MX records: mail server not configured' },
      { match: t => t.includes('SPF manquant'),                          msg: 'No SPF: spoofing risk' },
      { match: t => t.includes('SPF (softfail'),                         msg: 'SPF softfail: spoofing partially possible' },
      { match: t => t.includes('DMARC manquant'),                        msg: 'No DMARC: phishing risk' },
      { match: t => t.includes('DMARC p=none'),                          msg: 'DMARC p=none: no enforcement' },
      { match: t => t.includes('DKIM non d\u00e9tect\u00e9'),            msg: 'No DKIM: weak email authentication' },
      { match: t => t.includes('DNSSEC non'),                            msg: 'No DNSSEC: integrity validation' },
    ];
    const risks = [];
    r.health.checks.forEach(c => {
      if (c.type !== 'error' && c.type !== 'warn') return;
      for (const rule of RISK_MAP) {
        if (rule.match(c.title) && !risks.includes(rule.msg)) {
          risks.push(rule.msg);
          break;
        }
      }
    });
    if (risks.length) {
      lines.push('KEY RISKS:');
      lines.push('');
      risks.forEach(r => lines.push('-' + r));
      lines.push(HR);
      lines.push('');
    }
  }

  // ── Recommended Actions ─────────────────────
  if (r.health) {
    const actions = [];
    r.health.checks.forEach(c => {
      if (c.type === 'error') {
        if (c.title.includes('DKIM'))  actions.push('Enable and configure DKIM signing');
        if (c.title.includes('SPF'))   actions.push('Add a valid SPF record (-all)');
        if (c.title.includes('DMARC')) actions.push('Deploy a DMARC policy (p=quarantine minimum)');
        if (c.title.includes('MX'))    actions.push('Configure MX records');
      }
      if (c.type === 'warn') {
        if (c.title.includes('DMARC') && c.title.includes('none'))     actions.push('Enforce DMARC \u2014 move to p=quarantine or p=reject');
        if (c.title.includes('SPF')   && c.title.includes('softfail')) actions.push('Harden SPF \u2014 replace ~all with -all');
        if (c.title.includes('DNSSEC'))                                 actions.push('Activate DNSSEC on your registrar');
      }
      if (c.type === 'info') {
        if (c.title.includes('MTA-STS')) actions.push('Configure MTA-STS for inbound mail security');
        if (c.title.includes('BIMI'))    actions.push('Configure BIMI (requires DMARC enforce)');
      }
    });
    const unique = [...new Set(actions)];
    if (unique.length) {
      lines.push('RECOMMENDED ACTIONS:');
      lines.push('');
      unique.forEach((a, i) => lines.push(' ' + (i + 1) + '.  ' + a));
      lines.push(HR);
      lines.push('');
    }
  }

  // ── Detected Services ────────────────────────
  const active = (r.otherServices || []).filter(s => s.on);
  if (active.length) {
    lines.push('DETECTED SERVICES:');
    lines.push('');
    lines.push(active.map(s => s.name).join(' \u00b7 '));
    lines.push(HR);
    lines.push('');
  }

  // ── Footer ───────────────────────────────────
  lines.push('TenantPulse \u2014 Internal RUN MW Platform \u2014 v0.6 in development');

  const text = lines.join('\n');
  const btn  = document.getElementById('exportBtn');
  function setBtnContent(src, cls, label) {
    btn.replaceChildren();
    const img = document.createElement('img'); img.src = src; img.className = cls; img.alt = '';
    btn.appendChild(img); btn.appendChild(document.createTextNode(' ' + label));
  }
  navigator.clipboard.writeText(text).then(() => {
    setBtnContent('assets/checked.png', 'icon-adaptive', 'Rapport copi\u00e9 !');
    setTimeout(() => setBtnContent('assets/copy.png', 'icon-adaptive', 'Copier le rapport'), 2000);
  }).catch(() => {
    setBtnContent('assets/warning.png', 'icon-adaptive', 'Copiez manuellement');
    setTimeout(() => setBtnContent('assets/copy.png', 'icon-adaptive', 'Copier le rapport'), 3000);
  });
}
// ── Common panel builders ──
function buildMsPanel(ms) {
  return b => [
    ms.namespaceType       && ['Namespace Type',         ms.namespaceType],
    ms.federationType      && ['Fédération',             ms.federationType],
    ms.cloudInstance       && ['Cloud Instance',         ms.cloudInstance],
    ms.issuer              && ['Issuer',                 ms.issuer],
    ms.tokenEndpoint       && ['Token Endpoint',         ms.tokenEndpoint],
    ms.authorizationEndpoint && ['Authorization Endpoint', ms.authorizationEndpoint],
    ms.userInfoEndpoint    && ['UserInfo Endpoint',      ms.userInfoEndpoint],
  ].filter(Boolean).forEach(([l, v]) => addRow(b, l, v));
}
function buildGooglePanel(goog) {
  return b => { addRow(b, 'MX Records', goog.mxRecords.join('\n'), 'hi-google'); addRow(b, 'Issuer', goog.issuer); addRow(b, 'Authorization', goog.authorizationEndpoint); addRow(b, 'Token', goog.tokenEndpoint); addRow(b, 'UserInfo', goog.userInfoEndpoint); };
}
function buildDnsPanel(dns) {
  const rows = [dns.mx?.length && ['MX Records', dns.mx.join('\n')], dns.spf && ['SPF Record', dns.spf], dns.detectedProviders?.length && ['Providers détectés', dns.detectedProviders.join(', ')], dns.txt?.length && ['TXT Records', dns.txt.join('\n')]].filter(Boolean);
  return b => rows.forEach(([l, v]) => addRow(b, l, v));
}
function buildHostPanel(host, domain) {
  return b => {
    const logo = hostLogo(host.hostName);
    const sum  = document.createElement('div'); sum.className = 'host-summary';
    const logoDiv = document.createElement('div'); logoDiv.className = 'host-logo'; logoDiv.appendChild(logo.el);
    const info = document.createElement('div');
    const nameEl = document.createElement('div'); nameEl.className = 'host-name'; nameEl.textContent = host.hostName || 'Inconnu';
    const subEl  = document.createElement('div'); subEl.className  = 'host-sub';  subEl.textContent  = host.registrar || 'Registrar non disponible';
    info.appendChild(nameEl); info.appendChild(subEl);
    sum.appendChild(logoDiv); sum.appendChild(info);
    b.appendChild(sum);
    if (host.ns?.length)    addRow(b, 'Serveurs de noms (NS)', host.ns.join('\n'));
    if (host.created)       addRow(b, 'Date de création',      formatDate(host.created));
    if (host.expires)       addRow(b, "Date d'expiration",     formatDate(host.expires));
    if (host.updated)       addRow(b, 'Dernière mise à jour',  formatDate(host.updated));
    if (host.status?.length)addRow(b, 'Statut WHOIS',          host.status.join(', '));
    const lnk = document.createElement('a'); lnk.className = 'ext-link'; lnk.href = `https://www.whois.com/whois/${encodeURIComponent(domain)}`; lnk.target = '_blank'; lnk.rel = 'noopener noreferrer';
    const lnkIcon = document.createTextNode('→ WHOIS complet — '); const lnkStrong = document.createElement('strong'); lnkStrong.textContent = domain;
    lnk.appendChild(lnkIcon); lnk.appendChild(lnkStrong); b.appendChild(lnk);
  };
}
function buildHealthPanel(health, domain) {
  return b => {
    b.appendChild(buildScoreRing(health.score, health.dmarcIsQuarantine));
    const hcl = document.createElement('div'); hcl.className = 'hc-list';
    health.checks.forEach(c => {
      const it = document.createElement('div'); it.className = 'hc-item ' + c.t;
      const ico = document.createElement('div'); ico.className = 'hc-icon'; const icoImg = document.createElement('img'); icoImg.src = c.icon; icoImg.className = 'icon-adaptive'; icoImg.alt = ''; ico.appendChild(icoImg);
      const body = document.createElement('div'); body.className = 'hc-body';
      const ttl = document.createElement('div'); ttl.className = 'hc-title'; ttl.textContent = c.title;
      const dsc = document.createElement('div'); dsc.className = 'hc-desc';  dsc.textContent = c.desc;
      body.appendChild(ttl); body.appendChild(dsc); it.appendChild(ico); it.appendChild(body);
      hcl.appendChild(it);
    });
    b.appendChild(hcl);
    buildDkimBlock(b, health.dkimResults, health.hasSel1, health.hasSel2);
    const lnk = document.createElement('a'); lnk.className = 'ext-link'; lnk.href = `https://mxtoolbox.com/SuperTool.aspx?action=mx:${encodeURIComponent(domain)}`; lnk.target = '_blank'; lnk.rel = 'noopener';
    const lnkIcon = document.createTextNode('→ Analyse complète sur MXToolbox — '); const lnkStrong = document.createElement('strong'); lnkStrong.textContent = domain;
    lnk.appendChild(lnkIcon); lnk.appendChild(lnkStrong); b.appendChild(lnk);
  };
}

function msRows(ms) {
  return [ms.namespaceType && ['Namespace Type', ms.namespaceType], ms.federationType && ['Fédération', ms.federationType], ms.cloudInstance && ['Cloud Instance', ms.cloudInstance], ms.issuer && ['Issuer', ms.issuer], ms.tokenEndpoint && ['Token Endpoint', ms.tokenEndpoint], ms.authorizationEndpoint && ['Authorization Endpoint', ms.authorizationEndpoint], ms.userInfoEndpoint && ['UserInfo Endpoint', ms.userInfoEndpoint]].filter(Boolean);
}
function healthScoreLbl(health) {
  const star = health.dmarcIsQuarantine ? ' *' : '';
  return `${health.score}%${star}`;
}
function healthSubLbl(health) {
  const errC = health.checks.filter(c => c.t === 'error').length, warnC = health.checks.filter(c => c.t === 'warn').length;
  const dkim = health.hasSel1 && health.hasSel2 ? ' · DKIM ✓✓' : health.hasSel1 || health.hasSel2 ? ' · DKIM ✓!' : ' · DKIM ✗';
  return `SPF · DMARC · DKIM · DNSSEC · MTA-STS${errC > 0 ? ' — ' + errC + ' erreur(s)' : ''}${warnC > 0 ? ', ' + warnC + ' avert.' : ''}${dkim}`;
}

// ── FAST check ──
async function checkFast() {
  const raw = emailInput.value.trim(); if (!raw) { showError('Veuillez entrer une adresse e-mail ou un domaine.'); return; }
  const domain = extractDomain(raw); if (!domain || !domain.includes('.')) { showError('Domaine invalide.'); return; }
  const center = document.getElementById('centerCol'), exportBtn = document.getElementById('exportBtn'), errBox = document.getElementById('errBox');
  errBox.style.display = 'none'; center.replaceChildren(); closePanel();
  exportBtn.classList.remove('visible'); lastReport = null;
  currentState = { domain, ms:null, dns:null, goog:null, health:null, others:null, host:null, fullDone:false };
  showSteps(['ms', 'google', 'dns']);
  try {
    setStep('step-ms', 'active');
    stepRetryFns.ms = async () => { setStep('step-ms', 'active'); currentState.ms = isMsaPersonalDomain(domain) ? null : await checkMicrosoft(domain); setStep('step-ms', currentState.ms ? 'done' : 'fail'); };
    currentState.ms = isMsaPersonalDomain(domain) ? null : await checkMicrosoft(domain);
    if (!document.getElementById('step-ms').className.includes('timeout')) setStep('step-ms', currentState.ms ? 'done' : 'fail');

    setStep('step-google', 'active');
    stepRetryFns.google = async () => { setStep('step-google', 'active'); currentState.goog = await checkGoogle(domain); setStep('step-google', currentState.goog ? 'done' : 'fail'); };
    currentState.goog = await checkGoogle(domain);
    if (!document.getElementById('step-google').className.includes('timeout')) setStep('step-google', currentState.goog ? 'done' : 'fail');

    setStep('step-dns', 'active');
    stepRetryFns.dns = async () => { setStep('step-dns', 'active'); currentState.dns = await checkDNS(domain); setStep('step-dns', currentState.dns?.mx?.length > 0 ? 'done' : 'fail'); };
    currentState.dns = await checkDNS(domain);
    if (!document.getElementById('step-dns').className.includes('timeout')) setStep('step-dns', currentState.dns.mx.length > 0 ? 'done' : 'fail');

    document.getElementById('progList').style.display = 'none';
    const confidence = computeConfidence(currentState.ms);
    lastReport = { domain, analysedAt: new Date().toISOString(), input: raw, microsoft: currentState.ms, google: currentState.goog, dns: currentState.dns, health: null, otherServices: null, host: null, tenantConfidence: confidence, fullDone: false };
    if (currentState.ms?.tenantId && currentState.ms.tenantValid) addToHistory(domain, currentState.ms.tenantId);
    center.appendChild(renderHero(currentState.ms, domain, confidence));
    if (currentState.dns?.detectedProviders?.length) {
      const pb = document.createElement('div'); pb.className = 'pills-block';
      const pl = document.createElement('div'); pl.className = 'pills-label'; pl.textContent = 'Providers e-mail détectés (DNS)';
      const pr = document.createElement('div'); pr.className = 'pills-row';
      currentState.dns.detectedProviders.forEach(name => { const p = document.createElement('div'); p.className = 'pill on'; p.textContent = '✓ ' + name; pr.appendChild(p); });
      pb.appendChild(pl); pb.appendChild(pr); center.appendChild(pb);
    }
    if (currentState.ms?.tenantValid) {
      const rows = msRows(currentState.ms);
      center.appendChild(makeCard({ id:'ms', iconEl:makeImgIcon('assets/Microsoft.png','Microsoft',22), iconBg:'ms-clr', title:'Microsoft 365 / Entra ID', sub:'Endpoints & informations tenant', badge: rows.length + ' champs', badgeCls:'ms-b', selCls:'selected', onClick: () => openPanel('ms', 'Microsoft 365 / Entra ID', buildMsPanel(currentState.ms)) }));
    }
    if (currentState.goog) center.appendChild(makeCard({ id:'google', iconEl:makeGoogleSvgIcon(), iconBg:'gg-clr', title:'Google Workspace', sub:'OpenID Connect & MX Records', badge:'5 champs', badgeCls:'gg-b', selCls:'sel-google', onClick: () => openPanel('google', panelTitle('assets/google.png', 'icon-plain', 'Google Workspace'), buildGooglePanel(currentState.goog)) }));
    const dnsRowCount = [currentState.dns?.mx?.length, currentState.dns?.spf, currentState.dns?.detectedProviders?.length, currentState.dns?.txt?.length].filter(Boolean).length;
    if (dnsRowCount) center.appendChild(makeCard({ id:'dns', iconEl:makeImgIcon('assets/DNS.png','DNS',20), iconBg:'dn-clr', title:'Enregistrements DNS', sub:'MX · SPF · TXT', badge: dnsRowCount + ' entrées', badgeCls:'dn-b', selCls:'sel-dns', onClick: () => openPanel('dns', panelTitle('assets/DNS.png', 'icon-plain', 'Enregistrements DNS'), buildDnsPanel(currentState.dns)) }));
    const ctaBtn = document.createElement('button'); ctaBtn.className = 'btn-trigger-full'; ctaBtn.id = 'btnTriggerFull';
    (() => {
      ctaBtn.textContent = '';
      const lbl = document.createElement('span'); lbl.id = 'stfLabel';
      const img = document.createElement('img'); img.src='assets/Analyse.png'; img.width=14; img.height=14; img.alt=''; img.style.cssText='display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px;';
      lbl.appendChild(img); lbl.appendChild(document.createTextNode("Lancer l'analyse complète"));
      const spinner = document.createElement('span'); spinner.className = 'stf-spinner';
      const hint = document.createElement('span'); hint.style.cssText='font-size:10px;opacity:.65;margin-left:4px'; hint.textContent='WHOIS · sécurité DNS';
      ctaBtn.appendChild(lbl); ctaBtn.appendChild(spinner); ctaBtn.appendChild(hint);
    })();
    ctaBtn.addEventListener('click', () => runFullFromState(raw, domain, ctaBtn), { once: true });
    center.appendChild(ctaBtn);
  } catch (err) { document.getElementById('progList').style.display = 'none'; showError('Erreur : ' + err.message); }
  finally { unlockButtons(); setFastLoading(false); }
}

// ── Full from fast ──
async function runFullFromState(raw, domain, ctaBtn) {
  if (currentState.fullDone) return;
  ctaBtn.classList.add('running');
  document.getElementById('stfLabel').textContent = 'Analyse en cours…';
  lockButtons();
  showSteps(['health', 'others', 'host']);
  ['health', 'others', 'host'].forEach(k => setStep('step-' + k, 'pending'));
  try {
    const center = document.getElementById('centerCol'), exportBtn = document.getElementById('exportBtn');

    setStep('step-health', 'active');
    stepRetryFns.health = async () => { setStep('step-health', 'active'); currentState.health = await checkHealth(domain); setStep('step-health', 'done'); };
    currentState.health = await checkHealth(domain);
    if (!document.getElementById('step-health').className.includes('timeout')) setStep('step-health', 'done');

    setStep('step-others', 'active');
    stepRetryFns.others = async () => { setStep('step-others', 'active'); currentState.others = await checkOtherTenants(domain, currentState.dns || {}); setStep('step-others', 'done'); };
    currentState.others = await checkOtherTenants(domain, currentState.dns || {});
    if (!document.getElementById('step-others').className.includes('timeout')) setStep('step-others', 'done');

    setStep('step-host', 'active');
    stepRetryFns.host = async () => { setStep('step-host', 'active'); currentState.host = await checkHost(domain); setStep('step-host', currentState.host ? 'done' : 'fail'); };
    currentState.host = await checkHost(domain);
    if (!document.getElementById('step-host').className.includes('timeout')) setStep('step-host', currentState.host ? 'done' : 'fail');

    document.getElementById('progList').style.display = 'none';
    currentState.fullDone = true;
    const confidence = computeConfidence(currentState.ms);
    const oldHero = center.querySelector('.tenant-hero');
    if (oldHero) center.replaceChild(renderHero(currentState.ms, domain, confidence), oldHero);

    lastReport = { domain, analysedAt: new Date().toISOString(), input: raw, microsoft: currentState.ms, google: currentState.goog, dns: currentState.dns, health: { score: currentState.health.score, dmarcIsQuarantine: currentState.health.dmarcIsQuarantine, checks: currentState.health.checks.map(c => ({ type:c.t, title:c.title, desc:c.desc })), dkim: { selector1: currentState.health.hasSel1, selector2: currentState.health.hasSel2, allResults: currentState.health.dkimResults } }, otherServices: currentState.others, host: currentState.host, tenantConfidence: confidence, fullDone: true };
    exportBtn.classList.add('visible');

    const newPb = document.createElement('div'); newPb.className = 'pills-block';
    const pl = document.createElement('div'); pl.className = 'pills-label'; pl.textContent = 'Autres services détectés';
    const pr = document.createElement('div'); pr.className = 'pills-row collapsed';
    (currentState.others || []).forEach(t => {
      const p = document.createElement('div'); p.className = 'pill ' + (t.on ? 'on' : 'off');
      if (t.imgSrc) { const img = document.createElement('img'); img.className='svc-logo'; img.src=t.imgSrc; img.alt=t.name; img.loading='lazy'; p.appendChild(img); p.appendChild(document.createTextNode(' ')); }
      p.appendChild(document.createTextNode(t.name + (t.on ? ' ✓' : '')));
      pr.appendChild(p);
    });
    const tg = document.createElement('button'); tg.type='button'; tg.className='pills-toggle'; tg.textContent='Afficher tout';
    tg.addEventListener('click', () => { const c = pr.classList.toggle('collapsed'); tg.textContent = c ? 'Afficher tout' : 'Réduire'; });
    pl.appendChild(tg);
    newPb.appendChild(pl); newPb.appendChild(pr);
    const oldPills = center.querySelector('.pills-block');
    if (oldPills) center.replaceChild(newPb, oldPills); else center.insertBefore(newPb, center.querySelector('.result-card') || ctaBtn);

    if (currentState.host) {
      const logo = hostLogo(currentState.host.hostName);
      center.insertBefore(makeCard({ id:'host', iconEl:logo.el, iconBg:'hs-clr', title:'Hébergeur & Registrar', sub:'WHOIS / RDAP — ' + (currentState.host.hostName || 'Inconnu'), badge: currentState.host.hostName || 'Inconnu', badgeCls:'hs-b', selCls:'sel-host', onClick: () => openPanel('host', 'Hébergeur & Registrar', buildHostPanel(currentState.host, domain)) }), ctaBtn);
    }
    if (currentState.health) {
      center.insertBefore(makeCard({ id:'health', iconEl:makeImgIcon('assets/Santé.png','Santé',20), iconBg:'hl-clr', title:'Santé du domaine', sub: healthSubLbl(currentState.health), badge: healthScoreLbl(currentState.health), badgeCls:'hl-b', selCls:'sel-health', onClick: () => openPanel('health', panelTitle('assets/Santé.png', 'icon-plain', 'Santé du domaine'), buildHealthPanel(currentState.health, domain)) }), ctaBtn);
    }
    ctaBtn.classList.remove('running'); ctaBtn.classList.add('done'); ctaBtn.replaceChildren(); const doneImg = document.createElement('img'); doneImg.src='assets/checked.png'; doneImg.className='icon-adaptive'; doneImg.alt=''; ctaBtn.appendChild(doneImg); ctaBtn.appendChild(document.createTextNode(' Analyse complète effectuée'));
  } catch (err) {
    ctaBtn.classList.remove('running');
    ctaBtn.textContent = '';
    const lbl2 = document.createElement('span'); lbl2.id = 'stfLabel';
    const img2 = document.createElement('img'); img2.src='assets/Analyse.png'; img2.width=14; img2.height=14; img2.alt=''; img2.style.cssText='display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px;';
    lbl2.appendChild(img2); lbl2.appendChild(document.createTextNode("Lancer l'analyse complète"));
    const hint2 = document.createElement('span'); hint2.style.cssText='font-size:10px;opacity:.65;margin-left:4px'; hint2.textContent='WHOIS · sécurité DNS';
    ctaBtn.appendChild(lbl2); ctaBtn.appendChild(hint2);
    document.getElementById('progList').style.display = 'none';
    showError('Erreur analyse complète : ' + err.message);
  } finally { unlockButtons(); }
}

// ── Full from scratch ──
async function checkFull() {
  const raw = emailInput.value.trim(); if (!raw) { showError('Veuillez entrer une adresse e-mail ou un domaine.'); return; }
  const domain = extractDomain(raw); if (!domain || !domain.includes('.')) { showError('Domaine invalide.'); return; }
  const center = document.getElementById('centerCol'), exportBtn = document.getElementById('exportBtn'), errBox = document.getElementById('errBox');
  errBox.style.display = 'none'; center.replaceChildren(); closePanel();
  exportBtn.classList.remove('visible'); lastReport = null;
  currentState = { domain, ms:null, dns:null, goog:null, health:null, others:null, host:null, fullDone:false };
  lockButtons(); setFullLoading(true);
  showSteps(['ms', 'google', 'dns', 'health', 'others', 'host']);
  ['ms', 'google', 'dns', 'health', 'others', 'host'].forEach(k => setStep('step-' + k, 'pending'));
  try {
    setStep('step-ms', 'active');     currentState.ms     = isMsaPersonalDomain(domain) ? null : await checkMicrosoft(domain); setStep('step-ms', currentState.ms ? 'done' : 'fail');
    setStep('step-google', 'active'); currentState.goog   = await checkGoogle(domain);                                          setStep('step-google', currentState.goog ? 'done' : 'fail');
    setStep('step-dns', 'active');    currentState.dns    = await checkDNS(domain);                                            setStep('step-dns', currentState.dns.mx.length > 0 ? 'done' : 'fail');
    setStep('step-health', 'active'); currentState.health = await checkHealth(domain);                                         setStep('step-health', 'done');
    setStep('step-others', 'active'); currentState.others = await checkOtherTenants(domain, currentState.dns);                 setStep('step-others', 'done');
    setStep('step-host', 'active');   currentState.host   = await checkHost(domain);                                           setStep('step-host', currentState.host ? 'done' : 'fail');
    document.getElementById('progList').style.display = 'none';
    currentState.fullDone = true;
    const confidence = computeConfidence(currentState.ms);
    lastReport = { domain, analysedAt: new Date().toISOString(), input: raw, microsoft: currentState.ms, google: currentState.goog, dns: currentState.dns, health: { score: currentState.health.score, dmarcIsQuarantine: currentState.health.dmarcIsQuarantine, checks: currentState.health.checks.map(c => ({ type:c.t, title:c.title, desc:c.desc })), dkim: { selector1: currentState.health.hasSel1, selector2: currentState.health.hasSel2, allResults: currentState.health.dkimResults } }, otherServices: currentState.others, host: currentState.host, tenantConfidence: confidence, fullDone: true };
    exportBtn.classList.add('visible');
    if (currentState.ms?.tenantId && currentState.ms.tenantValid) addToHistory(domain, currentState.ms.tenantId);
    center.appendChild(renderHero(currentState.ms, domain, confidence));

    const pb = document.createElement('div'); pb.className = 'pills-block';
    const pl = document.createElement('div'); pl.className = 'pills-label'; pl.textContent = 'Autres services détectés';
    const pr = document.createElement('div'); pr.className = 'pills-row collapsed';
    currentState.others.forEach(t => {
      const p = document.createElement('div'); p.className = 'pill ' + (t.on ? 'on' : 'off');
      if (t.imgSrc) { const img = document.createElement('img'); img.className='svc-logo'; img.src=t.imgSrc; img.alt=t.name; img.loading='lazy'; p.appendChild(img); p.appendChild(document.createTextNode(' ')); }
      p.appendChild(document.createTextNode(t.name + (t.on ? ' ✓' : '')));
      pr.appendChild(p);
    });
    const tg = document.createElement('button'); tg.type='button'; tg.className='pills-toggle'; tg.textContent='Afficher tout';
    tg.addEventListener('click', () => { const c = pr.classList.toggle('collapsed'); tg.textContent = c ? 'Afficher tout' : 'Réduire'; });
    pl.appendChild(tg);
    pb.appendChild(pl); pb.appendChild(pr); center.appendChild(pb);

    if (currentState.ms?.tenantValid) {
      const rows = msRows(currentState.ms);
      center.appendChild(makeCard({ id:'ms', iconEl:makeImgIcon('assets/Microsoft.png','Microsoft',22), iconBg:'ms-clr', title:'Microsoft 365 / Entra ID', sub:'Endpoints & informations tenant', badge: rows.length + ' champs', badgeCls:'ms-b', selCls:'selected', onClick: () => openPanel('ms', 'Microsoft 365 / Entra ID', buildMsPanel(currentState.ms)) }));
    }
    if (currentState.goog) center.appendChild(makeCard({ id:'google', iconEl:makeGoogleSvgIcon(), iconBg:'gg-clr', title:'Google Workspace', sub:'OpenID Connect & MX Records', badge:'5 champs', badgeCls:'gg-b', selCls:'sel-google', onClick: () => openPanel('google', panelTitle('assets/google.png', 'icon-plain', 'Google Workspace'), buildGooglePanel(currentState.goog)) }));
    if (currentState.host) {
      const logo = hostLogo(currentState.host.hostName);
      center.appendChild(makeCard({ id:'host', iconEl:logo.el, iconBg:'hs-clr', title:'Hébergeur & Registrar', sub:'WHOIS / RDAP — ' + (currentState.host.hostName || 'Inconnu'), badge: currentState.host.hostName || 'Inconnu', badgeCls:'hs-b', selCls:'sel-host', onClick: () => openPanel('host', 'Hébergeur & Registrar', buildHostPanel(currentState.host, domain)) }));
    }
    const dnsRowCount = [currentState.dns?.mx?.length, currentState.dns?.spf, currentState.dns?.detectedProviders?.length, currentState.dns?.txt?.length].filter(Boolean).length;
    if (dnsRowCount) center.appendChild(makeCard({ id:'dns', iconEl:makeImgIcon('assets/DNS.png','DNS',20), iconBg:'dn-clr', title:'Enregistrements DNS', sub:'MX · SPF · TXT', badge: dnsRowCount + ' entrées', badgeCls:'dn-b', selCls:'sel-dns', onClick: () => openPanel('dns', panelTitle('assets/DNS.png', 'icon-plain', 'Enregistrements DNS'), buildDnsPanel(currentState.dns)) }));
    center.appendChild(makeCard({ id:'health', iconEl:makeImgIcon('assets/Santé.png','Santé',20), iconBg:'hl-clr', title:'Santé du domaine', sub: healthSubLbl(currentState.health), badge: healthScoreLbl(currentState.health), badgeCls:'hl-b', selCls:'sel-health', onClick: () => openPanel('health', panelTitle('assets/Santé.png', 'icon-plain', 'Santé du domaine'), buildHealthPanel(currentState.health, domain)) }));
  } catch (err) { document.getElementById('progList').style.display = 'none'; showError('Erreur : ' + err.message); }
  finally { unlockButtons(); setFullLoading(false); }
}
