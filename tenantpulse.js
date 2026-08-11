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
  dnsgoogle:      {title:'cloudflare-dns.com', desc:'API DNS-over-HTTPS de Cloudflare (DoH, 1.1.1.1). Utilisée pour résoudre MX, SPF, DKIM, DMARC, DNSSEC, BIMI et MTA-STS. Aucune donnée personnelle transmise — seulement le nom de domaine. Si le réseau de votre poste bloque cet appel direct (courant sur un poste géré, où QUIC est filtré), les résolutions repassent par le serveur de l\'application, qui interroge le même service sans conserver le nom demandé.', url:'https://cloudflare-dns.com/dns-query'},
  rdap:           {title:'rdap.org',   desc:'Service RDAP public (Registration Data Access Protocol). Utilisé pour récupérer les données WHOIS : registrar, serveurs NS, dates de création/expiration. Lecture seule.', url:'https://rdap.org/domain/'},
  mslogin:        {title:'login.microsoftonline.com', desc:'Endpoint public officiel Microsoft. Utilisé pour détecter le Tenant ID (OpenID Connect) et valider le GUID du tenant.', url:'https://login.microsoftonline.com/common/.well-known/openid-configuration'},
  googleaccounts: {title:'accounts.google.com', desc:'Endpoint public officiel Google. Utilisé pour détecter Google Workspace via OpenID Connect (issuer, token & authorization endpoints). Lecture seule.', url:'https://accounts.google.com/.well-known/openid-configuration'},
};

// ── Redirect buttons config ──
const REDIRECT_BUTTONS = [
  { key:'partnerCenter', label:'Partner Center',  sub:'Clients & licences CSP',       icon:'assets/group.png',                 href: id => `https://partner.microsoft.com/dashboard/v2/customers/${encodeURIComponent(id)}/servicemanagementpage` },
  { key:'entraId',       label:'Entra ID',         sub:'Identités & accès',             icon:'assets/MicrosoftEntraID.png',      href: id => `https://entra.microsoft.com/${encodeURIComponent(id)}` },
  { key:'m365Admin',     label:'M365 Admin',       sub:'Administration Microsoft 365',  icon:'assets/Microsoft365Admin.png',     href: (id, dom) => `https://admin.cloud.microsoft/?delegatedOrg=${encodeURIComponent(dom || '')}` },
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
  'admin.cloud.microsoft', 'admin.exchange.microsoft.com', 'intune.microsoft.com',
  'admin.teams.microsoft.com', 'portal.azure.com', 'security.microsoft.com'
]);

/* Hôte de redirection autorisé : liste fixe MS + centres SharePoint admin dynamiques
   « <tenant>-admin.sharepoint.com » (le nom du tenant varie, on valide la forme). */
function isAllowedRedirectHost(host) {
  return ALLOWED_REDIRECT_HOSTS.has(host) || /^[a-z0-9][a-z0-9-]*-admin\.sharepoint\.com$/.test(host);
}

/* Construit l'URL d'un bouton et ne la renvoie que si elle vise un hôte MS autorisé en HTTPS. */
function safeRedirectHref(hrefFn, id, dom) {
  let raw; try { raw = hrefFn(id, dom); } catch { return null; }
  let u;   try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  return isAllowedRedirectHost(u.hostname) ? u.href : null;
}

/* ── Raccourcis par centre d'administration (sous-menu dépliant des boutons) ──
   Jetons remplacés à l'exécution : {tenantId} (GUID), {domain} (domaine analysé),
   {spTenant} (nom de tenant SharePoint détecté via le CNAME DKIM selector1).
   Un raccourci dont un jeton est indisponible est rendu désactivé (non cliquable). */
const ADMIN_SHORTCUTS = {
  partnerCenter: [
    { label: 'Abonnements',                   url: 'https://partner.microsoft.com/dashboard/v2/customers/{tenantId}/subscriptions' },
    { label: 'Utilisateurs & licences',       url: 'https://partner.microsoft.com/dashboard/v2/customers/{tenantId}/users' },
    { label: "Relations de l'administrateur", url: 'https://partner.microsoft.com/dashboard/v2/customers/{tenantId}/adminrelationships' },
  ],
  entraId: [
    { label: 'Utilisateurs',              url: 'https://entra.microsoft.com/{tenantId}#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/AllUsers/menuId/' },
    { label: 'Groupes',                   url: 'https://entra.microsoft.com/{tenantId}#view/Microsoft_AAD_IAM/GroupsManagementMenuBlade/~/Overview/menuId/Overview' },
    { label: 'Accès conditionnel',        url: 'https://entra.microsoft.com/{tenantId}#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade/~/Overview/menuId//fromNav/Identity' },
    { label: 'Journaux de connexion',     url: 'https://entra.microsoft.com/{tenantId}#view/Microsoft_AAD_UsersAndTenants/UserManagementMenuBlade/~/Audit/menuId/' },
    { label: "Applications d'entreprise", url: 'https://entra.microsoft.com/{tenantId}#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview' },
  ],
  m365Admin: [
    { label: 'Utilisateurs actifs', url: 'https://admin.cloud.microsoft/?delegatedOrg={domain}#/users' },
    { label: 'Licences',            url: 'https://admin.cloud.microsoft/?delegatedOrg={domain}#/licenses' },
    { label: 'Domaines',            url: 'https://admin.cloud.microsoft/?delegatedOrg={domain}#/Domains' },
    { label: 'Groupes',             url: 'https://admin.cloud.microsoft/?delegatedOrg={domain}#/groups' },
    { label: 'Santé des services',  url: 'https://admin.cloud.microsoft/?delegatedOrg={domain}#/servicehealth' },
  ],
  exchange: [
    { label: 'Boîtes aux lettres',         url: 'https://admin.exchange.microsoft.com/?delegatedOrg={domain}#/mailboxes' },
    { label: 'Groupes de distribution',    url: 'https://admin.exchange.microsoft.com/?delegatedOrg={domain}#/groups' },
    { label: 'Règles de flux',             url: 'https://admin.exchange.microsoft.com/?delegatedOrg={domain}#/transportrules' },
    { label: 'Connecteurs',                url: 'https://admin.exchange.microsoft.com/?delegatedOrg={domain}#/connectors' },
    { label: 'Suivi des messages',         url: 'https://admin.exchange.microsoft.com/?delegatedOrg={domain}#/messagetrace' },
  ],
  intune: [
    { label: 'Appareils',               url: 'https://intune.microsoft.com/{tenantId}#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/overview' },
    { label: 'Stratégie de conformité', url: 'https://intune.microsoft.com/{tenantId}#view/Microsoft_Intune_DeviceSettings/DevicesComplianceMenu/~/policies' },
    { label: 'Applications',            url: 'https://intune.microsoft.com/{tenantId}#view/Microsoft_Intune_DeviceSettings/AppsMenu/~/allApps' },
    { label: 'ASR',                     url: 'https://intune.microsoft.com/{tenantId}#view/Microsoft_Intune_Workflows/SecurityManagementMenu/~/asr' },
  ],
  teams: [
    { label: 'Utilisateurs',          url: 'https://admin.teams.microsoft.com/users?delegatedOrg={domain}' },
    { label: 'Stratégies de réunion', url: 'https://admin.teams.microsoft.com/policies/meetings?delegatedOrg={domain}' },
    { label: 'Channels',              url: 'https://admin.teams.microsoft.com/policies/channels?delegatedOrg={domain}' },
    { label: 'Politique de messages', url: 'https://admin.teams.microsoft.com/policies/messaging?delegatedOrg={domain}' },
  ],
  sharepoint: [
    { label: 'Sites actifs',          url: 'https://{spTenant}-admin.sharepoint.com/_layouts/15/online/AdminHome.aspx#/siteManagement' },
    { label: 'Politiques de partage', url: 'https://{spTenant}-admin.sharepoint.com/_layouts/15/online/AdminHome.aspx#/sharing' },
  ],
  azure: [
    { label: 'Abonnements',           url: 'https://portal.azure.com/{tenantId}#view/Microsoft_Azure_Billing/SubscriptionsBladeV2' },
    { label: 'Groupes de ressources', url: 'https://portal.azure.com/{tenantId}#servicemenu/Microsoft_Azure_Resources/ResourceManager/resourcegroups' },
    { label: 'Machines virtuelles',   url: 'https://portal.azure.com/{tenantId}#view/Microsoft_Azure_ComputeHub/ComputeHubMenuBlade/~/virtualMachinesBrowse' },
  ],
  defender: [
    { label: 'Stratégie de menace', url: 'https://security.microsoft.com/threatpolicy?tid={tenantId}' },
    { label: 'Entités restreintes',  url: 'https://security.microsoft.com/restrictedentities?tid={tenantId}' },
    { label: 'Quarantaine',          url: 'https://security.microsoft.com/quarantine?viewid=Email&tid={tenantId}' },
    { label: 'Liens fiables',        url: 'https://security.microsoft.com/safelinksv2?tid={tenantId}' },
    { label: 'Alerte',               url: 'https://security.microsoft.com/alerts?tid={tenantId}' },
    { label: 'Incidents',            url: 'https://security.microsoft.com/incidents?tid={tenantId}' },
    { label: 'Analyse des menaces',  url: 'https://security.microsoft.com/threatanalytics3?tid={tenantId}' },
  ],
};

/* Remplace les jetons d'un gabarit de raccourci et ne renvoie l'URL que si elle est
   complète (tous les jetons disponibles) et vise un hôte autorisé en HTTPS. Sinon null. */
function resolveShortcutUrl(tpl, ctx) {
  if (tpl.includes('{tenantId}') && !ctx.tenantId) return null;
  if (tpl.includes('{domain}')   && !ctx.domain)   return null;
  if (tpl.includes('{spTenant}') && !ctx.spTenant) return null;
  const url = tpl
    .replace(/\{tenantId\}/g, encodeURIComponent(ctx.tenantId || ''))
    .replace(/\{domain\}/g,   encodeURIComponent(ctx.domain   || ''))
    .replace(/\{spTenant\}/g, encodeURIComponent(ctx.spTenant || ''));
  let u; try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  return isAllowedRedirectHost(u.hostname) ? u.href : null;
}

/* ── Menu dépliant de raccourcis (un par bouton de redirection) ── */
let _openShortcutMenu = null;
/* Joue l'animation de fermeture (menuOut) puis retire l'élément du DOM.
   L'état (variable _open…) doit être remis à null par l'appelant AVANT, pour
   que l'ouverture suivante reparte proprement même si l'anim n'est pas finie. */
function animateMenuClose(menu) {
  if (!menu || menu._closing) return;
  menu._closing = true;
  menu.classList.add('menu-closing');
  let done = false;
  const finish = () => { if (done) return; done = true; menu.remove(); };
  menu.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 220); // filet de sécurité si animationend ne se déclenche pas
}
function closeShortcutMenu() {
  document.removeEventListener('click', closeShortcutMenu);
  window.removeEventListener('scroll', closeShortcutMenu, true);
  const menu = _openShortcutMenu;
  _openShortcutMenu = null;
  animateMenuClose(menu);
}
function openShortcutMenu(btn, anchorEl, ctx) {
  const wasKey = _openShortcutMenu && _openShortcutMenu._key;
  closeShortcutMenu();
  if (wasKey === btn.key) return; // re-clic sur le même bouton → simple fermeture

  const list = ADMIN_SHORTCUTS[btn.key] || [];
  const menu = document.createElement('div');
  menu.className = 'hero-shortcut-menu';
  menu._key = btn.key;
  menu.setAttribute('role', 'menu');
  menu.addEventListener('click', e => e.stopPropagation());

  const title = document.createElement('div');
  title.className = 'hero-shortcut-menu-title';
  title.textContent = btn.label;
  menu.appendChild(title);

  // Page d'accueil du centre (même cible que le clic sur la tuile)
  let primary = safeRedirectHref(btn.href, ctx.tenantId, ctx.domain);
  if (btn.key === 'sharepoint') {
    // « Accueil » SharePoint = lien direct uniquement ; le repli M365 est l'entrée dédiée du menu.
    primary = ctx.spTenant ? resolveShortcutUrl('https://{spTenant}-admin.sharepoint.com/_layouts/15/online/AdminHome.aspx', ctx) : null;
  }
  if (primary) {
    const a = document.createElement('a');
    a.className = 'hero-shortcut-opt primary';
    a.href = primary; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = 'Accueil';
    a.setAttribute('role', 'menuitem');
    a.addEventListener('click', closeShortcutMenu);
    menu.appendChild(a);
  }

  list.forEach(sc => {
    const url = resolveShortcutUrl(sc.url, ctx);
    if (url) {
      const a = document.createElement('a');
      a.className = 'hero-shortcut-opt';
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = sc.label;
      a.setAttribute('role', 'menuitem');
      a.addEventListener('click', closeShortcutMenu);
      menu.appendChild(a);
    } else {
      const span = document.createElement('span');
      span.className = 'hero-shortcut-opt disabled';
      span.textContent = sc.label;
      span.title = sc.url.includes('{spTenant}')
        ? "Nom de tenant SharePoint non détecté (CNAME DKIM absent). Lancez l'analyse complète, ou ouvrez SharePoint via M365 Admin."
        : 'Lien indisponible pour ce tenant.';
      menu.appendChild(span);
    }
  });

  // Positionnement fixe + ajout au body pour passer au-dessus du contexte d'empilement.
  const rect = anchorEl.getBoundingClientRect();
  const menuWidth = 240;
  menu.style.position = 'fixed';
  menu.style.zIndex = '3000';
  let left = rect.left;
  if (left + menuWidth > window.innerWidth - 12) left = window.innerWidth - menuWidth - 12;
  if (left < 12) left = 12;
  menu.style.left = left + 'px';
  menu.style.top = (rect.bottom + 6) + 'px';
  document.body.appendChild(menu);

  // Repli vers le haut si le menu déborde en bas de l'écran.
  const mh = menu.getBoundingClientRect().height;
  if (rect.bottom + 6 + mh > window.innerHeight - 12) {
    let top = rect.top - 6 - mh;
    if (top < 12) top = 12;
    menu.style.top = top + 'px';
  }

  _openShortcutMenu = menu;
  setTimeout(() => document.addEventListener('click', closeShortcutMenu), 0);
  window.addEventListener('scroll', closeShortcutMenu, true);
}

/* Pastille « i » → asset assets/information.png (source noire).
   variant 'adapt' : suit le thème (noir en clair, blanc en sombre).
   variant 'white' : toujours blanc (badges à fond coloré). */
function makeInfoIcon(variant) {
  const im = document.createElement('img');
  im.src = 'assets/information.png';
  im.alt = '';
  im.className = 'info-ic ' + (variant === 'white' ? 'always-white' : 'adapt');
  return im;
}

const PROFILE_KEY = 'tenantpulse_profile_v1';
const MHAELLE_PROFILE_KEY = 'mhaelle_profile_v1';

/* Origine cible des postMessage vers l'iframe Mhaelle.
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
  // Mode d'analyse complète : 'manuel' (boutons Tenant ID + Analyse) ou 'auto' (Tenant ID enchaîne tout)
  if (profile.analysisMode !== 'auto' && profile.analysisMode !== 'manuel') profile.analysisMode = 'manuel';
  return profile;
}

/* Met à jour le texte explicatif du sélecteur de mode d'analyse (modale Profils). */
function updateAnalysisModeHint(mode) {
  const h = document.getElementById('analysisModeHint');
  if (!h) return;
  h.textContent = mode === 'auto'
    ? "Un seul bouton « Tenant ID » : il lance la recherche puis l'analyse complète automatiquement (le hero s'affiche d'abord)."
    : "Deux boutons : « Tenant ID » (rapide) et « Analyse » (complète), à lancer au choix.";
}

/* Applique le mode d'analyse à l'interface principale.
   En automatique : on masque le bouton « Analyse » (un seul bouton « Tenant ID » qui enchaîne tout). */
function applyAnalysisMode(mode) {
  document.body.classList.toggle('analysis-auto', mode === 'auto');
  const hints = document.querySelectorAll('.btn-hints .btn-hint');
  if (hints[0]) hints[0].textContent = mode === 'auto' ? 'Recherche + analyse complète en un clic' : 'Rapide: ID MS + DNS de base';
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

/* Ouvre le menu Paramètres & Confidentialité et déploie la section
   « Gestion d'historique » (appelé depuis le lien « ici » de l'historique). */
function openHistorySettings() {
  const d = document.getElementById('mainDropdown');
  if (d) d.classList.add('open');
  const sections = document.querySelectorAll('#dropMenu [data-drop-section]');
  sections.forEach(btn => {
    if ((btn.textContent || '').includes("Gestion d'historique")) {
      if (!btn.classList.contains('open')) toggleDropSection(btn);
      try { btn.scrollIntoView({ block: 'nearest' }); } catch {}
    }
  });
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
  if (kept.length !== items.length) {
    saveHistory(kept);
    // Les marqueurs "compte admin" suivent la rétention : on purge ceux dont le tenant a expiré.
    const keepIds = new Set(kept.map(it => it.tenantId));
    const accounts = loadAdminAccounts();
    let changed = false;
    for (const id of Object.keys(accounts)) { if (!keepIds.has(id)) { delete accounts[id]; changed = true; } }
    if (changed) saveAdminAccounts(accounts);
  }
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
function showGuide() {
  const modal = document.getElementById('guideModal');
  if (modal) modal.classList.add('open');
}
function hideGuide() {
  const modal = document.getElementById('guideModal');
  if (modal) modal.classList.remove('open');
}
function openSettingsSection(sectionLabel) {
  hideGuide();
  const dropdown = document.getElementById('mainDropdown');
  if (dropdown) dropdown.classList.add('open');
  document.querySelectorAll('#dropMenu [data-drop-section]').forEach(btn => {
    if ((btn.textContent || '').trim().startsWith(sectionLabel)) {
      if (!btn.classList.contains('open')) toggleDropSection(btn);
      try { btn.scrollIntoView({ block: 'nearest' }); } catch {}
    }
  });
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
// Compteur de comptes admin (puces actives) affiché dans l'en-tête de l'historique.
// Ne compte que les tenants encore présents dans l'historique → respecte la rétention configurée.
function refreshAdminAccountCount() {
  const badge = document.getElementById('historyAdminCount');
  if (!badge) return;
  let n = 0;
  if (isHistoryEnabled()) { pruneExpiredHistory(); n = loadHistory().filter(it => hasAdminAccount(it.tenantId)).length; }
  badge.textContent = String(n);
  badge.hidden = n === 0;
  badge.title = n + ' tenant' + (n > 1 ? 's' : '') + ' avec compte admin créé';
}
function renderHistory() {
  refreshAdminAccountCount();
  const list = document.getElementById('historyList'); if (!list) return;
  list.textContent = '';
  if (!isHistoryEnabled()) {
    const empty = document.createElement('div'); empty.className = 'history-empty';
    empty.appendChild(document.createTextNode('Historique désactivé, activez-le '));
    const link = document.createElement('span');
    link.className = 'history-enable-link';
    link.textContent = 'ici';
    link.setAttribute('role', 'button');
    link.tabIndex = 0;
    link.addEventListener('click', (e) => { e.stopPropagation(); openHistorySettings(); });
    link.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHistorySettings(); } });
    empty.appendChild(link);
    list.appendChild(empty); return;
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

    row.appendChild(iconSpan); row.appendChild(textWrap); row.appendChild(timeEl);
    if (hasAdminAccount(item.tenantId)) {
      const adminDot = document.createElement('span'); adminDot.className = 'history-admin-dot'; adminDot.title = 'Compte admin créé sur ce tenant';
      row.appendChild(adminDot);
    }
    row.appendChild(copyBtn);
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

// ── Comptes admin créés (gestion indépendante de l'historique/cache) ──
const ADMIN_ACCOUNTS_KEY = 'tenantAdminAccounts_v1';
function loadAdminAccounts() { try { return JSON.parse(localStorage.getItem(ADMIN_ACCOUNTS_KEY) || '{}'); } catch { return {}; } }
function saveAdminAccounts(map) { try { localStorage.setItem(ADMIN_ACCOUNTS_KEY, JSON.stringify(map)); } catch {} }
function hasAdminAccount(tenantId) { if (!tenantId) return false; return !!loadAdminAccounts()[tenantId]; }
function setAdminAccount(tenantId, val) {
  if (!tenantId) return;
  const map = loadAdminAccounts();
  if (val) map[tenantId] = true; else delete map[tenantId];
  saveAdminAccounts(map);
}

// ── Onglets TenantPulse / Mhaelle (vue type navigateur) ──
// L'iframe Mhaelle est lazy-loaded au premier clic puis reste montée,
// ce qui préserve l'état de l'analyse des deux côtés au switch.
function switchAppTab(target) {
  const tabs = document.querySelectorAll('.app-tab');
  tabs.forEach(t => {
    const active = t.dataset.appTab === target;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const mlFrame = document.getElementById('mhaelleFrame');
  if (target === 'ml') {
    if (!mlFrame.src) mlFrame.src = 'ML/mhaelle.html?embedded=1';
    document.body.classList.add('view-ml');
  } else {
    document.body.classList.remove('view-ml');
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
  document.getElementById('btnGuideInfo').addEventListener('click', showGuide);
  document.getElementById('guideModal').addEventListener('click', hideGuide);
  document.getElementById('guideModalInner').addEventListener('click', e => e.stopPropagation());
  document.getElementById('btnGuideClose').addEventListener('click', hideGuide);
  document.getElementById('btnGuideCloseFooter').addEventListener('click', hideGuide);
  document.getElementById('guideModalInner').addEventListener('click', e => {
    const btn = e.target.closest('[data-guide-action]');
    if (!btn) return;
    e.stopPropagation();
    const action = btn.dataset.guideAction;
    if (action === 'settings-history')   { openHistorySettings(); }
    else if (action === 'profiles')      { hideGuide(); openProfilesModal(); }
    else if (action === 'settings-apparence') { openSettingsSection('Apparence'); }
    else if (action === 'settings-storage')   { hideGuide(); showStoragePanel(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const m = document.getElementById('guideModal');
    if (m && m.classList.contains('open')) hideGuide();
  });
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
  document.getElementById('btnPrivacyCta').addEventListener('click', (e) => {
    e.stopPropagation(); // sans ça, le clic remonte au handler document qui referme aussitôt le dropdown
    document.getElementById('mainDropdown').classList.add('open');
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
  document.querySelectorAll('#analysisModeSeg .analysis-mode-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('#analysisModeSeg .analysis-mode-opt').forEach(o => {
        const active = o === opt;
        o.classList.toggle('active', active);
        o.setAttribute('aria-checked', active ? 'true' : 'false');
      });
      updateAnalysisModeHint(opt.dataset.mode);
    });
  });
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
  if (document.body.classList.contains('view-ml')) {
    _profilesActiveTab = 'ml';
  } else {
    _profilesActiveTab = 'tp';
  }
  renderTpProfilePane();
  renderMhaelleProfilePane();
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
  document.getElementById('profilesFooterTP').classList.toggle('profiles-footer-hidden', tab !== 'tp');
  document.getElementById('profilesFooterML').classList.toggle('profiles-footer-hidden', tab !== 'ml');
  document.getElementById('profilesTabTP').classList.toggle('active', tab === 'tp');
  document.getElementById('profilesTabML').classList.toggle('active', tab === 'ml');
}

/* ── Onglet TenantPulse : toggles + drag-to-reorder ── */
function renderTpProfilePane() {
  const profile = loadProfile();
  const list = document.getElementById('profilesToggleList');
  list.replaceChildren();

  /* Sélecteur de mode d'analyse complète (manuel / automatique) */
  const mode = profile.analysisMode === 'auto' ? 'auto' : 'manuel';
  document.querySelectorAll('#analysisModeSeg .analysis-mode-opt').forEach(o => {
    const active = o.dataset.mode === mode;
    o.classList.toggle('active', active);
    o.setAttribute('aria-checked', active ? 'true' : 'false');
  });
  updateAnalysisModeHint(mode);

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
  const icon = document.createElement('img'); icon.src = btn.icon; icon.alt = btn.label; icon.className = 'profile-item-icon' + (btn.key === 'partnerCenter' ? ' profile-icon-invert-dark' : '');
  const name = document.createElement('span'); name.className = 'profile-item-name'; name.textContent = btn.label;
  left.appendChild(icon); left.appendChild(name);
  if (locked) {
    const badge = document.createElement('span'); badge.className = 'profile-item-badge'; badge.textContent = 'Recommandé';
    const info = document.createElement('span'); info.className = 'profile-item-info'; info.appendChild(makeInfoIcon('adapt'));
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
  if (_profilesActiveTab === 'ml') {
    saveMhaelleProfileFromModal();
  } else {
    saveTpProfileFromModal();
  }
}

function saveTpProfileFromModal() {
  const profile = {};
  document.querySelectorAll('.profile-item-switch').forEach(sw => {
    profile[sw.dataset.key] = sw.classList.contains('on');
  });
  profile.partnerCenter = true;
  const _modeOpt = document.querySelector('#analysisModeSeg .analysis-mode-opt.active');
  profile.analysisMode = (_modeOpt && _modeOpt.dataset.mode === 'auto') ? 'auto' : 'manuel';
  /* Ordre des boutons glissables */
  const sortable = document.getElementById('tpSortableGrid');
  if (sortable) {
    profile.order = [...sortable.querySelectorAll('.profile-item[draggable]')].map(i => i.dataset.key);
  }
  saveProfile(profile);
  applyAnalysisMode(profile.analysisMode);
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

// ══════════════════════════════════════════════════════════════════════════
//  EXTENSION NAVIGATEUR
//  Présence détectée via l'attribut « data-tp-extension » que le script de
//  contenu de l'extension pose sur <html> (mondes JS isolés, DOM partagé).
//  L'URL de la fiche vient de /api/me : la fiche est en visibilité masquée,
//  son adresse n'a donc rien à faire dans un dépôt public.
// ══════════════════════════════════════════════════════════════════════════
const TP_EXTENSION = { present: false, version: null, url: null, urlEdge: null };

/* Edge ne peut pas installer depuis le Chrome Web Store sans que l'utilisateur
   autorise « les extensions d'autres magasins » ; les autres navigateurs Chromium
   ne peuvent pas installer depuis Edge Add-ons. On oriente donc chacun vers sa
   propre fiche quand les deux sont configurées. */
const isEdgeBrowser = () => {
  const brands = navigator.userAgentData?.brands;
  if (Array.isArray(brands)) return brands.some(b => /Microsoft Edge/i.test(b.brand));
  return / Edg\//.test(navigator.userAgent);
};

/* Hôtes de magasin autorisés pour le bouton d'installation. Même défense en
   profondeur que ALLOWED_REDIRECT_HOSTS : un paramètre d'application mal renseigné
   ne doit jamais produire un lien vers une destination arbitraire. */
const ALLOWED_STORE_HOSTS = new Set([
  'microsoftedge.microsoft.com',
  'chromewebstore.google.com',
  'chrome.google.com'
]);
function safeStoreUrl(raw) {
  let u; try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  return ALLOWED_STORE_HOSTS.has(u.hostname) ? u.href : null;
}

/* Reflète l'état de l'extension dans la barre supérieure : pastille « active »,
   ou bouton d'installation si une fiche est configurée. Rien si ni l'un ni l'autre. */
function syncExtensionUI() {
  const badge = document.getElementById('extStatus');
  const cta   = document.getElementById('extInstall');
  if (!badge || !cta) return;

  if (TP_EXTENSION.present) {
    document.getElementById('extStatusLabel').textContent = 'Extension active';
    badge.title = 'Extension navigateur TenantPulse active'
      + (TP_EXTENSION.version ? ' (v' + TP_EXTENSION.version + ')' : '');
    badge.hidden = false; cta.hidden = true;
    return;
  }
  badge.hidden = true;
  // Fiche du magasin du navigateur courant, avec repli sur l'autre si une seule existe.
  const prefere = isEdgeBrowser()
    ? [TP_EXTENSION.urlEdge, TP_EXTENSION.url]
    : [TP_EXTENSION.url, TP_EXTENSION.urlEdge];
  const href = prefere.map(u => (u ? safeStoreUrl(u) : null)).find(Boolean) || null;
  if (href) { cta.href = href; cta.hidden = false; } else { cta.hidden = true; }
}

/* Lit le marqueur et surveille son apparition : le script de contenu s'exécute à
   « document_idle », donc parfois après le chargement de cette page. */
function watchExtensionMarker() {
  const read = () => {
    const v = document.documentElement.getAttribute('data-tp-extension');
    const present = typeof v === 'string' && v.length > 0;
    if (present === TP_EXTENSION.present && v === TP_EXTENSION.version) return;
    TP_EXTENSION.present = present;
    TP_EXTENSION.version = present ? v : null;
    syncExtensionUI();
  };
  read();
  new MutationObserver(read)
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-tp-extension'] });
}

/* Pré-remplissage depuis le fragment d'URL : « #q=<domaine|e-mail|GUID> » remplit le
   champ et lance l'analyse rapide. Utilisé par l'extension de navigateur pour passer
   la main à l'app (analyse approfondie). Le fragment — et non un paramètre de requête —
   pour que la valeur ne parte jamais dans les journaux serveur. */
function applyHashQuery() {
  const m = (location.hash || '').match(/^#q=(.+)$/);
  if (!m) return;
  let value; try { value = decodeURIComponent(m[1]); } catch { return; }
  value = value.trim();
  if (!value || value.length > 253) return; // longueur max d'un nom de domaine
  emailInput.value = value;
  emailInput.dispatchEvent(new Event('input')); // rafraîchit l'aperçu d'endpoint
  // Le fragment est retiré pour qu'un rechargement ne relance pas l'analyse.
  try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  checkFast();
}

window.addEventListener('load', () => {
  bindEvents();
  applyAnalysisMode(loadProfile().analysisMode);
  syncHistoryToggleUI();
  renderHistory();
  syncCacheIndicator();
  initAuth();
  bindAdminEvents();
  watchExtensionMarker();
  applyHashQuery();

  // ── Synchronisation thème clair/sombre → iframe Mhaelle ──
  // Utilise postMessage (fonctionne même avec le protocole file://)
  const mhaelleFrame = document.getElementById('mhaelleFrame');
  function postThemeToFrames() {
    const msg = { type: 'tp-theme', theme: document.documentElement.getAttribute('data-theme') || 'light' };
    if (mhaelleFrame && mhaelleFrame.contentWindow) try { mhaelleFrame.contentWindow.postMessage(msg, FRAME_TARGET_ORIGIN); } catch(e) {}
  }
  // Envoie le thème dès que l'iframe est chargée (1er accès ou rechargement)
  mhaelleFrame.addEventListener('load', postThemeToFrames);
  // Suit tous les changements ultérieurs de data-theme sur le document parent
  new MutationObserver(postThemeToFrames)
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
});

// ── Panel ──
let openCardId = null;
let lastReport = null;
let currentState = { domain:null, ms:null, dns:null, goog:null, health:null, others:null, host:null, fullDone:false };

// ══════════════════════════════════════════════════════════════════════════
//  AUTHENTIFICATION & RÔLES
//  État applicatif de l'utilisateur connecté, alimenté par GET /api/me.
//  Hiérarchie : user < tech < moderator < manager < admin
//  (tech = accès en écriture aux procédures internes, sans pouvoirs de modération)
// ══════════════════════════════════════════════════════════════════════════
const ROLE_HIERARCHY = { user: 0, tech: 1, moderator: 2, manager: 3, admin: 4 };

const TP_AUTH = {
  email: null,
  name:  null,
  role:  'user',
  blocked: false,
  loaded: false,
  /* Vrai si le rôle courant est >= au rôle requis. */
  hasRole(required) {
    return (ROLE_HIERARCHY[this.role] ?? 0) >= (ROLE_HIERARCHY[required] ?? 0);
  }
};

/* Récupère l'identité + le rôle depuis l'API et met à jour l'UI.
   En local (file:// ou pas d'API), échoue silencieusement → reste en "user". */
async function initAuth() {
  try {
    const res = await fetch('/api/me', { headers: { 'Accept': 'application/json' } });
    if (!res.ok) { applyAuthToUI(); return; }
    const data = await res.json();
    TP_AUTH.email  = data.email || null;
    TP_AUTH.name   = data.name  || null;
    TP_AUTH.role   = ROLE_HIERARCHY.hasOwnProperty(data.role) ? data.role : 'user';
    TP_AUTH.blocked = data.blocked === true;
    TP_AUTH.loaded = true;
    // contactEmail : premier admin de la table Roles, renvoyé par /api/me
    const link = document.getElementById('bugReportLink');
    if (link && data.contactEmail) {
      link.href = 'mailto:' + data.contactEmail + '?subject=Bug%20report%20-%20TenantPulse';
    }
    // Fiches de l'extension navigateur (paramètres d'application, hors dépôt)
    TP_EXTENSION.url     = data.extensionUrl     || null;
    TP_EXTENSION.urlEdge = data.extensionUrlEdge || null;
    syncExtensionUI();
  } catch {
    // Pas d'API disponible (dev local) — on reste en utilisateur anonyme
  }
  applyAuthToUI();
}

/* Reflète l'état d'auth dans l'interface : rôle en bas à gauche + bouton Admin. */
function applyAuthToUI() {
  // Rôle affiché en bas à gauche
  const footerRole = document.getElementById('footerRole');
  const footerRoleValue = document.getElementById('footerRoleValue');
  if (footerRole && footerRoleValue) {
    if (TP_AUTH.loaded) {
      footerRoleValue.textContent = roleLabel(TP_AUTH.role);
      footerRole.title = TP_AUTH.email ? ('Connecté : ' + TP_AUTH.email) : '';
      footerRole.hidden = false;
    } else {
      footerRole.hidden = true;
    }
  }

  // Bouton d'accès : visible pour tout utilisateur connecté.
  // Libellé "Annuaire des tenants" pour les utilisateurs, "Administration" pour les autres.
  const btnAdmin = document.getElementById('btnOpenAdmin');
  const btnAdminLabel = document.querySelector('#btnOpenAdmin .topbar-admin-label');
  if (btnAdmin) {
    btnAdmin.hidden = !TP_AUTH.loaded;
    if (btnAdminLabel) btnAdminLabel.textContent = TP_AUTH.hasRole('moderator') ? 'Administration' : 'Annuaire des tenants';
    btnAdmin.title = TP_AUTH.hasRole('moderator') ? 'Onglet administration' : 'Annuaire des tenants référencés';
  }

  // Alimente les badges (demandes en attente / alertes) dès le chargement
  if (TP_AUTH.hasRole('moderator') && typeof refreshAdminBadges === 'function') {
    refreshAdminBadges();
  }
}

/* Libellé FR lisible d'un rôle. */
function roleLabel(role) {
  switch (role) {
    case 'admin':     return 'Admin';
    case 'manager':   return 'Manager';
    case 'moderator': return 'Modérateur';
    case 'tech':      return 'Tech';
    default:          return 'Utilisateur';
  }
}

function panelTitle(src, cls, text) { const img = document.createElement('img'); img.src=src; img.className=cls; img.alt=''; return [img, document.createTextNode(' '+text)]; }
// ══════════════════════════════════════════════════════════════════════════
//  TAGS DU HERO — bouton (+) et menu contextuel selon le rôle
//  - Utilisateur          : propose un tag → POST /api/request (en attente)
//  - Modérateur / Manager / Admin : appliquent directement (le backend valide seul)
//  L'utilisateur peut aussi DEMANDER la suppression d'un tag validé (action "remove",
//  bouton « − » sur le badge) → demande en attente, validée par un modérateur+.
//  L'affichage des badges (validés / en attente / verrouillé) est géré à l'étape 13.
// ══════════════════════════════════════════════════════════════════════════
/* Repli si les balises par défaut ne sont pas encore chargées depuis l'API. */
const PREDEFINED_TAGS = [
  { type: 'direct',     label: 'Direct',     group: 'classification' },
  { type: 'indirect',   label: 'Indirect',   group: 'classification' },
  { type: 'gdap_actif', label: 'GDAP actif', group: 'gdap' },
  { type: 'gdap_non',   label: 'GDAP : non', group: 'gdap' },
];

/* Caches alimentés par /api/tags (un seul appel pour les deux). */
let _customTagsCache = null;
let _defaultTagsCache = null;

async function loadTagDefs() {
  try {
    const res = await fetch('/api/tags', { headers: { 'Accept': 'application/json' } });
    if (!res.ok) { _customTagsCache = _customTagsCache || []; _defaultTagsCache = _defaultTagsCache || []; return; }
    const data = await res.json();
    _customTagsCache  = Array.isArray(data.tags) ? data.tags : [];
    _defaultTagsCache = Array.isArray(data.defaults) ? data.defaults : [];
  } catch {
    _customTagsCache  = _customTagsCache || [];
    _defaultTagsCache = _defaultTagsCache || [];
  }
}

async function getCustomTags() {
  if (!_customTagsCache) await loadTagDefs();
  return _customTagsCache || [];
}

/* Balises par défaut (depuis l'API), avec repli sur PREDEFINED_TAGS.
   Retourne [{ key, name, color, description, group }]. */
async function getDefaultTags() {
  if (!_defaultTagsCache) await loadTagDefs();
  if (_defaultTagsCache && _defaultTagsCache.length) return _defaultTagsCache;
  return PREDEFINED_TAGS.map(t => ({ key: t.type, name: t.label, color: null, description: '', group: t.group }));
}

/* Liste synchrone des balises par défaut connues (cache ou repli). */
function defaultTagsSync() {
  if (_defaultTagsCache && _defaultTagsCache.length) return _defaultTagsCache;
  return PREDEFINED_TAGS.map(t => ({ key: t.type, name: t.label, color: null, description: '', group: t.group }));
}

/* Construit la zone de tags du hero : conteneur badges + bouton (+).
   Retourne null si l'utilisateur n'est pas connecté (dev local). */
function buildHeroTagZone(tenantId, domain) {
  if (!TP_AUTH.loaded || !tenantId) return null;

  const zone = document.createElement('div');
  zone.className = 'hero-tags';
  zone.dataset.tenant = tenantId;
  zone.dataset.domain = domain || '';

  const badges = document.createElement('div');
  badges.className = 'hero-tags-badges';
  zone.appendChild(badges);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'hero-tag-add';
  addBtn.textContent = '+';
  addBtn.title = TP_AUTH.hasRole('manager') ? 'Appliquer un tag' : 'Proposer une classification';
  addBtn.setAttribute('aria-label', addBtn.title);
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleHeroTagMenu(zone, addBtn, tenantId, domain);
  });
  zone.appendChild(addBtn);

  return zone;
}

let _openHeroMenu = null;

function closeHeroTagMenu() {
  if (_openHeroMenu) {
    document.removeEventListener('click', closeHeroTagMenu);
    window.removeEventListener('scroll', closeHeroTagMenu, true);
    const menu = _openHeroMenu;
    _openHeroMenu = null;
    animateMenuClose(menu);
  }
}

/* Ouvre/ferme le menu contextuel du bouton (+). */
async function toggleHeroTagMenu(zone, anchorBtn, tenantId, domain) {
  if (_openHeroMenu) { closeHeroTagMenu(); return; }

  // Utilisateur dont les requêtes sont coupées : le (+) ne fait rien (discret)
  if (TP_AUTH.blocked && !TP_AUTH.hasRole('manager')) return;

  // Verrou : utilisateurs et modérateurs bloqués si le tenant est verrouillé
  if (zone.dataset.locked === '1' && !TP_AUTH.hasRole('manager')) return;

  const menu = document.createElement('div');
  menu.className = 'hero-tag-menu';
  menu.addEventListener('click', (e) => e.stopPropagation());

  const title = document.createElement('div');
  title.className = 'hero-tag-menu-title';
  title.textContent = TP_AUTH.hasRole('manager') ? 'Appliquer un tag' : 'Proposer une classification';
  menu.appendChild(title);

  const defaults = await getDefaultTags();
  defaults.forEach(tag => {
    const opt = makeTagOption(tag.name, tag.key, tenantId, domain);
    if (tag.color) opt.style.setProperty('--tag-color', tag.color);
    menu.appendChild(opt);
  });

  if (TP_AUTH.hasRole('manager')) {
    const custom = await getCustomTags();
    if (custom.length > 0) {
      const sep = document.createElement('div');
      sep.className = 'hero-tag-menu-sep';
      sep.textContent = 'Tags personnalisés';
      menu.appendChild(sep);
      custom.forEach(tag => {
        const opt = makeTagOption(tag.name, tag.tagId, tenantId, domain);
        if (tag.color) opt.style.setProperty('--tag-color', tag.color);
        menu.appendChild(opt);
      });
    }
  }

  const comment = document.createElement('input');
  comment.type = 'text';
  comment.className = 'hero-tag-comment';
  comment.placeholder = 'Commentaire (optionnel)';
  comment.maxLength = 200;
  menu.appendChild(comment);
  menu._commentInput = comment;

  // Positionnement fixe + ajout au body pour passer au-dessus de tout
  // (évite d'être piégé dans le contexte d'empilement du hero)
  const rect = anchorBtn.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.zIndex = '3000';
  let left = rect.left;
  const menuWidth = 240;
  if (left + menuWidth > window.innerWidth - 12) left = window.innerWidth - menuWidth - 12;
  if (left < 12) left = 12;
  menu.style.left = left + 'px';
  menu.style.top = (rect.bottom + 6) + 'px';

  document.body.appendChild(menu);
  _openHeroMenu = menu;
  setTimeout(() => document.addEventListener('click', closeHeroTagMenu), 0);
  window.addEventListener('scroll', closeHeroTagMenu, true);
}

function makeTagOption(label, type, tenantId, domain) {
  const opt = document.createElement('button');
  opt.type = 'button';
  opt.className = 'hero-tag-opt';
  opt.textContent = label;
  opt.addEventListener('click', () => {
    const comment = _openHeroMenu && _openHeroMenu._commentInput ? _openHeroMenu._commentInput.value.trim() : '';
    submitHeroTag(tenantId, domain, type, comment, opt);
  });
  return opt;
}

/* Soumet le tag via POST /api/request. Le backend décide pending vs approved. */
async function submitHeroTag(tenantId, domain, type, comment, optEl) {
  if (optEl) { optEl.disabled = true; optEl.classList.add('loading'); }
  try {
    const res = await fetch('/api/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, domain, type, comment })
    });

    if (res.status === 403) { heroTagFeedback('Action verrouillée pour ce tenant', true); closeHeroTagMenu(); return; }
    if (!res.ok) { heroTagFeedback((await safeErr(res)) || 'Erreur lors de l\'envoi', true); return; }

    const data = await res.json();
    closeHeroTagMenu();
    heroTagFeedback(
      data.status === 'approved' ? 'Tag appliqué' : 'Proposition envoyée — en attente de validation',
      false
    );

    if (typeof refreshHeroTags === 'function') refreshHeroTags(tenantId, domain);
    if (typeof refreshAdminBadges === 'function') refreshAdminBadges();
  } catch {
    heroTagFeedback('Erreur réseau', true);
  } finally {
    if (optEl) { optEl.disabled = false; optEl.classList.remove('loading'); }
  }
}

/* Petit message de retour temporaire. */
function heroTagFeedback(message, isError) {
  let toast = document.getElementById('heroTagToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'heroTagToast';
    toast.className = 'hero-tag-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('error', !!isError);
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 3200);
}

// ══════════════════════════════════════════════════════════════════════════
//  AFFICHAGE DES BADGES DU HERO (étape 13)
//  refreshHeroTags() interroge GET /api/classification et rend :
//   - badge validé (✓)            - demandes en attente avec pourcentage (⏳)
//   - état verrouillé (🔒)         - validation directe au clic pour modérateur+
// ══════════════════════════════════════════════════════════════════════════

/* Résout le libellé / la couleur / la description d'un type de tag. */
function resolveTagMeta(type) {
  // 1. Balise par défaut (depuis l'API, sinon repli)
  const def = defaultTagsSync().find(d => d.key === type);
  if (def) return { label: def.name, color: def.color || null, group: def.group, description: def.description || '' };
  // 2. Tag personnalisé
  const custom = (_customTagsCache || []).find(t => t.tagId === type || t.name === type);
  if (custom) return { label: custom.name, color: custom.color || null, description: custom.description || '' };
  return { label: type, color: null };
}

/* Interroge l'API et (re)dessine les badges d'un hero pour un tenant donné.
   zoneEl peut être fourni directement (cas du rendu initial où le hero n'est
   pas encore inséré dans le document → querySelector ne le trouverait pas). */
async function refreshHeroTags(tenantId, domain, zoneEl) {
  const zone = zoneEl || document.querySelector('.hero-tags[data-tenant="' + (window.CSS && CSS.escape ? CSS.escape(tenantId) : tenantId) + '"]');
  if (!zone) return;
  const badges = zone.querySelector('.hero-tags-badges');
  if (!badges) return;

  let data;
  try {
    const res = await fetch('/api/classification?tenantId=' + encodeURIComponent(tenantId), { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return;
    data = await res.json();
  } catch {
    return;
  }

  // S'assure que les tags personnalisés sont en cache pour résoudre leurs
  // libellés/couleurs/descriptions (lecture seule pour tous les rôles)
  if (!_customTagsCache) {
    try { await getCustomTags(); } catch {}
  }

  badges.replaceChildren();

  // ── État de verrouillage ──
  const locked = !!data.locked;
  zone.dataset.locked = locked ? '1' : '0';
  const addBtn = zone.querySelector('.hero-tag-add');
  if (addBtn) {
    const blocked = locked && !TP_AUTH.hasRole('manager');
    addBtn.disabled = blocked;
    addBtn.classList.toggle('locked', locked);
    addBtn.title = blocked
      ? 'Tenant verrouillé — modifications réservées aux managers'
      : (TP_AUTH.hasRole('manager') ? 'Appliquer un tag' : 'Proposer une classification');
  }
  // Badge "Verrouillé" réservé aux modérateurs+ (info de gestion).
  // Les utilisateurs ont simplement le bouton (+) désactivé, sans badge.
  if (locked && TP_AUTH.hasRole('moderator')) {
    const lockBadge = document.createElement('span');
    lockBadge.className = 'hero-badge hero-badge-locked';
    lockBadge.appendChild(badgeIcon('assets/padlock.png'));
    const lt = document.createElement('span'); lt.textContent = 'Verrouillé';
    lockBadge.appendChild(lt);
    badges.appendChild(lockBadge);
  }

  // ── Suppressions en attente (par type) → marquage des badges validés ──
  const removalPending = new Set(
    Array.isArray(data.pendingRemovals) ? data.pendingRemovals.map(r => r.type) : []
  );

  // ── Délai de carence après un rejet de suppression (par type) ──
  const removalCooldown = {};
  if (Array.isArray(data.removalCooldowns)) {
    data.removalCooldowns.forEach(c => { removalCooldown[c.type] = c.until; });
  }

  // ── Badges validés (plusieurs possibles) ──
  if (Array.isArray(data.approvedTags)) {
    data.approvedTags.forEach(t => badges.appendChild(
      makeApprovedBadge(t.type, t, tenantId, domain, removalPending.has(t.type), locked, removalCooldown[t.type])
    ));
  }

  // ── Badges en attente (proportionnels par groupe) ──
  if (Array.isArray(data.pending)) {
    data.pending.forEach(p => badges.appendChild(makePendingBadge(p, tenantId, domain)));
  }
}

/* Crée une petite icône blanche pour l'intérieur d'un badge coloré. */
function badgeIcon(src) {
  const i = document.createElement('img');
  i.src = src; i.alt = ''; i.className = 'badge-ico';
  return i;
}

/* Badge d'un tag validé.
   - Modérateur+ : suppression directe au clic sur « × ».
   - Utilisateur  : bouton « − » pour DEMANDER la suppression (validation modérateur).
   removalPending : true si une demande de suppression est déjà en attente pour ce type.
   locked         : true si le tenant est verrouillé.
   cooldownUntil  : date ISO jusqu'à laquelle toute nouvelle demande de suppression est
                    bloquée (suite à un rejet récent), ou falsy. */
function makeApprovedBadge(type, approved, tenantId, domain, removalPending, locked, cooldownUntil) {
  const meta = resolveTagMeta(type);
  const b = document.createElement('span');
  b.className = 'hero-badge hero-badge-approved';
  b.dataset.type = type;
  if (meta.group) b.dataset.group = meta.group;
  if (meta.color) b.style.setProperty('--tag-color', meta.color);

  b.appendChild(badgeIcon('assets/checked.png'));
  const txt = document.createElement('span');
  txt.textContent = meta.label;
  b.appendChild(txt);

  // Clic sur le badge → bulle d'info (description + qui/quand)
  txt.style.cursor = 'pointer';
  txt.addEventListener('click', (e) => {
    e.stopPropagation();
    showBadgePopover(b, meta, approved);
  });

  const isMod = TP_AUTH.hasRole('moderator');

  if (removalPending) {
    // Une demande de suppression est en attente : on marque visuellement le badge.
    b.classList.add('removal-pending');
    b.title = isMod
      ? 'Suppression demandée par un utilisateur — à valider dans Administration'
      : 'Suppression demandée — en attente de validation';
  }

  if (isMod) {
    // Suppression directe d'un tag validé — modérateur, manager, admin
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'hero-badge-remove';
    rm.textContent = '×';
    rm.title = 'Supprimer ce tag';
    rm.setAttribute('aria-label', 'Supprimer ce tag');
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteApprovedTag(tenantId, type, domain);
    });
    b.appendChild(rm);
  } else if (!removalPending) {
    // Utilisateur : demande de suppression (désactivée si tenant verrouillé
    // ou si une demande a été refusée récemment — délai de carence de 24 h)
    const cooled = cooldownUntil && new Date(cooldownUntil).getTime() > Date.now();
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'hero-badge-remove';
    rm.textContent = '−';
    rm.disabled = !!locked || !!cooled;
    rm.title = locked ? 'Tenant verrouillé'
      : cooled ? 'Suppression refusée récemment — nouvelle demande possible plus tard'
      : 'Demander la suppression de ce tag';
    rm.setAttribute('aria-label', 'Demander la suppression de ce tag');
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      requestRemoveTag(tenantId, type, domain, rm);
    });
    b.appendChild(rm);
  }

  return b;
}

/* Soumet une demande de suppression d'un tag validé via POST /api/request
   (action "remove"). Le backend applique directement pour manager+, sinon
   crée une demande en attente de validation. */
async function requestRemoveTag(tenantId, type, domain, btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, domain, type, action: 'remove' })
    });
    if (res.status === 403) { heroTagFeedback('Action verrouillée pour ce tenant', true); return; }
    if (!res.ok) { heroTagFeedback((await safeErr(res)) || 'Erreur lors de l\'envoi', true); return; }

    const data = await res.json();
    heroTagFeedback(
      data.status === 'removed' ? 'Tag supprimé' : 'Demande de suppression envoyée — en attente de validation',
      false
    );

    if (typeof refreshHeroTags === 'function') refreshHeroTags(tenantId, domain);
    if (typeof refreshAdminBadges === 'function') refreshAdminBadges();
  } catch {
    heroTagFeedback('Erreur réseau', true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

let _openBadgePopover = null;

function closeBadgePopover() {
  if (_openBadgePopover) {
    _openBadgePopover.remove();
    _openBadgePopover = null;
    document.removeEventListener('click', closeBadgePopover);
    window.removeEventListener('scroll', closeBadgePopover, true);
  }
}

/* Affiche une bulle d'info au clic sur un badge validé : nom, description,
   et qui/quand l'a validé. Positionnée en fixed au-dessus de tout. */
function showBadgePopover(anchorEl, meta, approved) {
  if (_openBadgePopover) { closeBadgePopover(); return; }

  const pop = document.createElement('div');
  pop.className = 'badge-popover';
  pop.addEventListener('click', (e) => e.stopPropagation());

  const title = document.createElement('div');
  title.className = 'badge-popover-title';
  // Pastille colorée (contraste sûr) au lieu de colorer le texte
  if (meta.color) {
    const dot = document.createElement('span');
    dot.className = 'badge-popover-dot';
    dot.style.background = meta.color;
    title.appendChild(dot);
  }
  const titleText = document.createElement('span');
  titleText.textContent = meta.label;
  title.appendChild(titleText);
  pop.appendChild(title);

  if (meta.description) {
    const desc = document.createElement('div');
    desc.className = 'badge-popover-desc';
    desc.textContent = meta.description;
    pop.appendChild(desc);
  }

  if (approved && (approved.approvedBy || approved.approvedAt)) {
    const meta2 = document.createElement('div');
    meta2.className = 'badge-popover-meta';
    const who = approved.approvedBy ? 'Validé par ' + approved.approvedBy : 'Validé';
    const when = approved.approvedAt ? ' le ' + new Date(approved.approvedAt).toLocaleDateString('fr-FR') : '';
    meta2.textContent = who + when;
    pop.appendChild(meta2);
  }

  // Positionnement fixe près du badge
  const rect = anchorEl.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.zIndex = '3000';
  let left = rect.left;
  const w = 260;
  if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
  if (left < 12) left = 12;
  pop.style.left = left + 'px';
  pop.style.top = (rect.bottom + 6) + 'px';

  document.body.appendChild(pop);
  _openBadgePopover = pop;
  setTimeout(() => document.addEventListener('click', closeBadgePopover), 0);
  window.addEventListener('scroll', closeBadgePopover, true);
}

/* Supprime un tag validé d'un tenant (modérateur+). */
async function deleteApprovedTag(tenantId, type, domain) {
  try {
    const r = await fetch('/api/classification', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, type })
    });
    if (!r.ok) { heroTagFeedback((await safeErr(r)) || 'Erreur lors de la suppression', true); return; }
    heroTagFeedback('Tag supprimé', false);
    const zone = document.querySelector('.hero-tags[data-tenant="' + (window.CSS && CSS.escape ? CSS.escape(tenantId) : tenantId) + '"]');
    if (zone) refreshHeroTags(tenantId, domain, zone);
    if (typeof refreshAdminBadges === 'function') refreshAdminBadges();
  } catch {
    heroTagFeedback('Erreur réseau', true);
  }
}

/* Badge d'une demande en attente avec pourcentage. Modérateur+ valide au clic. */
function makePendingBadge(p, tenantId, domain) {
  const meta = resolveTagMeta(p.type);
  const b = document.createElement('span');
  b.className = 'hero-badge hero-badge-pending';
  b.dataset.type = p.type;
  if (meta.color) b.style.setProperty('--tag-color', meta.color);

  const pct = (typeof p.percent === 'number') ? ' ' + p.percent + '%' : '';
  b.appendChild(badgeIcon('assets/time.png'));
  const pt = document.createElement('span');
  pt.textContent = meta.label + pct;
  b.appendChild(pt);

  let tip = (p.count || 0) + ' demande(s) en attente';
  if (TP_AUTH.hasRole('moderator')) {
    b.classList.add('clickable');
    tip += ' — cliquer pour valider';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      validatePendingFromHero(tenantId, domain, p.type);
    });
  }
  b.title = tip;
  return b;
}

/* Validation directe depuis le hero (modérateur, manager, admin).
   Récupère une demande correspondante puis l'approuve via /api/review. */
async function validatePendingFromHero(tenantId, domain, type) {
  if (!TP_AUTH.hasRole('moderator')) return;
  try {
    const res = await fetch('/api/requests', { headers: { 'Accept': 'application/json' } });
    if (!res.ok) { heroTagFeedback('Accès refusé', true); return; }
    const list = await res.json();
    const match = list.find(r => r.tenantId === tenantId && r.type === type && (r.action || 'add') === 'add');
    if (!match) { heroTagFeedback('Demande introuvable', true); return; }

    const rev = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: match.requestId, decision: 'approved' })
    });
    if (!rev.ok) { heroTagFeedback('Erreur de validation', true); return; }

    heroTagFeedback('Tag validé', false);
    refreshHeroTags(tenantId, domain);
    if (typeof refreshAdminBadges === 'function') refreshAdminBadges();
  } catch {
    heroTagFeedback('Erreur réseau', true);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  ONGLET ADMINISTRATION (étape 14) — shell, sous-onglets, badges
//  Sous-onglets : Demandes (modérateur+), Tags & Utilisateurs (manager+)
//  Badges topbar : gris = demandes en attente, rouge = alertes de rétention
//  Le contenu des panes est rempli aux étapes 15 (Demandes), 16 (Tags), 17 (Users)
// ══════════════════════════════════════════════════════════════════════════
let currentAdminSubtab = 'requests';

/* Câble les événements statiques de l'onglet Admin (appelé au chargement). */
function bindAdminEvents() {
  const btnOpen  = document.getElementById('btnOpenAdmin');
  const btnClose = document.getElementById('btnAdminClose');
  const overlay  = document.getElementById('adminOverlay');
  const subtabs  = document.getElementById('adminSubtabs');

  if (btnOpen)  btnOpen.addEventListener('click', openAdmin);
  if (btnClose) btnClose.addEventListener('click', closeAdmin);
  if (overlay)  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAdmin(); });
  if (subtabs) {
    subtabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.admin-subtab');
      if (btn && !btn.hidden) switchAdminSubtab(btn.dataset.subtab);
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && !overlay.hidden) closeAdmin();
  });
}

/* Affiche/masque les sous-onglets selon le rôle. */
function applyAdminRoleVisibility() {
  document.querySelectorAll('.admin-subtab[data-min-role]').forEach(btn => {
    const required = btn.dataset.minRole;
    btn.hidden = !TP_AUTH.hasRole(required);
  });
}

function openAdmin() {
  if (!TP_AUTH.loaded) return;
  const overlay = document.getElementById('adminOverlay');
  if (!overlay) return;
  applyAdminRoleVisibility();

  // Titre de la modale selon le rôle
  const titleEl = document.getElementById('adminModalTitleText');
  if (titleEl) titleEl.textContent = TP_AUTH.hasRole('moderator') ? 'Administration' : 'Annuaire des tenants';

  // Si le sous-onglet courant n'est plus visible pour ce rôle, prendre le 1er visible
  let activeBtn = document.querySelector('.admin-subtab[data-subtab="' + currentAdminSubtab + '"]');
  if (!activeBtn || activeBtn.hidden) {
    const firstVisible = Array.from(document.querySelectorAll('.admin-subtab')).find(b => !b.hidden);
    currentAdminSubtab = firstVisible ? firstVisible.dataset.subtab : 'known';
  }

  overlay.hidden = false;
  switchAdminSubtab(currentAdminSubtab);
  if (TP_AUTH.hasRole('moderator')) refreshAdminBadges();
}

function closeAdmin() {
  const overlay = document.getElementById('adminOverlay');
  if (overlay) overlay.hidden = true;
}

/* Bascule entre les sous-onglets et charge le contenu de la pane. */
function switchAdminSubtab(name) {
  currentAdminSubtab = name;

  document.querySelectorAll('.admin-subtab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.subtab === name);
  });
  const panes = { requests: 'adminPaneRequests', known: 'adminPaneKnown', tags: 'adminPaneTags', users: 'adminPaneUsers' };
  Object.entries(panes).forEach(([key, id]) => {
    const pane = document.getElementById(id);
    if (pane) pane.hidden = (key !== name);
  });

  // Chargement du contenu
  if (name === 'requests' && typeof loadAdminRequests === 'function') loadAdminRequests();
  else if (name === 'known' && typeof loadKnownTenants === 'function') loadKnownTenants();
  else if (name === 'tags' && typeof loadAdminTags === 'function') loadAdminTags();
  else if (name === 'users' && typeof loadAdminUsers === 'function') loadAdminUsers();
  else adminPanePlaceholder(panes[name]);
}

/* Placeholder temporaire tant qu'une pane n'a pas son loader (étapes ultérieures). */
function adminPanePlaceholder(paneId) {
  const pane = document.getElementById(paneId);
  if (!pane) return;
  pane.replaceChildren();
  const p = document.createElement('div');
  p.className = 'admin-empty';
  p.textContent = 'Module en cours de mise en place…';
  pane.appendChild(p);
}

/* Met à jour les badges (topbar + sous-onglets) :
   gris = demandes en attente, rouge = alertes de rétention. */
async function refreshAdminBadges() {
  if (!TP_AUTH.hasRole('moderator')) return;

  // Badge gris — demandes en attente
  let pendingCount = 0;
  try {
    const r = await fetch('/api/requests', { headers: { 'Accept': 'application/json' } });
    if (r.ok) { const list = await r.json(); pendingCount = Array.isArray(list) ? list.length : 0; }
  } catch {}
  setCountBadge('adminBadgeReq', pendingCount);
  setCountBadge('subtabBadgeRequests', pendingCount);

  // Badge rouge — alertes de rétention (manager+)
  if (TP_AUTH.hasRole('manager')) {
    let alertCount = 0;
    try {
      const r = await fetch('/api/tags', { headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        const data = await r.json();
        const byKey = {};
        (data.tags || []).forEach(t => { byKey[t.tagId] = t; byKey[t.name] = t; });
        alertCount = (data.expiredItems || []).filter(it => {
          const t = byKey[it.type];
          return t && t.alertOnExpiry;
        }).length;
      }
    } catch {}
    setCountBadge('adminBadgeAlert', alertCount);
    setCountBadge('subtabBadgeTags', alertCount);
  }
}

/* Affiche un badge numérique (max "99+") ou le masque si 0. */
function setCountBadge(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  if (n > 0) {
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

// ── Helpers communs aux panes admin ──
function adminLoading() { const d = document.createElement('div'); d.className = 'admin-empty'; d.textContent = 'Chargement…'; return d; }
function adminEmpty(msg) { const d = document.createElement('div'); d.className = 'admin-empty'; d.textContent = msg; return d; }
function adminError(msg) { const d = document.createElement('div'); d.className = 'admin-empty admin-error'; d.textContent = msg; return d; }
async function safeErr(r) { try { const d = await r.json(); return d && d.error; } catch { return null; } }
function adminSection(titleText) {
  const s = document.createElement('div'); s.className = 'admin-section';
  const t = document.createElement('div'); t.className = 'admin-section-title'; t.textContent = titleText;
  s.appendChild(t); return s;
}

// ══════════════════════════════════════════════════════════════════════════
//  ÉTAPE 15 — Sous-onglet DEMANDES
//  Liste des demandes en attente (qui / quand / tenant / domaine) + valider/rejeter
// ══════════════════════════════════════════════════════════════════════════
async function loadAdminRequests() {
  const pane = document.getElementById('adminPaneRequests');
  if (!pane) return;
  pane.replaceChildren(adminLoading());

  let list;
  try {
    const r = await fetch('/api/requests', { headers: { 'Accept': 'application/json' } });
    if (!r.ok) { pane.replaceChildren(adminError('Accès refusé ou erreur serveur')); return; }
    list = await r.json();
  } catch { pane.replaceChildren(adminError('Erreur réseau')); return; }

  pane.replaceChildren();
  if (!Array.isArray(list) || list.length === 0) {
    pane.appendChild(adminEmpty('Aucune demande en attente'));
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'admin-req-list';
  list.forEach(req => wrap.appendChild(buildRequestRow(req)));
  pane.appendChild(wrap);
}

function buildRequestRow(req) {
  const row = document.createElement('div');
  row.className = 'admin-req-row';

  const isRemoval = (req.action || 'add') === 'remove';
  if (isRemoval) row.classList.add('admin-req-removal');

  const info = document.createElement('div');
  info.className = 'admin-req-info';

  // Étiquette du type de demande (suppression vs ajout)
  const actionTag = document.createElement('div');
  actionTag.className = 'admin-req-action-tag' + (isRemoval ? ' is-removal' : '');
  actionTag.textContent = isRemoval ? 'Demande de suppression' : 'Demande d\'ajout';
  info.appendChild(actionTag);

  const meta = resolveTagMeta(req.type);
  const badge = document.createElement('span');
  badge.className = 'hero-badge hero-badge-pending';
  if (meta.color) badge.style.setProperty('--tag-color', meta.color);
  badge.appendChild(badgeIcon('assets/time.png'));
  const blbl = document.createElement('span'); blbl.textContent = meta.label;
  badge.appendChild(blbl);
  info.appendChild(badge);

  const dom = document.createElement('div');
  dom.className = 'admin-req-domain';
  dom.textContent = req.domain || '(domaine inconnu)';
  info.appendChild(dom);

  const tenant = document.createElement('div');
  tenant.className = 'admin-req-tenant';
  tenant.textContent = req.tenantId;
  info.appendChild(tenant);

  const who = document.createElement('div');
  who.className = 'admin-req-meta';
  const when = req.requestedAt ? new Date(req.requestedAt).toLocaleString('fr-FR') : '';
  who.textContent = (req.requestedBy || 'inconnu') + (when ? ' · ' + when : '');
  info.appendChild(who);

  if (req.comment) {
    const c = document.createElement('div');
    c.className = 'admin-req-comment';
    c.textContent = '« ' + req.comment + ' »';
    info.appendChild(c);
  }
  row.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'admin-req-actions';
  const approve = document.createElement('button');
  approve.type = 'button'; approve.className = 'admin-btn admin-btn-approve';
  approve.appendChild(badgeIcon('assets/checked.png'));
  approve.appendChild(document.createTextNode(isRemoval ? ' Valider la suppression' : ' Approuver'));
  approve.addEventListener('click', () => reviewRequest(req, 'approved', row));
  const reject = document.createElement('button');
  reject.type = 'button'; reject.className = 'admin-btn admin-btn-reject'; reject.textContent = 'Rejeter';
  reject.addEventListener('click', () => reviewRequest(req, 'rejected', row));
  actions.appendChild(approve); actions.appendChild(reject);

  // Manager+ : couper discrètement les requêtes de cet utilisateur
  if (TP_AUTH.hasRole('manager') && req.requestedBy) {
    const block = document.createElement('button');
    block.type = 'button'; block.className = 'admin-btn admin-btn-small';
    block.textContent = 'Bloquer l\'auteur';
    block.title = 'Couper les requêtes de ' + req.requestedBy;
    block.addEventListener('click', () => blockUser(req.requestedBy));
    actions.appendChild(block);
  }
  row.appendChild(actions);

  return row;
}

async function reviewRequest(req, decision, rowEl) {
  const btns = rowEl.querySelectorAll('button');
  btns.forEach(b => b.disabled = true);
  try {
    const r = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: req.requestId, decision })
    });
    if (!r.ok) {
      heroTagFeedback((await safeErr(r)) || 'Erreur lors de la décision', true);
      btns.forEach(b => b.disabled = false);
      return;
    }
    heroTagFeedback(decision === 'approved' ? 'Demande approuvée' : 'Demande rejetée', false);
    rowEl.remove();
    refreshAdminBadges();

    // Rafraîchit le hero du tenant concerné s'il est affiché (recherche directe)
    const zone = document.querySelector('.hero-tags[data-tenant="' + (window.CSS && CSS.escape ? CSS.escape(req.tenantId) : req.tenantId) + '"]');
    if (zone) refreshHeroTags(req.tenantId, req.domain, zone);

    const pane = document.getElementById('adminPaneRequests');
    if (pane && !pane.querySelector('.admin-req-row')) {
      pane.replaceChildren(adminEmpty('Aucune demande en attente'));
    }
  } catch {
    heroTagFeedback('Erreur réseau', true);
    btns.forEach(b => b.disabled = false);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  ÉTAPE 16 — Sous-onglet TAGS
//  Création / modification / suppression de tags custom + tags expirés
// ══════════════════════════════════════════════════════════════════════════
async function loadAdminTags() {
  const pane = document.getElementById('adminPaneTags');
  if (!pane) return;
  pane.replaceChildren(adminLoading());

  let data;
  try {
    const r = await fetch('/api/tags', { headers: { 'Accept': 'application/json' } });
    if (!r.ok) { pane.replaceChildren(adminError('Accès refusé ou erreur serveur')); return; }
    data = await r.json();
  } catch { pane.replaceChildren(adminError('Erreur réseau')); return; }

  _customTagsCache  = Array.isArray(data.tags) ? data.tags : [];
  _defaultTagsCache = Array.isArray(data.defaults) ? data.defaults : [];
  pane.replaceChildren();

  // Balises par défaut — gestion réservée aux admins
  if (TP_AUTH.role === 'admin') {
    pane.appendChild(buildDefaultTagForm(null));
    const defSection = adminSection('Balises par défaut');
    if (_defaultTagsCache.length) {
      _defaultTagsCache.forEach(d => defSection.appendChild(buildDefaultTagRow(d)));
    } else {
      defSection.appendChild(adminEmpty('Aucune balise par défaut'));
    }
    pane.appendChild(defSection);
  }

  // Formulaire de création (tag personnalisé)
  pane.appendChild(buildTagForm(null));

  // Liste des tags custom
  const tagsSection = adminSection('Tags personnalisés');
  if (data.tags && data.tags.length) {
    data.tags.forEach(tag => tagsSection.appendChild(buildTagRow(tag)));
  } else {
    tagsSection.appendChild(adminEmpty('Aucun tag personnalisé'));
  }
  pane.appendChild(tagsSection);

  // Tags expirés
  const expSection = adminSection('Tags expirés');
  if (data.expiredItems && data.expiredItems.length) {
    data.expiredItems.forEach(it => expSection.appendChild(buildExpiredRow(it)));
  } else {
    expSection.appendChild(adminEmpty('Aucun tag expiré'));
  }
  pane.appendChild(expSection);

  // Tous les tags assignés (consultation + recherche)
  pane.appendChild(await buildAssignedTagsSection());
}

// ── Balises par défaut (admin) : création / édition / suppression ──
function buildDefaultTagForm(existing) {
  const form = document.createElement('div'); form.className = 'admin-tag-form admin-default-form';
  const title = document.createElement('div'); title.className = 'admin-section-title';
  title.textContent = existing ? 'Modifier la balise par défaut' : 'Créer une balise par défaut';
  form.appendChild(title);

  const nameInput = document.createElement('input');
  nameInput.type = 'text'; nameInput.className = 'admin-input'; nameInput.placeholder = 'Nom de la balise'; nameInput.maxLength = 40;
  if (existing) nameInput.value = existing.name;

  const colorInput = document.createElement('input');
  colorInput.type = 'color'; colorInput.className = 'admin-color';
  colorInput.value = existing && existing.color ? existing.color : '#4B3FBE';

  const descInput = document.createElement('textarea');
  descInput.className = 'admin-input admin-textarea';
  descInput.placeholder = 'Description (affichée au clic sur la balise)'; descInput.maxLength = 300;
  if (existing) descInput.value = existing.description || '';

  const submit = document.createElement('button');
  submit.type = 'button'; submit.className = 'admin-btn admin-btn-approve';
  submit.textContent = existing ? 'Enregistrer' : 'Créer la balise';
  submit.addEventListener('click', () => saveDefaultTag({
    key: existing ? existing.key : undefined,
    name: nameInput.value.trim(),
    color: colorInput.value,
    description: descInput.value.trim()
  }));

  form.appendChild(nameInput); form.appendChild(colorInput); form.appendChild(descInput); form.appendChild(submit);
  if (existing) {
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'admin-btn admin-btn-small'; cancel.textContent = 'Annuler';
    cancel.addEventListener('click', () => loadAdminTags());
    form.appendChild(cancel);
  }
  return form;
}

function buildDefaultTagRow(d) {
  const row = document.createElement('div'); row.className = 'admin-tag-row';
  const swatch = document.createElement('span'); swatch.className = 'admin-tag-swatch'; swatch.style.background = d.color || '#4B3FBE';
  const name = document.createElement('span'); name.className = 'admin-tag-name'; name.textContent = d.name;
  const info = document.createElement('span'); info.className = 'admin-tag-info';
  const exclusive = d.group === 'classification' || d.group === 'gdap';
  info.textContent = exclusive ? 'exclusif (' + d.group + ')' : 'cumulable';
  if (d.description) row.title = d.description;

  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'admin-btn admin-btn-small'; edit.textContent = 'Modifier';
  edit.addEventListener('click', () => openDefaultTagEdit(d));
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'admin-btn admin-btn-small admin-btn-reject'; del.textContent = 'Supprimer';
  del.addEventListener('click', () => deleteDefaultTag(d, row));

  row.appendChild(swatch); row.appendChild(name); row.appendChild(info); row.appendChild(edit); row.appendChild(del);
  return row;
}

function openDefaultTagEdit(d) {
  const pane = document.getElementById('adminPaneTags');
  if (!pane) return;
  const oldForm = pane.querySelector('.admin-default-form');
  const newForm = buildDefaultTagForm(d);
  if (oldForm) pane.replaceChild(newForm, oldForm);
  else pane.insertBefore(newForm, pane.firstChild);
  newForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveDefaultTag(payload) {
  if (!payload.name) { heroTagFeedback('Le nom est obligatoire', true); return; }
  if (!payload.color) { heroTagFeedback('La couleur est obligatoire', true); return; }
  try {
    const r = await fetch('/api/tags', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'default', key: payload.key, name: payload.name, color: payload.color, description: payload.description })
    });
    if (!r.ok) { heroTagFeedback((await safeErr(r)) || "Erreur lors de l'enregistrement", true); return; }
    heroTagFeedback('Balise enregistrée', false);
    _defaultTagsCache = null;
    loadAdminTags();
    refreshCurrentHero();
  } catch { heroTagFeedback('Erreur réseau', true); }
}

async function deleteDefaultTag(d, rowEl) {
  if (!window.confirm('Supprimer la balise « ' + d.name + ' » ? Toutes ses assignations sur les tenants seront retirées.')) return;
  try {
    const r = await fetch('/api/tags', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'default', key: d.key })
    });
    if (!r.ok) { heroTagFeedback((await safeErr(r)) || 'Erreur lors de la suppression', true); return; }
    heroTagFeedback('Balise supprimée', false);
    _defaultTagsCache = null;
    if (rowEl) rowEl.remove();
    refreshCurrentHero();
  } catch { heroTagFeedback('Erreur réseau', true); }
}

/* Rafraîchit les badges du hero actuellement affiché (si présent). */
function refreshCurrentHero() {
  if (currentState && currentState.ms && currentState.ms.tenantId) {
    const zone = document.querySelector('.hero-tags[data-tenant="' + (window.CSS && CSS.escape ? CSS.escape(currentState.ms.tenantId) : currentState.ms.tenantId) + '"]');
    if (zone) refreshHeroTags(currentState.ms.tenantId, currentState.domain, zone);
  }
}

// ── Helpers partagés : filtre dynamique, copie ──

/* Vrai si un type de tag correspond au filtre actif. */
function filterMatchType(type, activeKey) {
  if (activeKey === 'all') return true;
  if (activeKey === '__custom') return !defaultTagsSync().some(d => d.key === type);
  return type === activeKey;
}

/* Construit une barre de chips de filtre dynamique :
   Tous + une puce par balise par défaut + Custom. onChange(activeKey) au clic. */
function buildFilterChips(onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'admin-chips';
  const state = { active: 'all' };
  const chips = [{ key: 'all', label: 'Tous' }];
  defaultTagsSync().forEach(d => chips.push({ key: d.key, label: d.name }));
  chips.push({ key: '__custom', label: 'Custom' });
  chips.forEach(k => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'admin-chip' + (k.key === 'all' ? ' active' : '');
    b.textContent = k.label;
    b.addEventListener('click', () => {
      state.active = k.key;
      wrap.querySelectorAll('.admin-chip').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      onChange(state.active);
    });
    wrap.appendChild(b);
  });
  return { el: wrap, state };
}

/* Copie un tenant ID dans le presse-papier avec retour visuel. */
function copyTenantId(tenantId, btn) {
  const ok = () => {
    if (btn) { const o = btn.textContent; btn.textContent = 'Copié ✓'; setTimeout(() => { btn.textContent = o; }, 1200); }
    heroTagFeedback('Tenant ID copié', false);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(tenantId).then(ok).catch(() => heroTagFeedback('Copie impossible', true));
  } else {
    heroTagFeedback('Copie non supportée par le navigateur', true);
  }
}

function copyDomain(domain, btn) {
  const ok = () => {
    if (btn) { const o = btn.textContent; btn.textContent = 'Copié ✓'; setTimeout(() => { btn.textContent = o; }, 1200); }
    heroTagFeedback('Domaine copié', false);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(domain).then(ok).catch(() => heroTagFeedback('Copie impossible', true));
  } else {
    heroTagFeedback('Copie non supportée par le navigateur', true);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  Sous-onglet TENANT CONNU (utilisateurs + modérateurs + plus)
//  Liste groupée par tenant (un tenant = une ligne, tous ses tags) + filtres
//  rapides par type + recherche + copie du tenant ID. Lecture seule.
// ══════════════════════════════════════════════════════════════════════════
async function loadKnownTenants() {
  const pane = document.getElementById('adminPaneKnown');
  if (!pane) return;
  pane.replaceChildren(adminLoading());

  if (!_customTagsCache) { try { await getCustomTags(); } catch {} }

  let items = [];
  try {
    const r = await fetch('/api/classification?all=1', { headers: { 'Accept': 'application/json' } });
    if (!r.ok) { pane.replaceChildren(adminError('Erreur serveur')); return; }
    const d = await r.json();
    items = Array.isArray(d.items) ? d.items : [];
  } catch { pane.replaceChildren(adminError('Erreur réseau')); return; }

  // Regroupement par tenant (évite les doublons)
  const byTenant = new Map();
  items.forEach(it => {
    if (!byTenant.has(it.tenantId)) byTenant.set(it.tenantId, { tenantId: it.tenantId, domain: it.domain || '', types: [] });
    const g = byTenant.get(it.tenantId);
    if (it.domain && !g.domain) g.domain = it.domain;
    if (!g.types.includes(it.type)) g.types.push(it.type);
  });
  const tenants = Array.from(byTenant.values())
    .sort((a, b) => (a.domain || a.tenantId).localeCompare(b.domain || b.tenantId));

  pane.replaceChildren();
  const section = adminSection('Annuaire des tenants');
  const titleEl = section.querySelector('.admin-section-title');
  if (titleEl) {
    const countBadge = document.createElement('span');
    countBadge.className = 'admin-count-badge';
    countBadge.textContent = String(tenants.length);
    countBadge.title = 'Nombre total de tenants tagués';
    titleEl.appendChild(countBadge);
  }

  const chips = buildFilterChips(() => render());
  section.appendChild(chips.el);

  const search = document.createElement('input');
  search.type = 'text'; search.className = 'admin-input';
  search.placeholder = 'Rechercher par domaine, tenant ou tag…';
  section.appendChild(search);

  const list = document.createElement('div');
  list.className = 'admin-assigned-list';
  section.appendChild(list);

  const render = () => {
    list.replaceChildren();
    const f = search.value.trim().toLowerCase();
    const kind = chips.state.active;
    const filtered = tenants.filter(t => {
      const kindOk = kind === 'all' || t.types.some(ty => filterMatchType(ty, kind));
      if (!kindOk) return false;
      if (!f) return true;
      const labels = t.types.map(ty => resolveTagMeta(ty).label.toLowerCase()).join(' ');
      return (t.domain || '').toLowerCase().includes(f) || t.tenantId.toLowerCase().includes(f) || labels.includes(f);
    });
    if (!filtered.length) { list.appendChild(adminEmpty('Aucun tenant référencé')); return; }
    filtered.forEach(t => list.appendChild(buildKnownRow(t)));
  };

  search.addEventListener('input', render);
  render();
  pane.appendChild(section);
}

function buildKnownRow(t) {
  const row = document.createElement('div'); row.className = 'admin-known-row';

  const head = document.createElement('div'); head.className = 'admin-known-head';

  // Bloc texte (prioritaire : prend la place, ne se fait pas rogner par les boutons)
  const idWrap = document.createElement('div'); idWrap.className = 'admin-known-id';
  const dom = document.createElement('span'); dom.className = 'admin-assigned-domain'; dom.textContent = t.domain || '(domaine inconnu)';
  const tid = document.createElement('span'); tid.className = 'admin-assigned-tenant'; tid.textContent = t.tenantId;
  idWrap.appendChild(dom); idWrap.appendChild(tid);
  if (hasAdminAccount(t.tenantId)) {
    const adminDot = document.createElement('span'); adminDot.className = 'history-admin-dot'; adminDot.title = 'Compte admin créé sur ce tenant';
    idWrap.appendChild(adminDot);
  }
  head.appendChild(idWrap);

  // Bloc actions (boutons groupés : passent à la ligne ensemble si la place manque)
  const actions = document.createElement('div'); actions.className = 'admin-known-actions';
  if (t.domain) {
    const analyze = document.createElement('button'); analyze.type = 'button'; analyze.className = 'admin-btn admin-btn-small admin-btn-analyze'; analyze.textContent = 'Analyser';
    analyze.title = 'Ouvrir la recherche / analyse pour ' + t.domain;
    analyze.addEventListener('click', () => { closeAdmin(); loadFromHistory(t.domain); });
    actions.appendChild(analyze);
  }
  const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'admin-btn admin-btn-small'; copy.textContent = 'Copier ID';
  copy.addEventListener('click', () => copyTenantId(t.tenantId, copy));
  actions.appendChild(copy);
  if (t.domain) {
    const copyDom = document.createElement('button'); copyDom.type = 'button'; copyDom.className = 'admin-btn admin-btn-small'; copyDom.textContent = 'Copier domaine';
    copyDom.addEventListener('click', () => copyDomain(t.domain, copyDom));
    actions.appendChild(copyDom);
  }
  head.appendChild(actions);

  const badges = document.createElement('div'); badges.className = 'admin-known-badges';
  t.types.forEach(ty => {
    const meta = resolveTagMeta(ty);
    const b = document.createElement('span'); b.className = 'hero-badge hero-badge-approved'; b.dataset.type = ty;
    if (meta.group) b.dataset.group = meta.group;
    if (meta.color) b.style.setProperty('--tag-color', meta.color);
    b.appendChild(badgeIcon('assets/checked.png'));
    const s = document.createElement('span'); s.textContent = meta.label; b.appendChild(s);
    badges.appendChild(b);
  });

  row.appendChild(head); row.appendChild(badges);
  return row;
}

/* Section "Tags assignés" : liste de tous les tags validés (tous tenants)
   avec filtres rapides + recherche + copie. Manager+ (onglet Tags). */
async function buildAssignedTagsSection() {
  const section = adminSection('Tags assignés');

  let items = [];
  try {
    const r = await fetch('/api/classification?all=1', { headers: { 'Accept': 'application/json' } });
    if (r.ok) { const d = await r.json(); items = Array.isArray(d.items) ? d.items : []; }
  } catch {}

  const chips = buildFilterChips(() => render());
  section.appendChild(chips.el);

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'admin-input';
  search.placeholder = 'Rechercher par tag, domaine ou tenant…';
  section.appendChild(search);

  const list = document.createElement('div');
  list.className = 'admin-assigned-list';
  section.appendChild(list);

  const render = () => {
    list.replaceChildren();
    const f = search.value.trim().toLowerCase();
    const kind = chips.state.active;
    const filtered = items.filter(it => {
      if (!filterMatchType(it.type, kind)) return false;
      const meta = resolveTagMeta(it.type);
      return !f
        || meta.label.toLowerCase().includes(f)
        || (it.domain || '').toLowerCase().includes(f)
        || it.tenantId.toLowerCase().includes(f);
    });
    if (!filtered.length) { list.appendChild(adminEmpty('Aucun tag assigné')); return; }
    filtered.forEach(it => list.appendChild(buildAssignedRow(it)));
  };

  search.addEventListener('input', render);
  render();
  return section;
}

function buildAssignedRow(it) {
  const row = document.createElement('div');
  row.className = 'admin-assigned-row';

  const meta = resolveTagMeta(it.type);
  const badge = document.createElement('span');
  badge.className = 'hero-badge hero-badge-approved';
  badge.dataset.type = it.type;
  if (meta.group) badge.dataset.group = meta.group;
  if (meta.color) badge.style.setProperty('--tag-color', meta.color);
  badge.appendChild(badgeIcon('assets/checked.png'));
  const bt = document.createElement('span'); bt.textContent = meta.label;
  badge.appendChild(bt);

  const dom = document.createElement('span');
  dom.className = 'admin-assigned-domain';
  dom.textContent = it.domain || '(domaine inconnu)';

  const tid = document.createElement('span');
  tid.className = 'admin-assigned-tenant';
  tid.textContent = it.tenantId;

  const copy = document.createElement('button');
  copy.type = 'button'; copy.className = 'admin-btn admin-btn-small'; copy.textContent = 'Copier ID';
  copy.addEventListener('click', () => copyTenantId(it.tenantId, copy));

  const del = document.createElement('button');
  del.type = 'button'; del.className = 'admin-btn admin-btn-small admin-btn-reject'; del.textContent = 'Supprimer';
  del.addEventListener('click', () => removeAssigned(it, row));

  row.appendChild(badge); row.appendChild(dom); row.appendChild(tid); row.appendChild(copy); row.appendChild(del);
  return row;
}

async function removeAssigned(it, rowEl) {
  try {
    const r = await fetch('/api/classification', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: it.tenantId, type: it.type })
    });
    if (!r.ok) { heroTagFeedback((await safeErr(r)) || 'Erreur', true); return; }
    heroTagFeedback('Tag supprimé', false);
    rowEl.remove();
    const zone = document.querySelector('.hero-tags[data-tenant="' + (window.CSS && CSS.escape ? CSS.escape(it.tenantId) : it.tenantId) + '"]');
    if (zone) refreshHeroTags(it.tenantId, it.domain, zone);
  } catch { heroTagFeedback('Erreur réseau', true); }
}

function buildTagForm(existing) {
  const form = document.createElement('div');
  form.className = 'admin-tag-form';

  const title = document.createElement('div');
  title.className = 'admin-section-title';
  title.textContent = existing ? 'Modifier le tag' : 'Créer un tag personnalisé';
  form.appendChild(title);

  const nameInput = document.createElement('input');
  nameInput.type = 'text'; nameInput.className = 'admin-input'; nameInput.placeholder = 'Nom du tag'; nameInput.maxLength = 40;
  if (existing) nameInput.value = existing.name;

  const colorInput = document.createElement('input');
  colorInput.type = 'color'; colorInput.className = 'admin-color';
  colorInput.value = existing && existing.color ? existing.color : '#6366f1';

  const descInput = document.createElement('textarea');
  descInput.className = 'admin-input admin-textarea';
  descInput.placeholder = 'Description (affichée au clic sur le tag)'; descInput.maxLength = 300;
  if (existing) descInput.value = existing.description || '';

  // Rétention
  const retRow = document.createElement('div'); retRow.className = 'admin-form-row';
  const retCheck = document.createElement('input'); retCheck.type = 'checkbox';
  const retInput = document.createElement('input');
  retInput.type = 'number'; retInput.min = '1'; retInput.max = '3650';
  retInput.className = 'admin-input admin-input-num'; retInput.placeholder = 'jours'; retInput.disabled = true;
  if (existing && existing.retentionDays) { retCheck.checked = true; retInput.disabled = false; retInput.value = existing.retentionDays; }
  retCheck.addEventListener('change', () => { retInput.disabled = !retCheck.checked; });
  const retLabel = document.createElement('label'); retLabel.className = 'admin-check';
  retLabel.appendChild(retCheck); retLabel.appendChild(document.createTextNode(' Rétention :'));
  retRow.appendChild(retLabel); retRow.appendChild(retInput);
  retRow.appendChild(document.createTextNode(' jours'));

  // Alerte
  const alertRow = document.createElement('div'); alertRow.className = 'admin-form-row';
  const alertCheck = document.createElement('input'); alertCheck.type = 'checkbox';
  if (existing && existing.alertOnExpiry) alertCheck.checked = true;
  const alertLabel = document.createElement('label'); alertLabel.className = 'admin-check';
  alertLabel.appendChild(alertCheck);
  alertLabel.appendChild(document.createTextNode(" Alerte dans l'onglet admin à l'expiration"));
  alertRow.appendChild(alertLabel);

  const submit = document.createElement('button');
  submit.type = 'button'; submit.className = 'admin-btn admin-btn-approve';
  submit.textContent = existing ? 'Enregistrer' : 'Créer le tag';
  submit.addEventListener('click', () => saveTag({
    tagId: existing ? existing.tagId : undefined,
    name: nameInput.value.trim(),
    color: colorInput.value,
    description: descInput.value.trim(),
    retentionDays: retCheck.checked ? (parseInt(retInput.value, 10) || null) : null,
    alertOnExpiry: alertCheck.checked
  }));

  form.appendChild(nameInput);
  form.appendChild(colorInput);
  form.appendChild(descInput);
  form.appendChild(retRow);
  form.appendChild(alertRow);
  form.appendChild(submit);
  if (existing) {
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'admin-btn admin-btn-small'; cancel.textContent = 'Annuler';
    cancel.addEventListener('click', () => loadAdminTags());
    form.appendChild(cancel);
  }
  return form;
}

async function saveTag(payload) {
  if (!payload.name) { heroTagFeedback('Le nom est obligatoire', true); return; }
  if (!payload.color) { heroTagFeedback('La couleur est obligatoire', true); return; }
  try {
    const r = await fetch('/api/tags', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r.ok) { heroTagFeedback((await safeErr(r)) || "Erreur lors de l'enregistrement", true); return; }
    heroTagFeedback('Tag enregistré', false);
    _customTagsCache = null;
    loadAdminTags();
    refreshAdminBadges();
  } catch { heroTagFeedback('Erreur réseau', true); }
}

function buildTagRow(tag) {
  const row = document.createElement('div'); row.className = 'admin-tag-row';
  const swatch = document.createElement('span'); swatch.className = 'admin-tag-swatch';
  swatch.style.background = tag.color || '#6366f1';
  const name = document.createElement('span'); name.className = 'admin-tag-name'; name.textContent = tag.name;
  const info = document.createElement('span'); info.className = 'admin-tag-info';
  const bits = [];
  if (tag.retentionDays) bits.push('rétention ' + tag.retentionDays + ' j');
  if (tag.alertOnExpiry) bits.push('alerte');
  info.textContent = bits.join(' · ');
  if (tag.description) row.title = tag.description;

  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'admin-btn admin-btn-small'; edit.textContent = 'Modifier';
  edit.addEventListener('click', () => openTagEdit(tag));
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'admin-btn admin-btn-small admin-btn-reject'; del.textContent = 'Supprimer';
  del.addEventListener('click', () => deleteTag(tag, row));

  row.appendChild(swatch); row.appendChild(name); row.appendChild(info);
  row.appendChild(edit); row.appendChild(del);
  return row;
}

function openTagEdit(tag) {
  const pane = document.getElementById('adminPaneTags');
  if (!pane) return;
  const oldForm = pane.querySelector('.admin-tag-form:not(.admin-default-form)');
  const newForm = buildTagForm(tag);
  if (oldForm) pane.replaceChild(newForm, oldForm);
  else pane.insertBefore(newForm, pane.firstChild);
  newForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteTag(tag, rowEl) {
  try {
    const r = await fetch('/api/tags', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagId: tag.tagId })
    });
    if (!r.ok) { heroTagFeedback((await safeErr(r)) || 'Erreur lors de la suppression', true); return; }
    heroTagFeedback('Tag supprimé', false);
    _customTagsCache = null;
    rowEl.remove();
    refreshAdminBadges();
    // Rafraîchit le hero du tenant affiché (le badge résiduel disparaît)
    if (currentState && currentState.ms && currentState.ms.tenantId) {
      const zone = document.querySelector('.hero-tags[data-tenant="' + (window.CSS && CSS.escape ? CSS.escape(currentState.ms.tenantId) : currentState.ms.tenantId) + '"]');
      if (zone) refreshHeroTags(currentState.ms.tenantId, currentState.domain, zone);
    }
  } catch { heroTagFeedback('Erreur réseau', true); }
}

function buildExpiredRow(it) {
  const row = document.createElement('div'); row.className = 'admin-expired-row';
  const meta = resolveTagMeta(it.type);
  const badge = document.createElement('span'); badge.className = 'hero-badge hero-badge-expired';
  if (meta.color) badge.style.setProperty('--tag-color', meta.color);
  const wi = document.createElement('img'); wi.src = 'assets/warning.png'; wi.alt = ''; wi.className = 'icon-adaptive';
  badge.appendChild(wi);
  const el = document.createElement('span'); el.textContent = meta.label;
  badge.appendChild(el);
  const dom = document.createElement('span'); dom.className = 'admin-expired-domain';
  dom.textContent = it.domain || it.tenantId;
  const since = document.createElement('span'); since.className = 'admin-expired-since';
  since.textContent = 'expiré depuis ' + it.expiredSinceDays + ' j';
  const renew = document.createElement('button');
  renew.type = 'button'; renew.className = 'admin-btn admin-btn-small'; renew.textContent = 'Renouveler';
  renew.addEventListener('click', () => renewExpired(it, row));
  row.appendChild(badge); row.appendChild(dom); row.appendChild(since); row.appendChild(renew);
  return row;
}

async function renewExpired(it, rowEl) {
  try {
    const r = await fetch('/api/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: it.tenantId, domain: it.domain, type: it.type })
    });
    if (!r.ok) { heroTagFeedback((await safeErr(r)) || 'Erreur', true); return; }
    heroTagFeedback('Tag renouvelé', false);
    rowEl.remove();
    refreshAdminBadges();
  } catch { heroTagFeedback('Erreur réseau', true); }
}

// ══════════════════════════════════════════════════════════════════════════
//  ÉTAPE 17 — Sous-onglet UTILISATEURS + verrouillage
//  Gestion des rôles (selon hiérarchie) + verrou global / par tenant
// ══════════════════════════════════════════════════════════════════════════
async function loadAdminUsers() {
  const pane = document.getElementById('adminPaneUsers');
  if (!pane) return;
  pane.replaceChildren(adminLoading());

  let roles;
  try {
    const r = await fetch('/api/roles', { headers: { 'Accept': 'application/json' } });
    if (!r.ok) { pane.replaceChildren(adminError('Accès refusé ou erreur serveur')); return; }
    roles = await r.json();
  } catch { pane.replaceChildren(adminError('Erreur réseau')); return; }

  const all = Array.isArray(roles) ? roles : [];
  const privileged = all.filter(u => ['admin', 'manager', 'moderator', 'tech'].includes(u.role));
  const blocked = all.filter(u => u.role === 'blocked');

  pane.replaceChildren();
  pane.appendChild(await buildLockSection());
  pane.appendChild(buildAddRoleForm());

  // Rôles attribués
  const section = adminSection('Rôles attribués');
  if (privileged.length) {
    privileged.forEach(u => section.appendChild(buildRoleRow(u)));
  } else {
    section.appendChild(adminEmpty('Aucun rôle attribué'));
  }
  pane.appendChild(section);

  // Blocage de requêtes
  pane.appendChild(buildBlockForm());

  const blockSection = adminSection('Requêtes bloquées');
  if (blocked.length) {
    blocked.forEach(u => blockSection.appendChild(buildBlockedRow(u)));
  } else {
    blockSection.appendChild(adminEmpty('Aucun utilisateur bloqué'));
  }
  pane.appendChild(blockSection);
}

/* Formulaire : couper les requêtes d'un utilisateur (manager+). */
function buildBlockForm() {
  const form = document.createElement('div'); form.className = 'admin-tag-form';
  const title = document.createElement('div'); title.className = 'admin-section-title'; title.textContent = 'Couper les requêtes d\'un utilisateur';
  form.appendChild(title);

  const email = document.createElement('input');
  email.type = 'email'; email.className = 'admin-input'; email.placeholder = 'prenom.nom@contoso.com';

  const submit = document.createElement('button');
  submit.type = 'button'; submit.className = 'admin-btn admin-btn-reject'; submit.textContent = 'Bloquer les requêtes';
  submit.addEventListener('click', () => blockUser(email.value.trim()));

  form.appendChild(email); form.appendChild(submit);
  return form;
}

function buildBlockedRow(u) {
  const row = document.createElement('div'); row.className = 'admin-role-row';
  const email = document.createElement('span'); email.className = 'admin-role-email'; email.textContent = u.email;
  const badge = document.createElement('span'); badge.className = 'admin-role-badge admin-role-blocked'; badge.textContent = 'Bloqué';
  const unblock = document.createElement('button');
  unblock.type = 'button'; unblock.className = 'admin-btn admin-btn-small'; unblock.textContent = 'Débloquer';
  unblock.addEventListener('click', () => unblockUser(u.email, row));
  row.appendChild(email); row.appendChild(badge); row.appendChild(unblock);
  return row;
}

async function blockUser(email) {
  if (!email) { heroTagFeedback('Email obligatoire', true); return; }
  try {
    const r = await fetch('/api/roles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role: 'blocked' })
    });
    if (!r.ok) { heroTagFeedback((await safeErr(r)) || 'Erreur', true); return; }
    heroTagFeedback('Requêtes coupées pour ' + email, false);
    loadAdminUsers();
  } catch { heroTagFeedback('Erreur réseau', true); }
}

async function unblockUser(email, rowEl) {
  try {
    const r = await fetch('/api/roles', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!r.ok) { heroTagFeedback((await safeErr(r)) || 'Erreur', true); return; }
    heroTagFeedback('Utilisateur débloqué', false);
    if (rowEl) rowEl.remove();
  } catch { heroTagFeedback('Erreur réseau', true); }
}

function buildAddRoleForm() {
  const form = document.createElement('div'); form.className = 'admin-tag-form';
  const title = document.createElement('div'); title.className = 'admin-section-title'; title.textContent = 'Ajouter un rôle';
  form.appendChild(title);

  const email = document.createElement('input');
  email.type = 'email'; email.className = 'admin-input'; email.placeholder = 'prenom.nom@contoso.com';

  const select = document.createElement('select'); select.className = 'admin-input';
  const optTech = document.createElement('option'); optTech.value = 'tech'; optTech.textContent = 'Tech (procédures)';
  select.appendChild(optTech);
  const optMod = document.createElement('option'); optMod.value = 'moderator'; optMod.textContent = 'Modérateur';
  select.appendChild(optMod);
  if (TP_AUTH.role === 'admin') {
    const optMan = document.createElement('option'); optMan.value = 'manager'; optMan.textContent = 'Manager';
    select.appendChild(optMan);
  }

  const submit = document.createElement('button');
  submit.type = 'button'; submit.className = 'admin-btn admin-btn-approve'; submit.textContent = 'Ajouter';
  submit.addEventListener('click', () => addRole(email.value.trim(), select.value));

  form.appendChild(email); form.appendChild(select); form.appendChild(submit);
  return form;
}

async function addRole(email, role) {
  if (!email) { heroTagFeedback('Email obligatoire', true); return; }
  try {
    const r = await fetch('/api/roles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role })
    });
    if (!r.ok) { heroTagFeedback((await safeErr(r)) || 'Erreur', true); return; }
    heroTagFeedback('Rôle attribué', false);
    loadAdminUsers();
  } catch { heroTagFeedback('Erreur réseau', true); }
}

function buildRoleRow(u) {
  const row = document.createElement('div'); row.className = 'admin-role-row';
  const email = document.createElement('span'); email.className = 'admin-role-email'; email.textContent = u.email;
  const role = document.createElement('span'); role.className = 'admin-role-badge admin-role-' + u.role; role.textContent = roleLabel(u.role);
  row.appendChild(email); row.appendChild(role);

  const canDelete = (TP_AUTH.role === 'admin') || (TP_AUTH.role === 'manager' && ['moderator', 'tech'].includes(u.role));
  if (canDelete) {
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'admin-btn admin-btn-small admin-btn-reject'; del.textContent = 'Retirer';
    del.addEventListener('click', () => removeRole(u, row));
    row.appendChild(del);
  }
  return row;
}

async function removeRole(u, rowEl) {
  try {
    const r = await fetch('/api/roles', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email })
    });
    if (!r.ok) { heroTagFeedback((await safeErr(r)) || 'Erreur', true); return; }
    heroTagFeedback('Rôle retiré', false);
    rowEl.remove();
  } catch { heroTagFeedback('Erreur réseau', true); }
}

async function buildLockSection() {
  const section = adminSection('Verrouillage des requêtes');

  let globalLocked = false;
  try {
    const r = await fetch('/api/lock', { headers: { 'Accept': 'application/json' } });
    if (r.ok) { const d = await r.json(); globalLocked = !!d.globalLock; }
  } catch {}

  const row = document.createElement('div'); row.className = 'admin-form-row';
  const label = document.createElement('span');
  label.textContent = globalLocked
    ? 'Verrouillage global ACTIF — seuls managers/admins peuvent taguer'
    : 'Verrouillage global inactif';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'admin-btn ' + (globalLocked ? 'admin-btn-reject' : 'admin-btn-approve');
  toggle.textContent = globalLocked ? 'Déverrouiller globalement' : 'Verrouiller globalement';
  toggle.addEventListener('click', () => toggleGlobalLock(!globalLocked));
  row.appendChild(label); row.appendChild(toggle);
  section.appendChild(row);

  if (currentState && currentState.ms && currentState.ms.tenantId) {
    const tId = currentState.ms.tenantId;
    const tRow = document.createElement('div'); tRow.className = 'admin-form-row';
    const tLabel = document.createElement('span');
    tLabel.textContent = 'Tenant affiché : ' + (currentState.domain || tId);
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button'; lockBtn.className = 'admin-btn admin-btn-small'; lockBtn.textContent = 'Verrouiller ce tenant';
    lockBtn.addEventListener('click', () => setTenantLock(tId, currentState.domain, true));
    const unlockBtn = document.createElement('button');
    unlockBtn.type = 'button'; unlockBtn.className = 'admin-btn admin-btn-small'; unlockBtn.textContent = 'Déverrouiller ce tenant';
    unlockBtn.addEventListener('click', () => setTenantLock(tId, currentState.domain, false));
    tRow.appendChild(tLabel); tRow.appendChild(lockBtn); tRow.appendChild(unlockBtn);
    section.appendChild(tRow);
  }
  return section;
}

async function toggleGlobalLock(lock) {
  try {
    const r = await fetch('/api/lock', {
      method: lock ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!r.ok) { heroTagFeedback((await safeErr(r)) || 'Erreur', true); return; }
    heroTagFeedback(lock ? 'Verrouillage global activé' : 'Verrouillage global retiré', false);
    loadAdminUsers();
    if (currentState && currentState.ms && currentState.ms.tenantId) {
      refreshHeroTags(currentState.ms.tenantId, currentState.domain);
    }
  } catch { heroTagFeedback('Erreur réseau', true); }
}

async function setTenantLock(tenantId, domain, lock) {
  try {
    const r = await fetch('/api/lock', {
      method: lock ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId })
    });
    if (!r.ok) { heroTagFeedback((await safeErr(r)) || 'Erreur', true); return; }
    heroTagFeedback(lock ? 'Tenant verrouillé' : 'Tenant déverrouillé', false);
    refreshHeroTags(tenantId, domain);
  } catch { heroTagFeedback('Erreur réseau', true); }
}

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
  // Rendre le prog-list visible si l'analyse précédente était terminée
  const progList = document.getElementById('progList');
  progList.style.display = 'flex';
  document.getElementById('step-' + key).style.display = 'flex';
  lockButtons();
  setStep('step-' + key, 'active');
  try {
    await fn();
    // Synchroniser lastReport avec les données fraîches de currentState
    if (lastReport) {
      const cs = currentState;
      const confidence = computeConfidence(cs.ms);
      lastReport = Object.assign({}, lastReport, {
        analysedAt: new Date().toISOString(),
        microsoft: cs.ms,
        google: cs.goog,
        dns: cs.dns,
        host: cs.host,
        otherServices: cs.others,
        tenantConfidence: confidence,
        health: cs.health ? {
          score: cs.health.score,
          dmarcIsQuarantine: cs.health.dmarcIsQuarantine,
          checks: cs.health.checks.map(c => ({ type: c.t, title: c.title, desc: c.desc })),
          dkim: { selector1: cs.health.hasSel1, selector2: cs.health.hasSel2, allResults: cs.health.dkimResults }
        } : lastReport.health,
      });
      // Historique : si le tenantId est (re)trouvé suite au retry, l'enregistrer
      if (cs.ms?.tenantId && cs.ms.tenantValid) addToHistory(cs.domain, cs.ms.tenantId);
    }
  } catch { setStep('step-' + key, 'timeout'); }
  finally { unlockButtons(); }
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

async function fetchJson(url, timeout=9000, headers=null) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeout);
  try { const r = await fetch(url, headers ? { signal: ctrl.signal, headers } : { signal: ctrl.signal }); clearTimeout(tid); if (!r.ok) return null; return await r.json(); }
  catch { clearTimeout(tid); return null; }
}
// Résolution DNS via Cloudflare DoH (gratuit, usage commercial autorisé). Format JSON identique à Google DoH.
//
// Sur un poste géré, le pare-feu coupe fréquemment QUIC/UDP 443 vers cloudflare-dns.com :
// l'appel direct meurt en ERR_QUIC_PROTOCOL_ERROR et toute l'analyse ressort vide alors que
// la recherche d'ID, elle, fonctionne. On bascule dans ce cas sur /api/dns, un relais de même
// origine qui refait la même requête côté serveur et renvoie le même JSON.
//
// La bascule ne s'arme que si le relais a effectivement répondu : un échec direct passager
// ne condamne pas la session au relais, et une app servie sans backend (/api/dns en 404)
// garde exactement le comportement d'avant.
let dohUseRelay = false;
async function dohResolve(name, type, timeout=9000) {
  const q = `name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  if (!dohUseRelay) {
    const direct = await fetchJson(`https://cloudflare-dns.com/dns-query?${q}`, timeout, { Accept: 'application/dns-json' });
    if (direct) return direct;
  }
  const relayed = await fetchJson(`/api/dns?${q}`, timeout);
  if (relayed && !dohUseRelay) {
    dohUseRelay = true;
    console.warn('Résolveur DoH direct injoignable — bascule sur le relais /api/dns pour cette session.');
  }
  return relayed;
}
async function dnsQuery(name, type) {
  const d = await dohResolve(name, type);
  return d ? (d.Answer || []) : [];
}
// Compte les lookups DNS d'un enregistrement SPF (include:/redirect=/a/mx/exists/ptr), récursivement.
// Microsoft : au-delà de 10, SPF renvoie permerror et échoue entièrement.
// learn.microsoft.com/defender-office-365/email-authentication-spf-configure
async function countSpfLookups(spf, seen = new Set(), depth = 0) {
  if (depth > 10) return 11;
  spf = spf.replace(/"\s*"/g, '').replace(/"/g, ''); // recoller les chunks d'un TXT multi-chaînes
  let count = 0;
  for (const tok of spf.trim().split(/\s+/)) {
    const t = tok.toLowerCase();
    if (t.startsWith('include:') || t.startsWith('redirect=')) {
      count++; if (count > 10) return count;
      const dom = t.split(/[:=]/)[1]?.replace(/\.$/, '');
      if (dom && !seen.has(dom)) {
        seen.add(dom);
        const txt = await dnsQuery(dom, 'TXT');
        const nested = txt.map(a => a.data).find(d => d.includes('v=spf1'));
        if (nested) count += await countSpfLookups(nested, seen, depth + 1);
      }
    } else if (t.startsWith('exists:') || /^a([:/]|$)/.test(t) || /^mx([:/]|$)/.test(t) || t === 'ptr' || t.startsWith('ptr:')) {
      count++;
    }
  }
  return count;
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
   de la suppression. */
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

function showStoragePanel() {
  document.getElementById('mainDropdown').classList.remove('open');
  const body = document.getElementById('storageInspectorBody');
  body.replaceChildren();

  /* Clés du shell (TenantPulse + profil Mhaelle). */
  const keys = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) keys.push(k); } } catch {}
  keys.sort().forEach(key => {
    let raw = ''; try { raw = localStorage.getItem(key) || ''; } catch {}
    body.appendChild(buildStorageEntry(key, raw, entry => {
      try { localStorage.removeItem(key); } catch {}
      entry.remove();
      syncCacheIndicator(); syncHistoryToggleUI();
      updateStorageSummary(); refreshStorageEmptyState();
    }));
  });

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

const GUID_ONLY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Recherche directe par Tenant ID (GUID) : interroge l'endpoint OIDC du tenant lui-même
 * (même endpoint que checkMicrosoft, mais adressé par ID au lieu du domaine).
 */
async function checkMicrosoftById(tenantId) {
  const direct = await fetchJsonC(`https://login.microsoftonline.com/${tenantId}/.well-known/openid-configuration`, 'ms', 8000);
  if (!direct || !direct.issuer?.includes(tenantId) || MS_GENERIC_GUIDS.has(tenantId.toLowerCase())) return null;
  return { tenantId, tenantValid: true, namespaceType: null, federationType: null, cloudInstance: 'microsoftonline.com', issuer: direct.issuer, tokenEndpoint: direct.token_endpoint, authorizationEndpoint: direct.authorization_endpoint, userInfoEndpoint: direct.userinfo_endpoint };
}

/*
 * Retrouve le domaine associé à un Tenant ID à partir des données déjà connues de l'outil —
 * Microsoft n'expose aucune API publique anonyme faisant l'inverse (GUID → domaine) : la liste
 * des domaines vérifiés d'un tenant n'est accessible que via un token authentifié (Graph API).
 * On cherche donc : 1) l'historique local de l'utilisateur, 2) l'annuaire partagé (tags approuvés).
 */
async function resolveKnownDomainForTenantId(tenantId) {
  const t = tenantId.toLowerCase();
  const local = loadHistory().find(i => i.tenantId?.toLowerCase() === t);
  if (local?.domain) return local.domain;
  try {
    const r = await fetch('/api/classification?all=1', { headers: { Accept: 'application/json' } });
    if (r.ok) {
      const d = await r.json();
      const items = Array.isArray(d.items) ? d.items : [];
      const match = items.find(it => it.tenantId?.toLowerCase() === t && it.domain);
      if (match) return match.domain;
    }
  } catch {}
  return null;
}

async function checkGoogle(domain) {
  try {
    const [oidc, mx] = await Promise.all([fetchJson('https://accounts.google.com/.well-known/openid-configuration'), dohResolve(domain, 'MX')]);
    if (!oidc || !mx) return null;
    const ans = mx.Answer || [];
    if (!ans.some(a => a.data?.toLowerCase().includes('google'))) return null;
    return { issuer: oidc.issuer, authorizationEndpoint: oidc.authorization_endpoint, tokenEndpoint: oidc.token_endpoint, userInfoEndpoint: oidc.userinfo_endpoint, mxRecords: ans.map(a => a.data).filter(Boolean) };
  } catch { return null; }
}

async function checkDNS(domain) {
  const r = { mx: [], spf: null, txt: [], detectedProviders: [] };
  const mx  = await dohResolve(domain, 'MX');  if (mx)  r.mx  = (mx.Answer  || []).map(a => a.data).filter(Boolean);
  const txt = await dohResolve(domain, 'TXT'); if (txt) { const all = (txt.Answer || []).map(a => a.data).filter(Boolean); r.spf = all.find(t => t.includes('v=spf1')) || null; r.txt = all; }
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
  const checks = []; let score = 0; let bonus = 0;
  // Score de base (max 100) = essentiels d'authentification e-mail : MX + SPF + DKIM + DMARC.
  // MTA-STS / DNSSEC / BIMI = bonus de durcissement, comptés au-dessus de 100.
  const mxA = await dnsQuery(domain, 'MX');
  if (mxA.length > 0) { score += 10; checks.push({ t:'ok',    icon:'assets/checked.png', title:'MX Records présents', desc: mxA.map(a => a.data).join(' | ') }); }
  else                              checks.push({ t:'error', icon:'assets/warning.png', title:'MX Records manquants',  desc: 'Aucun enregistrement MX.' });

  // SPF — bonnes pratiques Microsoft : include spf.protection.outlook.com (M365), -all, ≤ 10 lookups DNS.
  const txtA = await dnsQuery(domain, 'TXT'), allTxt = txtA.map(a => a.data).filter(Boolean), spf = allTxt.find(t => t.includes('v=spf1'));
  if (spf) {
    const isM365Mail = mxA.some(a => /\.protection\.outlook\.com/i.test(a.data || ''));
    const m365Include = /include:\s*spf\.protection\.(outlook\.com|office365\.us|partner\.outlook\.cn)/i.test(spf);
    const hardFail = /-all\b/.test(spf), softFail = /~all\b/.test(spf);
    const lookups = await countSpfLookups(spf);
    if (lookups > 10) {
      score += 5;
      checks.push({ t:'error', icon:'assets/warning.png', title:`SPF dépasse 10 lookups DNS (${lookups})`, desc: spf + ' — Microsoft : >10 lookups = permerror, le SPF échoue. Réduire les include: (sous-domaines dédiés ou ip4).' });
    } else if (isM365Mail && !m365Include) {
      score += 12;
      checks.push({ t:'warn', icon:'assets/warning.png', title:'SPF sans include Microsoft 365', desc: spf + ' — manque include:spf.protection.outlook.com : le mail sortant via M365 ne passe pas SPF.' });
    } else if (hardFail) {
      score += 25;
      checks.push({ t:'ok', icon:'assets/checked.png', title:'SPF strict (-all)', desc: spf + (m365Include ? ' — include M365 OK.' : '') + (lookups >= 8 ? ` (${lookups}/10 lookups)` : '') });
    } else if (softFail) {
      score += 15;
      checks.push({ t:'warn', icon:'assets/warning.png', title:'SPF softfail (~all)', desc: spf + ' — Microsoft recommande -all : DMARC ignore l\'échec SPF ~all si le message n\'a pas de DKIM.' });
    } else {
      score += 8;
      checks.push({ t:'warn', icon:'assets/warning.png', title:'SPF permissif (ni -all ni ~all)', desc: spf + ' — terminer par -all (recommandation Microsoft).' });
    }
  }
  else checks.push({ t:'error', icon:'assets/warning.png', title:'SPF manquant', desc:'Risque de spoofing.' });

  const dmarcA = await dnsQuery(`_dmarc.${domain}`, 'TXT'), dmarc = dmarcA.map(a => a.data).find(d => d.includes('v=DMARC1'));
  let dmarcIsQuarantine = false;
  if (dmarc) {
    const p = (dmarc.match(/p=([^;]+)/i) || [])[1]?.trim().toLowerCase();
    const ruaNote = /rua=/i.test(dmarc) ? '' : ' — sans rua= : ajoutez une adresse de rapport agrégé (recommandé par Microsoft).';
    // Microsoft considère p=reject ET p=quarantine comme des politiques d'application valides → score plein pour les deux.
    if (p === 'reject')          { score += 35; checks.push({ t:'ok',   icon:'assets/checked.png', title:'DMARC p=reject', desc: dmarc + ruaNote }); }
    else if (p === 'quarantine') { score += 35; dmarcIsQuarantine = true; checks.push({ t:'ok',   icon:'assets/checked.png', title:'DMARC p=quarantine', desc: dmarc + ' — application active (équivalent reject pour le score, conformément à Microsoft).' + ruaNote }); }
    else                         { score += 12; checks.push({ t:'warn', icon:'assets/warning.png', title:'DMARC p=none (surveillance seule)', desc: dmarc + ' — aucune application : Microsoft recommande de progresser vers quarantine ou reject.' + ruaNote }); }
  } else checks.push({ t:'error', icon:'assets/warning.png', title:'DMARC manquant', desc: `Aucun _dmarc.${domain} — configurez SPF, DKIM puis DMARC (ordre Microsoft).` });

  const dkimSelectors = ['selector1','selector2','default','google','microsoft','k1','mail','dkim','smtp','email','mailjet','sendgrid','mandrill','amazonses','postmark','sparkpost','mxroute','zoho','protonmail','brevo','s1','s2','sig1'];
  const dkimResults   = {};
  for (const s of dkimSelectors) {
    const a = await dnsQuery(`${s}._domainkey.${domain}`, 'TXT');
    dkimResults[s] = a.map(x => x.data).find(d => d.includes('v=DKIM1') || d.includes('p=')) || null;
  }
  const foundSelectors = Object.entries(dkimResults).filter(([, v]) => v !== null);
  const hasSel1 = dkimResults['selector1'] !== null, hasSel2 = dkimResults['selector2'] !== null;
  const selNames = foundSelectors.map(([k]) => k).join(', ');
  if (hasSel1 && hasSel2) {
    score += 30;
    checks.push({ t:'ok', icon:'assets/checked.png', title:'DKIM M365 (selector1 + selector2)', desc: `Rotation Microsoft 365 active — sélecteurs : ${selNames}.`, dkimResults, hasSel1, hasSel2 });
  } else if (hasSel1 || hasSel2) {
    score += 22;
    checks.push({ t:'warn', icon:'assets/warning.png', title:'DKIM M365 partiel', desc: (hasSel1 ? 'selector1 actif, selector2 absent' : 'selector2 actif, selector1 absent') + ' — rotation M365 incomplète.', dkimResults, hasSel1, hasSel2 });
  } else if (foundSelectors.length > 0) {
    score += 17;
    checks.push({ t:'warn', icon:'assets/warning.png', title:'DKIM actif (hors M365)', desc: `Sélecteurs : ${selNames} — pas selector1/selector2 (rotation M365).`, dkimResults, hasSel1, hasSel2 });
  } else {
    checks.push({ t:'error', icon:'assets/warning.png', title:'DKIM non détecté', desc:'Aucun DKIM sur les sélecteurs testés.', dkimResults, hasSel1:false, hasSel2:false });
  }

  // Nom de tenant SharePoint : le CNAME DKIM selector1 pointe vers « ...<tenant>.onmicrosoft.com ».
  // Ex. selector1._domainkey.contoso.fr → selector1-contoso-fr._domainkey.contoso75.onmicrosoft.com → spTenant = contoso75.
  let spTenant = null;
  try {
    const sel1Cn = await dnsQuery(`selector1._domainkey.${domain}`, 'CNAME');
    for (const a of sel1Cn) {
      const m = (a.data || '').match(/([a-z0-9][a-z0-9-]*)\.onmicrosoft\.com/i);
      if (m) { spTenant = m[1].toLowerCase(); break; }
    }
  } catch { /* CNAME absent ou DKIM non Microsoft : SharePoint direct restera indisponible */ }

  // www : web, hors score hygiène e-mail → affiché en info seulement.
  const cnA = await dnsQuery(`www.${domain}`, 'CNAME'), aA = await dnsQuery(`www.${domain}`, 'A');
  if      (cnA.length > 0) checks.push({ t:'info', icon:'assets/information.png', title:'www (CNAME)',    desc: cnA.map(a => a.data).join(', ') + ' — web, hors score.' });
  else if (aA.length  > 0) checks.push({ t:'info', icon:'assets/information.png', title:'www (A record)', desc: aA.map(a => a.data).join(', ') + ' — web, hors score.' });
  else                     checks.push({ t:'info', icon:'assets/information.png', title:'www non résolu', desc: `Aucun CNAME ni A pour www.${domain} (web, hors score).` });

  // ── Bonus de durcissement (au-dessus de 100, hors score de base) ──
  const dsA = await dnsQuery(domain, 'DS'), dkA = await dnsQuery(domain, 'DNSKEY');
  if (dsA.length > 0 || dkA.length > 0) { bonus += 4; checks.push({ t:'ok',   icon:'assets/checked.png', title:'DNSSEC activé (bonus +4)', desc: `${dsA.length} DS, ${dkA.length} DNSKEY.` }); }
  else                                               checks.push({ t:'info', icon:'assets/information.png', title:'DNSSEC non activé', desc: 'Bonus optionnel — peu répandu sur les domaines M365.' });

  const mtaSts = await dnsQuery(`_mta-sts.${domain}`, 'TXT'), mtaRec = mtaSts.map(a => a.data).find(d => d.includes('v=STSv1'));
  if (mtaRec) { bonus += 6; checks.push({ t:'ok',   icon:'assets/checked.png', title:'MTA-STS activé (bonus +6)', desc: mtaRec }); }
  else                  checks.push({ t:'info', icon:'assets/information.png', title:'MTA-STS non configuré',  desc: 'Bonus optionnel — chiffrement TLS forcé en réception.' });

  const bimiA = await dnsQuery(`default._bimi.${domain}`, 'TXT'), bimiRec = bimiA.map(a => a.data).find(d => d.includes('v=BIMI1'));
  if (bimiRec) { bonus += 3; checks.push({ t:'ok',   icon:'assets/checked.png', title:'BIMI configuré (bonus +3)', desc: bimiRec }); }
  else                  checks.push({ t:'info', icon:'assets/information.png', title:'BIMI absent',              desc: 'Bonus optionnel — nécessite DMARC p=quarantine ou reject.' });

  // ── Prêt pour M365 : enregistrements de service mappés sur les tickets RUN ──
  // N'impacte pas le score (calibré pour l'hygiène mail) : purement diagnostic.
  const m365 = [];
  const first = arr => arr.map(a => a.data).find(Boolean) || null;

  // Autodiscover → connexion / configuration Outlook
  const adTgt = first(await dnsQuery(`autodiscover.${domain}`, 'CNAME'));
  if (adTgt && /autodiscover\.outlook\.com/i.test(adTgt))
    m365.push({ t:'ok',   icon:'assets/checked.png',     title:'Autodiscover M365',         desc:`autodiscover.${domain} → ${adTgt}` });
  else if (adTgt)
    m365.push({ t:'warn', icon:'assets/warning.png',     title:'Autodiscover non Microsoft', desc:`Pointe vers ${adTgt} (attendu : autodiscover.outlook.com). La config Outlook peut échouer.` });
  else
    m365.push({ t:'info', icon:'assets/information.png', title:'Autodiscover absent',         desc:`Aucun CNAME autodiscover.${domain}. La connexion Outlook peut nécessiter une configuration manuelle.` });

  // Enrôlement Intune / MDM (auto-enroll Windows + mobile, Hybrid AAD join)
  const erTgt = first(await dnsQuery(`enterpriseregistration.${domain}`, 'CNAME'));
  const eeTgt = first(await dnsQuery(`enterpriseenrollment.${domain}`, 'CNAME'));
  const erOk = erTgt && /enterpriseregistration\.windows\.net/i.test(erTgt);
  const eeOk = eeTgt && /enterpriseenrollment\.manage\.microsoft\.com/i.test(eeTgt);
  if (erOk && eeOk)
    m365.push({ t:'ok',   icon:'assets/checked.png',     title:'Enrôlement Intune/MDM',      desc:'enterpriseregistration + enterpriseenrollment correctement configurés.' });
  else if (erTgt || eeTgt)
    m365.push({ t:'warn', icon:'assets/warning.png',     title:'Enrôlement Intune incomplet', desc:`registration: ${erTgt || 'absent'} | enrollment: ${eeTgt || 'absent'} — l'enrôlement automatique d'appareils peut échouer.` });
  else
    m365.push({ t:'info', icon:'assets/information.png', title:'Enrôlement Intune non configuré', desc:'Aucun CNAME enterpriseregistration/enterpriseenrollment. Requis pour l\'enrôlement automatique (MDM/Hybrid AAD join).' });

  // Teams / Skype Entreprise (records hérités SfB — optionnels en Teams-only)
  const lync = first(await dnsQuery(`lyncdiscover.${domain}`, 'CNAME'));
  const sipFed = first(await dnsQuery(`_sipfederationtls._tcp.${domain}`, 'SRV'));
  if (lync || sipFed)
    m365.push({ t:'ok',   icon:'assets/checked.png',     title:'Teams / Skype (DNS hérité)',  desc:`${lync ? 'lyncdiscover → ' + lync : ''}${lync && sipFed ? ' | ' : ''}${sipFed ? 'fédération SRV → ' + sipFed : ''}` });
  else
    m365.push({ t:'info', icon:'assets/information.png', title:'Teams : pas de DNS Skype',    desc:'Aucun lyncdiscover/SRV SfB. Normal pour un tenant Teams-only ; requis seulement si Skype Entreprise / fédération DNS est utilisé.' });

  return { score: Math.min(score, 100), bonus, checks, m365, dkimResults, hasSel1, hasSel2, dmarcIsQuarantine, spTenant };
}

async function checkOtherTenants(domain, dns) {
  const t  = [], ms = (dns.mx || []).join(' ').toLowerCase(), ss = (dns.spf || '').toLowerCase(), ts = (dns.txt || []).join(' ').toLowerCase();

  // Google Workspace n'est plus listé ici : sa détection a sa propre carte dédiée (si réellement Google).
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

function buildScoreRing(score, bonus) {
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
  if (bonus > 0) { const sup = document.createElement('span'); sup.style.cssText = 'font-size:9px;font-weight:700;color:#16a34a'; sup.textContent = ' +' + bonus; lbl_el.appendChild(sup); }
  ring.appendChild(svg); ring.appendChild(lbl_el);

  const info = document.createElement('div'); info.className = 'score-info';
  const title = document.createElement('div'); title.className = 'score-title'; title.style.color = lblClr; title.textContent = 'Sécurité : ' + lbl;
  const desc  = document.createElement('div'); desc.className  = 'score-desc';  desc.textContent  = 'MX · SPF · DMARC · DKIM · DNSSEC · MTA-STS · BIMI';
  info.appendChild(title); info.appendChild(desc);
  if (bonus > 0) { const b2 = document.createElement('div'); b2.style.cssText = 'font-size:9.5px;font-weight:600;color:#15803d;margin-top:3px'; b2.textContent = `+${bonus} bonus durcissement (MTA-STS · DNSSEC · BIMI au-delà de 100)`; info.appendChild(b2); }

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
  const mkDomain = () => { const d = document.createElement('div'); d.className = 'hero-domain'; d.textContent = domain || 'Domaine non résolu'; return d; };

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
      const infoBtn = document.createElement('button'); infoBtn.className = 'conf-info-btn'; infoBtn.appendChild(makeInfoIcon('white')); infoBtn.setAttribute('aria-label', 'Détail de l\'indice de confiance');
      infoBtn.addEventListener('mousedown', (e) => { e.preventDefault(); showConfTooltip(e, confidence, ms); });
      badge.appendChild(infoBtn);
      const adminBtn = document.createElement('button'); adminBtn.type = 'button';
      const setAdminBtnState = (active) => {
        adminBtn.classList.toggle('is-admin', active);
        adminBtn.setAttribute('aria-pressed', String(active));
        adminBtn.title = active ? 'Compte admin créé sur ce tenant — cliquer pour retirer' : 'Marquer : compte admin créé sur ce tenant';
      };
      adminBtn.className = 'hero-admin-toggle';
      const adminIco = document.createElement('img'); adminIco.src = 'assets/user.png'; adminIco.className = 'hero-admin-toggle-ico'; adminIco.alt = '';
      adminBtn.appendChild(adminIco);
      setAdminBtnState(hasAdminAccount(ms.tenantId));
      adminBtn.addEventListener('click', () => {
        const next = !hasAdminAccount(ms.tenantId);
        setAdminAccount(ms.tenantId, next);
        setAdminBtnState(next);
        renderHistory();
      });
      guid.appendChild(sp); guid.appendChild(copyBtn); guid.appendChild(adminBtn); guid.appendChild(badge);
      hero.appendChild(guid);
    } else {
      const none = document.createElement('div'); none.className = 'hero-none'; none.textContent = 'GUID non résolu — domaine Microsoft détecté';
      hero.appendChild(none);
    }
    hero.appendChild(mkDomain());
    if (ms.tenantId && ms.tenantValid) {
      // Zone de tags (badges + bouton +) — alimentée par refreshHeroTags (étape 13)
      const tagZone = buildHeroTagZone(ms.tenantId, domain);
      if (tagZone) {
        hero.appendChild(tagZone);
        // On passe la zone directement : le hero n'est pas encore dans le document
        if (typeof refreshHeroTags === 'function') refreshHeroTags(ms.tenantId, domain, tagZone);
      }
      const profile = loadProfile();
      const enabled = orderedRedirectButtons(profile).filter(b => profile[b.key] !== false);
      if (enabled.length > 0) {
        const actions = document.createElement('div'); actions.className = 'hero-actions';
        enabled.forEach(btn => {
          let safeHref = safeRedirectHref(btn.href, ms.tenantId, domain);
          let spDisabled = false; // SharePoint : bouton principal grisé si le lien direct n'est pas disponible
          if (btn.key === 'sharepoint') {
            // Lien direct fiable en GDAP, construit à partir du nom de tenant déduit du DKIM (analyse complète).
            const spT = currentState.health?.spTenant;
            const direct = spT ? resolveShortcutUrl('https://{spTenant}-admin.sharepoint.com/_layouts/15/online/AdminHome.aspx', { spTenant: spT }) : null;
            if (direct) safeHref = direct;
            else spDisabled = true; // pas de nom (pas de DKIM / analyse rapide) → grisé ; accès M365 via le menu ▾
          }
          if (!safeHref) return; // cible non fiable → bouton non rendu
          const a = document.createElement('a');
          a.className = 'hero-partner-btn' + (btn.key === 'partnerCenter' ? ' recommended' : '') + (spDisabled ? ' disabled' : '');
          if (spDisabled) {
            a.setAttribute('aria-disabled', 'true');
            a.title = "Lien direct SharePoint indisponible (nom de tenant non détecté). Lancez l'analyse complète, ou ouvrez SharePoint via la tuile M365 Admin.";
            a.addEventListener('click', e => {
              e.preventDefault(); e.stopPropagation();
              const chev = a.closest('.hero-btn-cell')?.querySelector('.hero-btn-chevron');
              if (chev) openShortcutMenu(btn, chev, { tenantId: ms.tenantId, domain, spTenant: currentState.health?.spTenant || null });
            });
          } else {
            a.href = safeHref;
            a.target = '_blank'; a.rel = 'noopener noreferrer';
          }
          const icon = document.createElement('img'); icon.src = btn.icon; icon.alt = btn.label; icon.className = 'hero-partner-btn-icon' + (btn.key === 'partnerCenter' ? ' hero-icon-invert' : '');
          const text = document.createElement('div'); text.className = 'hero-partner-btn-text';
          const label = document.createElement('span'); label.className = 'hero-partner-btn-label'; label.textContent = btn.label;
          const sub = document.createElement('span'); sub.className = 'hero-partner-btn-sub'; sub.textContent = btn.sub;
          text.appendChild(label); text.appendChild(sub);
          a.appendChild(icon); a.appendChild(text);
          if (btn.key === 'partnerCenter') {
            const ribbon = document.createElement('span'); ribbon.className = 'hero-partner-btn-ribbon';
            const rLabel = document.createElement('span'); rLabel.className = 'hero-partner-btn-ribbon-label'; rLabel.textContent = 'Recommandé';
            const rInfo = document.createElement('span'); rInfo.className = 'hero-partner-btn-ribbon-info'; rInfo.appendChild(makeInfoIcon('white'));
            rInfo.title = "Le Partner Center permet de s'assurer que le tenant est bien présent dans votre base de données clients.";
            rInfo.setAttribute('aria-label', 'Information');
            rInfo.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
            ribbon.appendChild(rLabel); ribbon.appendChild(rInfo);
            a.appendChild(ribbon);
          }
          if (btn.key === 'sharepoint') {
            // Bouton principal = lien direct SharePoint (fiable en GDAP), actif seulement si le nom de tenant
            // est détecté (DKIM + analyse complète). Sinon grisé ; SharePoint reste joignable via la tuile M365 Admin.
            const info = document.createElement('span'); info.className = 'hero-partner-btn-info'; info.appendChild(makeInfoIcon('white'));
            info.title = "Le bouton ouvre l'admin SharePoint en direct quand le nom de tenant est détecté (via DKIM, analyse complète). Sinon il est désactivé — ouvrez SharePoint via la tuile M365 Admin.";
            info.setAttribute('aria-label', 'Information sur le lien SharePoint');
            info.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
            a.appendChild(info);
          }
          // Tuile + chevron de sous-menu si le centre expose des raccourcis
          const cell = document.createElement('div');
          cell.className = 'hero-btn-cell';
          cell.appendChild(a);
          if ((ADMIN_SHORTCUTS[btn.key] || []).length) {
            const chev = document.createElement('button');
            chev.type = 'button';
            chev.className = 'hero-btn-chevron';
            chev.textContent = '▾';
            chev.setAttribute('aria-haspopup', 'true');
            chev.setAttribute('aria-label', 'Raccourcis ' + btn.label);
            chev.addEventListener('click', e => {
              e.preventDefault(); e.stopPropagation();
              openShortcutMenu(btn, chev, { tenantId: ms.tenantId, domain, spTenant: currentState.health?.spTenant || null });
            });
            cell.appendChild(chev);
          }
          actions.appendChild(cell);
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
  lines.push('HYGIENE E-MAIL & DNS (M365):');
  lines.push('');
  if (r.health) {
    lines.push('Score : ' + r.health.score + '/100' + (r.health.bonus > 0 ? '  (+' + r.health.bonus + ' durcissement)' : ''));
    lines.push('Bareme : auth e-mail (MX/SPF/DKIM/DMARC) = base 100 ; MTA-STS/DNSSEC/BIMI = bonus.');
    lines.push('');
    const tagOf = (type) => type === 'ok' ? 'OK' : type === 'warn' ? 'A CORRIGER' : type === 'error' ? 'CRITIQUE' : 'info';
    r.health.checks.forEach(c => lines.push('[' + tagOf(c.type) + '] ' + c.title));
    if (r.health.m365 && r.health.m365.length) {
      lines.push('');
      lines.push('Pret pour M365 (services):');
      r.health.m365.forEach(c => lines.push('  [' + tagOf(c.type) + '] ' + c.title));
    }
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
      { match: t => t.includes('SPF softfail'),                          msg: 'SPF softfail (~all) : -all recommande (Microsoft)' },
      { match: t => t.includes('SPF sans include Microsoft 365'),        msg: 'SPF sans include M365 : le mail sortant via M365 ne passe pas SPF' },
      { match: t => t.includes('SPF d') && t.includes('passe 10 lookups'), msg: 'SPF >10 lookups DNS : permerror, le SPF echoue (Microsoft)' },
      { match: t => t.includes('DMARC manquant'),                        msg: 'No DMARC: phishing risk' },
      { match: t => t.includes('DMARC p=none'),                          msg: 'DMARC p=none: no enforcement' },
      { match: t => t.includes('DKIM non d\u00e9tect\u00e9'),            msg: 'No DKIM: weak email authentication' },
      { match: t => t.includes('DKIM M365 partiel'),                     msg: 'Rotation DKIM incomplete : publier le CNAME selector2' },
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
  lines.push('TenantPulse \u2014 Internal RUN MW Platform \u2014 v1.5');

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
  const renderChecks = (list) => {
    const hcl = document.createElement('div'); hcl.className = 'hc-list';
    list.forEach(c => {
      const it = document.createElement('div'); it.className = 'hc-item ' + c.t;
      const ico = document.createElement('div'); ico.className = 'hc-icon'; const icoImg = document.createElement('img'); icoImg.src = c.icon; icoImg.className = 'icon-adaptive'; icoImg.alt = ''; ico.appendChild(icoImg);
      const body = document.createElement('div'); body.className = 'hc-body';
      const ttl = document.createElement('div'); ttl.className = 'hc-title'; ttl.textContent = c.title;
      const dsc = document.createElement('div'); dsc.className = 'hc-desc';  dsc.textContent = c.desc;
      body.appendChild(ttl); body.appendChild(dsc); it.appendChild(ico); it.appendChild(body);
      hcl.appendChild(it);
    });
    return hcl;
  };
  return b => {
    b.appendChild(buildScoreRing(health.score, health.bonus));
    // Prêt pour M365 en premier : ce sont les checks les plus utiles pour résoudre un ticket.
    if (health.m365?.length) {
      const sub = document.createElement('div'); sub.className = 'hc-subhead hc-subhead-top'; sub.textContent = 'M365';
      b.appendChild(sub);
      b.appendChild(renderChecks(health.m365));
    }
    const sub2 = document.createElement('div'); sub2.className = 'hc-subhead'; sub2.textContent = 'Hygiène e-mail & DNS';
    b.appendChild(sub2);
    b.appendChild(renderChecks(health.checks));
    buildDkimBlock(b, health.dkimResults, health.hasSel1, health.hasSel2);
    const lnk = document.createElement('a'); lnk.className = 'ext-link'; lnk.href = `https://dnschecker.org/all-dns-records-of-domain.php?query=${encodeURIComponent(domain)}&rtype=ALL&dns=google`; lnk.target = '_blank'; lnk.rel = 'noopener';
    const lnkIcon = document.createTextNode('→ Analyse DNS complète sur DNSChecker — '); const lnkStrong = document.createElement('strong'); lnkStrong.textContent = domain;
    lnk.appendChild(lnkIcon); lnk.appendChild(lnkStrong); b.appendChild(lnk);
  };
}

function msRows(ms) {
  return [ms.namespaceType && ['Namespace Type', ms.namespaceType], ms.federationType && ['Fédération', ms.federationType], ms.cloudInstance && ['Cloud Instance', ms.cloudInstance], ms.issuer && ['Issuer', ms.issuer], ms.tokenEndpoint && ['Token Endpoint', ms.tokenEndpoint], ms.authorizationEndpoint && ['Authorization Endpoint', ms.authorizationEndpoint], ms.userInfoEndpoint && ['UserInfo Endpoint', ms.userInfoEndpoint]].filter(Boolean);
}
function healthScoreLbl(health) {
  return `${health.score}%${health.bonus > 0 ? ' +' + health.bonus : ''}`;
}
function healthSubLbl(health) {
  const errC = health.checks.filter(c => c.t === 'error').length, warnC = health.checks.filter(c => c.t === 'warn').length;
  const dkim = health.hasSel1 && health.hasSel2 ? ' · DKIM ✓✓' : health.hasSel1 || health.hasSel2 ? ' · DKIM ✓!' : ' · DKIM ✗';
  return `SPF · DMARC · DKIM · DNSSEC · MTA-STS${errC > 0 ? ' — ' + errC + ' erreur(s)' : ''}${warnC > 0 ? ', ' + warnC + ' avert.' : ''}${dkim}`;
}

// Ordre canonique des blocs de résultat : on met d'abord les infos utiles à la résolution
// d'un ticket (tenant, M365/Santé), et l'hébergeur/registrar en dernier. Re-append = déplacement
// en fin de conteneur, donc l'ordre final suit ce tableau, quel que soit l'ordre d'insertion.
function reorderResults(center) {
  ['.tenant-hero', '#card-ms', '#card-google', '#card-health', '#card-dns', '.pills-block', '#card-host', '#btnTriggerFull']
    .forEach(sel => { const el = center.querySelector(sel); if (el) center.appendChild(el); });
}

// ── FAST check (recherche directe par Tenant ID) ──
// Pour l'instant le hero n'affiche que le domaine de base résolu : pas de DNS/santé/hébergeur
// (ces données nécessitent une recherche par domaine, ajoutée séparément ensuite).
async function checkFastById(tenantId) {
  const center = document.getElementById('centerCol'), exportBtn = document.getElementById('exportBtn'), errBox = document.getElementById('errBox');
  errBox.style.display = 'none'; center.replaceChildren(); closePanel();
  exportBtn.classList.remove('visible'); lastReport = null;
  currentState = { domain: null, ms: null, dns: null, goog: null, health: null, others: null, host: null, fullDone: false };
  lockButtons(); setFastLoading(true);
  showSteps(['ms']);
  stepRetryFns.ms = () => checkFastById(tenantId);
  try {
    setStep('step-ms', 'active', 'Validation du Tenant ID…');
    const ms = await checkMicrosoftById(tenantId);
    if (!ms) {
      setStep('step-ms', 'fail', 'Tenant ID — invalide');
      document.getElementById('progList').style.display = 'none';
      center.appendChild(renderHero({ tenantId, tenantValid: false }, '', 0));
      return;
    }
    setStep('step-ms', 'active', 'Recherche du domaine connu…');
    const domain = await resolveKnownDomainForTenantId(tenantId);
    document.getElementById('progList').style.display = 'none';
    if (!domain) showError("Tenant ID validé, mais domaine inconnu : ce tenant n'a jamais été recherché par domaine (historique local ou annuaire partagé).");
    currentState.ms = ms; currentState.domain = domain || null;
    const confidence = computeConfidence(ms);
    if (domain) addToHistory(domain, ms.tenantId);
    center.appendChild(renderHero(ms, domain, confidence));
    lastReport = { domain: domain || null, analysedAt: new Date().toISOString(), input: tenantId, microsoft: ms, google: null, dns: null, health: null, otherServices: null, host: null, tenantConfidence: confidence, fullDone: false };
    exportBtn.classList.add('visible');
  } catch (err) {
    document.getElementById('progList').style.display = 'none';
    showError('Erreur : ' + err.message);
  } finally { unlockButtons(); setFastLoading(false); }
}

async function checkFast() {
  const raw = emailInput.value.trim(); if (!raw) { showError('Veuillez entrer une adresse e-mail ou un domaine.'); return; }
  if (GUID_ONLY_RE.test(raw)) { await checkFastById(raw); return; }
  const domain = extractDomain(raw); if (!domain || !domain.includes('.')) { showError('Domaine invalide.'); return; }
  const center = document.getElementById('centerCol'), exportBtn = document.getElementById('exportBtn'), errBox = document.getElementById('errBox');
  errBox.style.display = 'none'; center.replaceChildren(); closePanel();
  exportBtn.classList.remove('visible'); lastReport = null;
  currentState = { domain, ms:null, dns:null, goog:null, health:null, others:null, host:null, fullDone:false };
  lockButtons(); setFastLoading(true);
  showSteps(['ms', 'dns']);
  try {
    setStep('step-ms', 'active');
    stepRetryFns.ms = async () => { setStep('step-ms', 'active'); currentState.ms = isMsaPersonalDomain(domain) ? null : await checkMicrosoft(domain); setStep('step-ms', currentState.ms ? 'done' : 'fail'); };
    currentState.ms = isMsaPersonalDomain(domain) ? null : await checkMicrosoft(domain);
    if (!document.getElementById('step-ms').className.includes('timeout')) setStep('step-ms', currentState.ms ? 'done' : 'fail');

    // Détection Google Workspace silencieuse (pas d'étape visible) : outil orienté M365.
    // La carte « Google Workspace » s'affiche uniquement si le domaine est réellement Google.
    currentState.goog = await checkGoogle(domain);

    setStep('step-dns', 'active');
    stepRetryFns.dns = async () => { setStep('step-dns', 'active'); currentState.dns = await checkDNS(domain); setStep('step-dns', currentState.dns?.mx?.length > 0 ? 'done' : 'fail'); };
    currentState.dns = await checkDNS(domain);
    if (!document.getElementById('step-dns').className.includes('timeout')) setStep('step-dns', (currentState.dns?.mx?.length ?? 0) > 0 ? 'done' : 'fail');

    document.getElementById('progList').style.display = 'none';
    const confidence = computeConfidence(currentState.ms);
    lastReport = { domain, analysedAt: new Date().toISOString(), input: raw, microsoft: currentState.ms, google: currentState.goog, dns: currentState.dns, health: null, otherServices: null, host: null, tenantConfidence: confidence, fullDone: false };
    exportBtn.classList.add('visible'); // rapport (partiel) copiable dès l'analyse rapide
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
    // Construire le contenu initial et attacher le listener via le helper partagé
    resetCtaBtn(ctaBtn, raw, domain);
    center.appendChild(ctaBtn);
    reorderResults(center);
    if (loadProfile().analysisMode === 'auto') {
      // Priorité au hero : on le laisse s'afficher, puis l'analyse complète s'enchaîne en arrière-plan.
      setTimeout(() => runFullFromState(raw, domain, ctaBtn), 0);
    }
  } catch (err) { document.getElementById('progList').style.display = 'none'; showError('Erreur : ' + err.message); }
  finally { unlockButtons(); setFastLoading(false); }
}

// ── Helper : réinitialise le bouton CTA "Analyse complète" à son état initial ──
// Permet de ré-attacher le listener après une erreur (le { once:true } d'origine est consommé)
function resetCtaBtn(btn, raw, domain) {
  btn.replaceChildren();
  const lbl = document.createElement('span'); lbl.id = 'stfLabel';
  const img = document.createElement('img'); img.src = 'assets/Analyse.png'; img.width = 14; img.height = 14; img.alt = '';
  img.style.cssText = 'display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:4px;';
  lbl.appendChild(img); lbl.appendChild(document.createTextNode("Lancer l'analyse complète"));
  const spinner = document.createElement('span'); spinner.className = 'stf-spinner';
  const hint = document.createElement('span'); hint.style.cssText = 'font-size:10px;opacity:.65;margin-left:4px'; hint.textContent = 'WHOIS · sécurité DNS';
  btn.appendChild(lbl); btn.appendChild(spinner); btn.appendChild(hint);
  // Ré-attacher le listener (once:true garantit une seule invocation par cycle)
  btn.addEventListener('click', () => runFullFromState(raw, domain, btn), { once: true });
}

// ── Full from fast ──
async function runFullFromState(raw, domain, ctaBtn) {
  if (currentState.fullDone || currentState.fullRunning) return; // évite un double lancement (auto + clic CTA)
  currentState.fullRunning = true;
  ctaBtn.classList.add('running');
  // Mettre à jour uniquement le nœud texte du label (préserve l'icône img enfant)
  const stfLbl = document.getElementById('stfLabel');
  if (stfLbl) { const tn = [...stfLbl.childNodes].find(n => n.nodeType === Node.TEXT_NODE); if (tn) tn.textContent = 'Analyse en cours…'; }
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

    lastReport = { domain, analysedAt: new Date().toISOString(), input: raw, microsoft: currentState.ms, google: currentState.goog, dns: currentState.dns, health: { score: currentState.health.score, bonus: currentState.health.bonus, dmarcIsQuarantine: currentState.health.dmarcIsQuarantine, checks: currentState.health.checks.map(c => ({ type:c.t, title:c.title, desc:c.desc })), m365: (currentState.health.m365 || []).map(c => ({ type:c.t, title:c.title, desc:c.desc })), dkim: { selector1: currentState.health.hasSel1, selector2: currentState.health.hasSel2, allResults: currentState.health.dkimResults } }, otherServices: currentState.others, host: currentState.host, tenantConfidence: confidence, fullDone: true };
    exportBtn.classList.add('visible');

    const newPb = document.createElement('div'); newPb.className = 'pills-block';
    const pl = document.createElement('div'); pl.className = 'pills-label'; pl.textContent = 'Autres services détectés';
    const pr = document.createElement('div'); pr.className = 'pills-row collapsed';
    [...(currentState.others || [])].sort((a, b) => (b.on ? 1 : 0) - (a.on ? 1 : 0)).forEach(t => {
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
    reorderResults(center);
    ctaBtn.classList.remove('running'); ctaBtn.classList.add('done'); ctaBtn.replaceChildren(); const doneImg = document.createElement('img'); doneImg.src='assets/checked.png'; doneImg.className='icon-adaptive'; doneImg.alt=''; ctaBtn.appendChild(doneImg); ctaBtn.appendChild(document.createTextNode(' Analyse complète effectuée'));
  } catch (err) {
    ctaBtn.classList.remove('running');
    // Reconstruire le contenu du bouton et ré-attacher le listener (once:true est consommé)
    resetCtaBtn(ctaBtn, raw, domain);
    document.getElementById('progList').style.display = 'none';
    showError('Erreur analyse complète : ' + err.message);
  } finally { unlockButtons(); currentState.fullRunning = false; }
}

// ── Full from scratch ──
async function checkFull() {
  const raw = emailInput.value.trim(); if (!raw) { showError('Veuillez entrer une adresse e-mail ou un domaine.'); return; }
  if (GUID_ONLY_RE.test(raw)) { showError("L'analyse complète par Tenant ID n'est pas encore disponible — utilisez le bouton « Tenant ID » ou saisissez le domaine résolu."); return; }
  const domain = extractDomain(raw); if (!domain || !domain.includes('.')) { showError('Domaine invalide.'); return; }
  const center = document.getElementById('centerCol'), exportBtn = document.getElementById('exportBtn'), errBox = document.getElementById('errBox');
  errBox.style.display = 'none'; center.replaceChildren(); closePanel();
  exportBtn.classList.remove('visible'); lastReport = null;
  currentState = { domain, ms:null, dns:null, goog:null, health:null, others:null, host:null, fullDone:false };
  lockButtons(); setFullLoading(true);
  showSteps(['ms', 'dns', 'health', 'others', 'host']);
  ['ms', 'dns', 'health', 'others', 'host'].forEach(k => setStep('step-' + k, 'pending'));
  // Peupler stepRetryFns pour que le bouton "Relancer" fonctionne en mode full
  stepRetryFns.ms     = async () => { setStep('step-ms', 'active');     currentState.ms     = isMsaPersonalDomain(domain) ? null : await checkMicrosoft(domain); setStep('step-ms', currentState.ms ? 'done' : 'fail'); };
  stepRetryFns.dns    = async () => { setStep('step-dns', 'active');    currentState.dns    = await checkDNS(domain);                                            setStep('step-dns', currentState.dns?.mx?.length > 0 ? 'done' : 'fail'); };
  stepRetryFns.health = async () => { setStep('step-health', 'active'); currentState.health = await checkHealth(domain);                                         setStep('step-health', 'done'); };
  stepRetryFns.others = async () => { setStep('step-others', 'active'); currentState.others = await checkOtherTenants(domain, currentState.dns || {});          setStep('step-others', 'done'); };
  stepRetryFns.host   = async () => { setStep('step-host', 'active');   currentState.host   = await checkHost(domain);                                           setStep('step-host', currentState.host ? 'done' : 'fail'); };
  try {
    setStep('step-ms', 'active');     currentState.ms     = isMsaPersonalDomain(domain) ? null : await checkMicrosoft(domain); setStep('step-ms', currentState.ms ? 'done' : 'fail');
    currentState.goog   = await checkGoogle(domain); // détection silencieuse (pas d'étape visible)
    setStep('step-dns', 'active');    currentState.dns    = await checkDNS(domain);                                            setStep('step-dns', (currentState.dns?.mx?.length ?? 0) > 0 ? 'done' : 'fail');
    setStep('step-health', 'active'); currentState.health = await checkHealth(domain);                                         setStep('step-health', 'done');
    setStep('step-others', 'active'); currentState.others = await checkOtherTenants(domain, currentState.dns);                 setStep('step-others', 'done');
    setStep('step-host', 'active');   currentState.host   = await checkHost(domain);                                           setStep('step-host', currentState.host ? 'done' : 'fail');
    document.getElementById('progList').style.display = 'none';
    currentState.fullDone = true;
    const confidence = computeConfidence(currentState.ms);
    lastReport = { domain, analysedAt: new Date().toISOString(), input: raw, microsoft: currentState.ms, google: currentState.goog, dns: currentState.dns, health: { score: currentState.health.score, bonus: currentState.health.bonus, dmarcIsQuarantine: currentState.health.dmarcIsQuarantine, checks: currentState.health.checks.map(c => ({ type:c.t, title:c.title, desc:c.desc })), m365: (currentState.health.m365 || []).map(c => ({ type:c.t, title:c.title, desc:c.desc })), dkim: { selector1: currentState.health.hasSel1, selector2: currentState.health.hasSel2, allResults: currentState.health.dkimResults } }, otherServices: currentState.others, host: currentState.host, tenantConfidence: confidence, fullDone: true };
    exportBtn.classList.add('visible');
    if (currentState.ms?.tenantId && currentState.ms.tenantValid) addToHistory(domain, currentState.ms.tenantId);
    center.appendChild(renderHero(currentState.ms, domain, confidence));

    const pb = document.createElement('div'); pb.className = 'pills-block';
    const pl = document.createElement('div'); pl.className = 'pills-label'; pl.textContent = 'Autres services détectés';
    const pr = document.createElement('div'); pr.className = 'pills-row collapsed';
    [...currentState.others].sort((a, b) => (b.on ? 1 : 0) - (a.on ? 1 : 0)).forEach(t => {
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
    reorderResults(center);
  } catch (err) { document.getElementById('progList').style.display = 'none'; showError('Erreur : ' + err.message); }
  finally { unlockButtons(); setFullLoading(false); }
}
