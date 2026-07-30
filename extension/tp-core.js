/* ──────────────────────────────────────────────────────────────────────────────
   tp-core.js — configuration et helpers partagés avec l'application TenantPulse.

   ⚠ COPIE de ../tenantpulse.js. Le manifeste V3 interdit le code distant : il est
   impossible de charger tenantpulse.js depuis l'app à l'exécution, la config est
   donc dupliquée ici. TOUTE modification de REDIRECT_BUTTONS, ALLOWED_REDIRECT_HOSTS
   ou ADMIN_SHORTCUTS dans tenantpulse.js DOIT être répliquée dans ce fichier.

   Correspondance des blocs (lignes de tenantpulse.js au moment de la copie) :
     REDIRECT_BUTTONS ................ 19
     ALLOWED_REDIRECT_HOSTS / helpers  34
     ADMIN_SHORTCUTS / resolveShortcutUrl  58
     orderedRedirectButtons .......... 322
     extractDomain ................... 3011
     MS_GENERIC_GUIDS / extractGuid .. 3146
     computeConfidence ............... 3300
     GUID_ONLY_RE .................... 3337
     MSA_DOMAINS ..................... 3576
   ────────────────────────────────────────────────────────────────────────────── */

/* L'origine de l'application (TP_APP_ORIGIN) est définie dans app-origin.js, généré à
   la construction depuis local-config.json et absent du dépôt : c'est un domaine réel de
   production, que la section « Confidentialité » de CLAUDE.md interdit de versionner. */

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

/* Normalise un profil venu du miroir (ou construit le profil par défaut si absent).
   Même normalisation que loadProfile() dans tenantpulse.js : partnerCenter est
   toujours actif, analysisMode retombe sur 'manuel'. */
function normalizeProfile(raw) {
  let profile = (raw && typeof raw === 'object') ? { ...raw } : null;
  if (!profile) {
    profile = {};
    REDIRECT_BUTTONS.forEach(b => profile[b.key] = true);
  }
  profile.partnerCenter = true;
  if (profile.analysisMode !== 'auto' && profile.analysisMode !== 'manuel') profile.analysisMode = 'manuel';
  return profile;
}

// ── Saisie ──
function extractDomain(val) {
  val = val.trim();
  if (val.startsWith('@')) val = val.slice(1);
  if (val.includes('@'))   val = val.split('@').pop();
  return val.toLowerCase().trim();
}

const GUID_ONLY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractGuid(s) {
  if (!s) return null;
  const m = s.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : null;
}

/* Tenants Microsoft génériques (comptes personnels MSA) — jamais un vrai tenant client. */
const MS_GENERIC_GUIDS = new Set(['9188040d-6c67-4c5b-b112-36a304b66dad','f8cdef31-a31e-4b4a-93e4-5f571e91255a','2f4a9838-26b7-47ee-be60-cfe0807d0ea7']);

const MSA_DOMAINS = new Set(['outlook.com','outlook.fr','outlook.be','outlook.es','outlook.de','outlook.it','outlook.co.uk','outlook.jp','outlook.pt','outlook.dk','outlook.at','outlook.ch','hotmail.com','hotmail.fr','hotmail.be','hotmail.es','hotmail.de','hotmail.it','hotmail.co.uk','hotmail.nl','hotmail.pt','hotmail.dk','hotmail.se','hotmail.no','live.com','live.fr','live.be','live.nl','live.co.uk','live.de','live.it','live.es','live.se','live.dk','live.no','live.ca','live.com.au','msn.com','passport.com','windowslive.com']);
const isMsaPersonalDomain = d => MSA_DOMAINS.has(d.toLowerCase());

function computeConfidence(ms) {
  if (!ms) return 0;
  let score = 0;
  if (ms.tenantId)      score += 45;
  if (ms.tenantValid)   score += 30;
  if (ms.issuer)        score += 15;
  if (ms.tokenEndpoint) score += 10;
  return Math.min(score, 100);
}
