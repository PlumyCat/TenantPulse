/* ──────────────────────────────────────────────────────────────────────────────
   popup.js — logique de la popup : recherche du Tenant ID, rendu des tuiles de
   redirection et des raccourcis, dans l'ordre du profil synchronisé depuis l'app.

   Périmètre volontairement réduit à la recherche rapide : DNS, santé du domaine,
   WHOIS et hébergeur restent l'affaire de l'application (lien de pied de page).
   La config des tuiles et des raccourcis vient de tp-core.js.
   ────────────────────────────────────────────────────────────────────────────── */

/* MIRROR_KEY, authState(), MESSAGES_AUTH et les lookup* viennent de tp-client.js,
   partagé avec le script de contenu du panneau Dynamics. */
const POPUP_STATE_KEY = 'tp_popup_v1';
const D365_ORIGINS = ['https://*.dynamics.com/*'];

/* État courant de la popup (équivalent réduit de currentState dans tenantpulse.js). */
let mirror = { profile: null, history: [], historyEnabled: false, adminAccounts: {}, auth: null, syncedAt: null };
let profile = null;
let openShortcutKey = null;

// ── Accès au stockage de l'extension ──
const storageGet = (key) => new Promise(resolve => {
  try { chrome.storage.local.get(key, res => resolve(res || {})); } catch { resolve({}); }
});
const storageSet = (obj) => { try { chrome.storage.local.set(obj); } catch {} };

/* Domaine associé à un Tenant ID : uniquement l'historique du miroir.
   L'annuaire partagé (/api/classification) est hors d'atteinte depuis l'extension —
   le cookie d'authentification SWA n'est pas envoyé sur une requête inter-site. */
function resolveDomainFromMirror(tenantId) {
  const t = tenantId.toLowerCase();
  const hit = (mirror.history || []).find(i => i && i.tenantId && i.tenantId.toLowerCase() === t);
  return (hit && hit.domain) ? hit.domain : null;
}

// ── Helpers d'interface ──
const el = (id) => document.getElementById(id);

function showError(msg) {
  const box = el('errorBox');
  box.textContent = msg;
  box.hidden = false;
}
function clearError() { el('errorBox').hidden = true; }

function setStatus(msg) {
  const box = el('statusBox');
  if (!msg) { box.hidden = true; box.replaceChildren(); return; }
  box.replaceChildren();
  const sp = document.createElement('span'); sp.className = 'tp-spinner';
  const tx = document.createElement('span'); tx.textContent = msg;
  box.appendChild(sp); box.appendChild(tx);
  box.hidden = false;
}

function setBusy(busy) {
  el('submitBtn').disabled = busy;
  el('queryInput').disabled = busy;
}

/* Lien d'analyse approfondie : la valeur passe dans le FRAGMENT et non dans la
   query string, pour qu'elle n'apparaisse jamais dans les journaux serveur. */
function setDeepLink(value) {
  const link = el('deepLink');
  if (value) {
    link.href = `${TP_APP_ORIGIN}/#q=${encodeURIComponent(value)}`;
    link.classList.remove('disabled');
  } else {
    link.href = `${TP_APP_ORIGIN}/`;
    link.classList.remove('disabled');
  }
}

/* Détail de l'indice de confiance — équivalent condensé de showConfTooltip
   (tenantpulse.js) : mêmes pondérations, rendues dans une infobulle native. */
function makeConfInfoIcon(ms) {
  const rows = [
    ['Tenant ID trouvé',      45, !!ms.tenantId],
    ['GUID validé Microsoft', 30, !!ms.tenantValid],
    ['Issuer présent',        15, !!ms.issuer],
    ['Token endpoint',        10, !!ms.tokenEndpoint],
  ];
  const im = document.createElement('img');
  im.src = 'assets/information.png';
  im.alt = '';
  im.className = 'conf-info-ic';
  im.title = "Indice de confiance\n"
    + rows.map(([label, pts, earned]) => `${earned ? '✓' : '—'} ${label} : ${earned ? '+' + pts : '0'} pts`).join('\n');
  return im;
}

function makeMsLabel(text) {
  const d = document.createElement('div'); d.className = 'hero-label';
  const im = document.createElement('img'); im.src = 'assets/Microsoft.png'; im.alt = '';
  const sp = document.createElement('span'); sp.textContent = text;
  d.appendChild(im); d.appendChild(sp);
  return d;
}

// ── Raccourcis : accordéon sous la grille de tuiles ──
function closeShortcutPanel() {
  openShortcutKey = null;
  const panel = document.querySelector('.hero-shortcut-panel');
  if (panel) panel.remove();
  document.querySelectorAll('.hero-btn-chevron').forEach(c => c.setAttribute('aria-expanded', 'false'));
}

function openShortcutPanel(btn, chevron, ctx, container) {
  const wasOpen = openShortcutKey === btn.key;
  closeShortcutPanel();
  if (wasOpen) return; // re-clic sur le même chevron → simple fermeture

  const panel = document.createElement('div');
  panel.className = 'hero-shortcut-panel';
  panel.setAttribute('role', 'menu');

  const title = document.createElement('div');
  title.className = 'hero-shortcut-menu-title';
  title.textContent = btn.label;
  panel.appendChild(title);

  // Page d'accueil du centre (même cible que le clic sur la tuile)
  let primary = safeRedirectHref(btn.href, ctx.tenantId, ctx.domain);
  if (btn.key === 'sharepoint') {
    // « Accueil » SharePoint = lien direct uniquement ; le repli M365 est l'entrée dédiée du menu.
    primary = ctx.spTenant
      ? resolveShortcutUrl('https://{spTenant}-admin.sharepoint.com/_layouts/15/online/AdminHome.aspx', ctx)
      : null;
  }
  if (primary) {
    const a = document.createElement('a');
    a.className = 'hero-shortcut-opt primary';
    a.href = primary; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = 'Accueil';
    a.setAttribute('role', 'menuitem');
    panel.appendChild(a);
  }

  (ADMIN_SHORTCUTS[btn.key] || []).forEach(sc => {
    const url = resolveShortcutUrl(sc.url, ctx);
    if (url) {
      const a = document.createElement('a');
      a.className = 'hero-shortcut-opt';
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = sc.label;
      a.setAttribute('role', 'menuitem');
      panel.appendChild(a);
    } else {
      const span = document.createElement('span');
      span.className = 'hero-shortcut-opt disabled';
      span.textContent = sc.label;
      span.title = sc.url.includes('{spTenant}')
        ? "Nom de tenant SharePoint non détecté (CNAME DKIM absent). Ouvrez SharePoint via M365 Admin."
        : sc.url.includes('{domain}')
          ? 'Domaine inconnu pour ce Tenant ID — lien indisponible.'
          : 'Lien indisponible pour ce tenant.';
      panel.appendChild(span);
    }
  });

  container.appendChild(panel);
  openShortcutKey = btn.key;
  chevron.setAttribute('aria-expanded', 'true');
}

/* Grille des tuiles de redirection, dans l'ordre du profil (orderedRedirectButtons). */
function buildActions(ctx, container) {
  const enabled = orderedRedirectButtons(profile).filter(b => profile[b.key] !== false);
  if (!enabled.length) return null;

  const actions = document.createElement('div');
  actions.className = 'hero-actions';

  enabled.forEach(btn => {
    let safeHref = safeRedirectHref(btn.href, ctx.tenantId, ctx.domain);
    let disabled = false;

    if (btn.key === 'sharepoint') {
      // Lien direct fiable en GDAP, construit depuis le nom de tenant déduit du DKIM.
      const direct = ctx.spTenant
        ? resolveShortcutUrl('https://{spTenant}-admin.sharepoint.com/_layouts/15/online/AdminHome.aspx', ctx)
        : null;
      if (direct) safeHref = direct;
      else disabled = true; // pas de nom détecté → grisé ; accès M365 via le chevron
    }
    if (!safeHref) return; // cible non fiable → tuile non rendue
    // Centre dépendant du domaine alors que celui-ci est inconnu (recherche par GUID) :
    // l'URL porterait un « delegatedOrg= » vide, donc une cible inutilisable.
    if (!disabled && /[?&]delegatedOrg=(&|$)/.test(safeHref)) disabled = true;

    const cell = document.createElement('div');
    cell.className = 'hero-btn-cell';

    const chevron = document.createElement('button');
    chevron.type = 'button';
    chevron.className = 'hero-btn-chevron';
    chevron.textContent = '▾';
    chevron.setAttribute('aria-expanded', 'false');
    chevron.setAttribute('aria-label', 'Raccourcis ' + btn.label);
    chevron.addEventListener('click', () => openShortcutPanel(btn, chevron, ctx, container));

    const a = document.createElement('a');
    a.className = 'hero-partner-btn'
      + (btn.key === 'partnerCenter' ? ' recommended' : '')
      + (disabled ? ' disabled' : '');
    if (disabled) {
      a.setAttribute('aria-disabled', 'true');
      a.title = btn.key === 'sharepoint'
        ? "Lien direct SharePoint indisponible (nom de tenant non détecté). Ouvrez SharePoint via la tuile M365 Admin."
        : "Domaine inconnu pour ce Tenant ID — ce centre a besoin du domaine.";
      // Tuile grisée : le clic déplie les raccourcis (le repli M365 y est proposé).
      a.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        openShortcutPanel(btn, chevron, ctx, container);
      });
    } else {
      a.href = safeHref; a.target = '_blank'; a.rel = 'noopener noreferrer';
    }

    const icon = document.createElement('img');
    icon.src = btn.icon; icon.alt = '';
    icon.className = 'hero-partner-btn-icon' + (btn.key === 'partnerCenter' ? ' hero-icon-invert' : '');

    const text = document.createElement('div'); text.className = 'hero-partner-btn-text';
    const label = document.createElement('span'); label.className = 'hero-partner-btn-label'; label.textContent = btn.label;
    const sub = document.createElement('span'); sub.className = 'hero-partner-btn-sub'; sub.textContent = btn.sub;
    text.appendChild(label); text.appendChild(sub);
    a.appendChild(icon); a.appendChild(text);

    cell.appendChild(a); cell.appendChild(chevron);
    actions.appendChild(cell);
  });

  return actions;
}

/* Rendu du bloc résultat — portage condensé de renderHero (tenantpulse.js). */
function renderResult(ms, domain, input) {
  const box = el('resultBox');
  box.replaceChildren();
  closeShortcutPanel();

  const hero = document.createElement('div');
  hero.className = 'tenant-hero';

  if (!ms) {
    hero.classList.add('no-tenant');
    hero.appendChild(makeMsLabel('Microsoft 365'));
    const none = document.createElement('div');
    none.className = 'hero-none';
    none.textContent = 'Aucun tenant Microsoft 365 détecté pour ce domaine';
    hero.appendChild(none);
    const dom = document.createElement('div');
    dom.className = 'hero-domain'; dom.textContent = domain || 'Domaine non résolu';
    hero.appendChild(dom);
    box.appendChild(hero);
    box.hidden = false;
    return;
  }

  const confidence = computeConfidence(ms);
  const confClass = confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low';
  const confLabel = confidence >= 80 ? 'Confiance élevée' : confidence >= 50 ? 'Confiance moyenne' : 'Confiance faible';

  hero.appendChild(makeMsLabel('Microsoft Tenant ID'));

  const guid = document.createElement('div'); guid.className = 'hero-guid';
  const sp = document.createElement('span'); sp.textContent = ms.tenantId;
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button'; copyBtn.className = 'hero-copy-btn'; copyBtn.textContent = 'Copier';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(ms.tenantId);
      copyBtn.textContent = 'Copié ✓'; copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = 'Copier'; copyBtn.classList.remove('copied'); }, 1600);
    } catch { copyBtn.textContent = 'Échec'; }
  });
  const badge = document.createElement('span');
  badge.className = 'confidence-badge ' + confClass;
  badge.appendChild(document.createTextNode(confidence + '% — ' + confLabel));
  badge.appendChild(makeConfInfoIcon(ms));
  guid.appendChild(sp); guid.appendChild(copyBtn); guid.appendChild(badge);
  hero.appendChild(guid);

  const dom = document.createElement('div');
  dom.className = 'hero-domain';
  dom.textContent = domain || 'Domaine inconnu (jamais recherché par domaine)';
  hero.appendChild(dom);

  /* Badges de classification, en lecture seule. Alimentés par l'annuaire recopié
     (tags validés, disponibles hors ligne) puis complétés par le détail du tenant
     si l'application est ouverte quelque part (demandes en attente). Le conteneur
     reste caché tant que rien n'a été trouvé. */
  const zoneTags = document.createElement('div');
  zoneTags.className = 'hero-tags-badges';
  zoneTags.hidden = true;
  hero.appendChild(zoneTags);
  chargerBadges(ms.tenantId, zoneTags, () => { zoneTags.hidden = false; });

  if (!domain) {
    const warn = document.createElement('div'); warn.className = 'hero-warn';
    const ico = document.createElement('img'); ico.src = 'assets/warning.png'; ico.alt = ''; ico.className = 'hero-warn-ico';
    const body = document.createElement('div');
    const t = document.createElement('div'); t.className = 'hero-warn-title'; t.textContent = 'Domaine non résolu';
    const d = document.createElement('div'); d.className = 'hero-warn-desc';
    d.textContent = "Ce tenant n'est pas dans l'historique local. Les centres qui exigent le domaine restent grisés.";
    body.appendChild(t); body.appendChild(d);
    warn.appendChild(ico); warn.appendChild(body);
    hero.appendChild(warn);
  }

  const ctx = { tenantId: ms.tenantId, domain: domain || null, spTenant: ms.spTenant || null };
  const actions = buildActions(ctx, hero);
  if (actions) hero.appendChild(actions);

  box.appendChild(hero);
  box.hidden = false;
  setDeepLink(domain || input);
}

// ── Recherche ──
async function runSearch(rawValue) {
  const raw = (rawValue !== undefined ? rawValue : el('queryInput').value).trim();
  clearError();
  el('resultBox').hidden = true;
  el('resultBox').replaceChildren();
  closeShortcutPanel();
  if (!raw) { showError('Veuillez entrer un domaine, une adresse e-mail ou un Tenant ID.'); return; }

  // Verrou d'appartenance : aucune requête réseau n'est émise sans attestation valide.
  const auth = authState(mirror.auth);
  if (!auth.ok) { showError(MESSAGES_AUTH[auth.raison]); return; }

  storageSet({ [POPUP_STATE_KEY]: { lastQuery: raw } });
  setBusy(true);

  try {
    // ── Recherche directe par Tenant ID ──
    if (GUID_ONLY_RE.test(raw)) {
      setStatus('Validation du Tenant ID…');
      const ms = await lookupById(raw);
      if (!ms) {
        setStatus(null);
        showError("Tenant ID invalide : ce GUID ne correspond pas à un tenant Microsoft 365 actif.");
        setDeepLink(raw);
        return;
      }
      const domain = resolveDomainFromMirror(raw);
      if (domain && profile.sharepoint !== false) {
        setStatus('Détection du tenant SharePoint…');
        ms.spTenant = await lookupSpTenant(domain);
      }
      setStatus(null);
      renderResult(ms, domain, raw);
      return;
    }

    // ── Recherche par domaine / adresse e-mail ──
    const domain = extractDomain(raw);
    if (!domain || !domain.includes('.')) { setStatus(null); showError('Domaine invalide.'); return; }
    setDeepLink(domain);

    if (isMsaPersonalDomain(domain)) {
      setStatus(null);
      showError('Domaine de compte personnel Microsoft (MSA) — aucun tenant à interroger.');
      return;
    }

    setStatus('Interrogation de Microsoft 365…');
    const ms = await lookupByDomain(domain);
    if (ms && profile.sharepoint !== false) {
      setStatus('Détection du tenant SharePoint…');
      ms.spTenant = await lookupSpTenant(domain);
    }
    setStatus(null);
    renderResult(ms, domain, raw);
  } catch (err) {
    setStatus(null);
    showError('Erreur : ' + (err && err.message ? err.message : 'inattendue'));
  } finally {
    setBusy(false);
  }
}

// ── Recherches récentes (issues de l'historique miroir) ──
function renderRecent() {
  const box = el('recentBox');
  const list = el('recentList');
  list.replaceChildren();
  const items = (mirror.history || []).filter(i => i && i.domain).slice(0, 6);
  if (!items.length) { box.hidden = true; return; }
  items.forEach(item => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tp-recent-item';
    b.textContent = item.domain;
    b.title = item.tenantId || item.domain;
    b.addEventListener('click', () => {
      el('queryInput').value = item.domain;
      updateEndpointPreview();
      runSearch(item.domain);
    });
    list.appendChild(b);
  });
  box.hidden = false;
}

/* Aperçu de l'endpoint interrogé — même retour visuel que le champ de l'app. */
function updateEndpointPreview() {
  const raw = el('queryInput').value.trim();
  const preview = el('endpointPreview');
  preview.replaceChildren();
  if (GUID_ONLY_RE.test(raw)) {
    preview.appendChild(document.createTextNode('https://login.microsoftonline.com/'));
    const s = document.createElement('span'); s.className = 'domain'; s.textContent = raw;
    preview.appendChild(s);
    preview.appendChild(document.createTextNode('/.well-known/openid-configuration'));
    return;
  }
  const d = extractDomain(raw) || 'domaine.com';
  preview.appendChild(document.createTextNode('https://login.microsoftonline.com/'));
  const s = document.createElement('span'); s.className = 'domain'; s.textContent = d;
  preview.appendChild(s);
  preview.appendChild(document.createTextNode('/.well-known/openid-configuration'));
}

/* ── Interrupteur du panneau Dynamics ──
   L'accès à Dynamics est une permission OPTIONNELLE : tant qu'elle n'est pas accordée,
   l'extension n'est injectée sur aucune page Dynamics. chrome.permissions.request()
   exige un geste de l'utilisateur — d'où cette case à cocher plutôt qu'un octroi
   silencieux au premier lancement. */
const D365_SUB_DEFAUT = 'Affiche le Tenant ID du client sur la fiche incident.';

/* Demande au service worker d'aligner les scripts sur la permission, et rend son
   diagnostic : sans ça, un échec d'enregistrement serait invisible ici. */
function askD365Sync() {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type: 'tp-d365-sync' }, res => {
        if (chrome.runtime.lastError || !res || !res.ok) { resolve(null); return; }
        resolve(res.etat || null);
      });
    } catch { resolve(null); }
  });
}

/* Dernier signe de vie du script de contenu Dynamics (clé écrite par d365/ctx.js).
   Sans ce retour, une injection qui n'a pas lieu est indiscernable d'une fiche sans
   domaine exploitable — et la console d'Omnicanal est inexploitable à l'œil nu. */
const D365_DIAG_KEY = 'tp_d365_diag_v1';

function tempsRelatif(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}

async function renderD365Diag(actif) {
  const box = el('d365Diag');
  if (!actif) { box.hidden = true; return; }
  const stored = await storageGet(D365_DIAG_KEY);
  const diag = stored[D365_DIAG_KEY];
  if (!diag || !diag.at) {
    box.textContent = "Jamais vu sur Dynamics — rechargez l'onglet après activation.";
  } else {
    const quand = tempsRelatif(diag.at);
    box.textContent = `Dernier signe de vie ${quand || ''} : ${diag.statut}`;
  }
  box.hidden = false;
}

function d365Message(etat, actif) {
  if (etat && etat.erreur) return "Échec d'activation : " + etat.erreur;
  if (!actif) return D365_SUB_DEFAUT;
  if (etat && etat.registered) return `Actif (${etat.registered} scripts) — rechargez l'onglet Dynamics.`;
  return "Actif — rechargez l'onglet Dynamics.";
}

async function initD365Toggle() {
  const box = el('d365Optin');
  const cb = el('d365Toggle');
  const sub = el('d365OptinSub');

  // Sans instance configurée, le garde-fou d'origine du script de contenu bloquerait tout.
  if (typeof TP_D365_ORIGIN !== 'string' || !TP_D365_ORIGIN) {
    cb.disabled = true;
    sub.textContent = "Instance Dynamics non configurée — renseignez « d365Origin » dans local-config.json.";
    box.hidden = false;
    return;
  }

  try { cb.checked = await chrome.permissions.contains({ origins: D365_ORIGINS }); } catch {}
  box.hidden = false;
  /* Réalignement à chaque ouverture : après une mise à jour de l'extension, les scripts
     enregistrés dans la session précédente peuvent être obsolètes ou absents. */
  if (cb.checked) sub.textContent = d365Message(await askD365Sync(), true);
  renderD365Diag(cb.checked);

  cb.addEventListener('change', async () => {
    const voulu = cb.checked;
    try {
      if (voulu) {
        cb.checked = await chrome.permissions.request({ origins: D365_ORIGINS });
      } else {
        await chrome.permissions.remove({ origins: D365_ORIGINS });
        cb.checked = await chrome.permissions.contains({ origins: D365_ORIGINS });
      }
    } catch { cb.checked = !voulu; }

    /* permissions.onAdded / onRemoved réveille déjà le service worker : ce message ne
       sert qu'à ne pas dépendre du seul ordonnancement des événements, et à récupérer
       le diagnostic d'enregistrement. */
    sub.textContent = d365Message(await askD365Sync(), cb.checked);
    renderD365Diag(cb.checked);
  });
}

/* Signale le thème courant, que background.js applique à l'icône de la barre d'outils.
   La popup et le script de contenu sont les seuls contextes de l'extension à disposer
   de matchMedia — un service worker n'en a pas. */
function reportTheme() {
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const push = () => storageSet({ tp_theme_v1: mq.matches ? 'dark' : 'light' });
    push();
    mq.addEventListener('change', push);
  } catch {}
}

function bindEvents() {
  el('searchForm').addEventListener('submit', e => { e.preventDefault(); runSearch(); });
  el('queryInput').addEventListener('input', updateEndpointPreview);
  // Un clic hors du panneau de raccourcis le referme (sauf sur un chevron, qui bascule).
  document.addEventListener('click', e => {
    if (!openShortcutKey) return;
    if (e.target.closest('.hero-shortcut-panel') || e.target.closest('.hero-btn-chevron')) return;
    closeShortcutPanel();
  });
}

async function init() {
  const stored = await storageGet([MIRROR_KEY, POPUP_STATE_KEY]);
  const snap = stored[MIRROR_KEY];
  if (snap) {
    mirror = {
      profile: snap.profile || null,
      history: Array.isArray(snap.history) ? snap.history : [],
      historyEnabled: !!snap.historyEnabled,
      adminAccounts: snap.adminAccounts || {},
      auth: snap.auth || null,
      syncedAt: snap.syncedAt || null,
    };
  }
  profile = normalizeProfile(mirror.profile);

  el('openAppLink').href = `${TP_APP_ORIGIN}/`;
  setDeepLink(null);

  const auth = authState(mirror.auth);
  const banner = el('mirrorBanner');
  if (!auth.ok) {
    // Extension verrouillée : on neutralise la saisie et on n'affiche pas l'historique.
    banner.classList.add('locked');
    el('mirrorBannerText').textContent = MESSAGES_AUTH[auth.raison];
    banner.hidden = false;
    setBusy(true);
    el('recentBox').hidden = true;
  } else if (!mirror.profile) {
    el('mirrorBannerText').textContent =
      "Aucun profil enregistré dans l'app : toutes les tuiles sont affichées.";
    banner.hidden = false;
  }

  reportTheme();
  if (auth.ok) renderRecent();
  initD365Toggle();
  bindEvents();

  const last = stored[POPUP_STATE_KEY];
  if (last && last.lastQuery) el('queryInput').value = last.lastQuery;
  updateEndpointPreview();
  if (auth.ok) { el('queryInput').focus(); el('queryInput').select(); }
}

init();
