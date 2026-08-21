/* ══════════════════════════════════════════════════════════════════════════
   MICROSOFT GRAPH — connexion déléguée, exécutée entièrement dans le navigateur
   ══════════════════════════════════════════════════════════════════════════

   Même modèle réseau que le reste de l'application : le navigateur parle
   directement à Microsoft, aucun serveur intermédiaire ne voit ni le jeton ni
   les réponses. C'est ce qui permet de continuer à écrire, en page
   Confidentialité, que les données analysées ne transitent nulle part — et
   c'est aussi ce qui évite de devenir sous-traitant au sens du RGPD.

   Flux : OAuth 2.0 code d'autorisation + PKCE (S256), sans secret client.
   Pas de MSAL : la bibliothèque pèse ~200 Ko et l'application n'a aucune
   dépendance frontend ni étape de build. Le périmètre ici est étroit — un
   fournisseur, deux points d'entrée en lecture seule — donc le flux tient en
   un fichier. Toute la logique d'authentification est confinée ici : si un
   jour MSAL devient nécessaire, c'est ce fichier qu'on remplace, rien d'autre.

   Redirection plutôt que popup, délibérément : au retour d'Entra la fenêtre
   surgissante changerait de groupe de contextes de navigation à cause de
   l'en-tête Cross-Origin-Opener-Policy: same-origin, et perdrait window.opener.
   Le contourner demanderait de relâcher la COOP. Une connexion par session ne
   le justifie pas.

   Stockage : le jeton d'accès reste en mémoire. Le jeton d'actualisation va en
   sessionStorage — il disparaît donc à la fermeture de l'onglet, et jamais dans
   localStorage où il survivrait à la session.
   ══════════════════════════════════════════════════════════════════════════ */

const TP_GRAPH_AUTHORITY = 'https://login.microsoftonline.com/organizations';
const TP_GRAPH_BASE      = 'https://graph.microsoft.com/v1.0';

/* Portées déléguées du palier 0 : tout est lu depuis le tenant de l'utilisateur,
   aucun accès aux tenants clients n'est requis. Les deux premières exigent un
   consentement administrateur — un technicien ne peut pas se l'accorder seul. */
const TP_GRAPH_SCOPES = [
  'https://graph.microsoft.com/CrossTenantInformation.ReadBasic.All',
  'https://graph.microsoft.com/ManagedTenants.Read.All',
  'offline_access', 'openid', 'profile'
];

/* Microsoft 365 Lighthouse n'existe qu'en beta sur Graph. C'est assumé et
   documenté : aucune autre voie ne donne la posture d'un client sans consentir
   l'application dans son annuaire. Voir l'encadré du CLAUDE.md. */
const TP_GRAPH_BETA = 'https://graph.microsoft.com/beta';

const TP_GRAPH_SESSION_KEY = 'tenantpulse_graph_v1';       // sessionStorage : jeton d'actualisation + compte
const TP_GRAPH_PENDING_KEY = 'tenantpulse_graph_pending_v1'; // sessionStorage : PKCE en cours de redirection
const TP_GRAPH_HASH_KEY    = 'tenantpulse_graph_hash_v1';    // sessionStorage : fragment relayé par la page de retour
const TP_GRAPH_CALLBACK    = '/graph-callback.html';         // route anonyme, voir graph-callback.js

const TP_GRAPH = {
  clientId:     null,   // servi par /api/me — jamais versionné, il identifie l'organisation
  connected:    false,
  account:      null,   // { username, name, tenantId }
  accessToken:  null,   // mémoire seulement
  expiresAt:    0,      // epoch ms
  refreshToken: null,
  lastError:    null
};

/* ── PKCE ────────────────────────────────────────────────────────────────── */

const graphB64Url = bytes => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const graphRandom = (n = 32) => graphB64Url(crypto.getRandomValues(new Uint8Array(n)));

async function graphChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return graphB64Url(new Uint8Array(digest));
}

/* ── Session ─────────────────────────────────────────────────────────────── */

function graphSaveSession() {
  try {
    sessionStorage.setItem(TP_GRAPH_SESSION_KEY, JSON.stringify({
      refreshToken: TP_GRAPH.refreshToken,
      account:      TP_GRAPH.account,
      clientId:     TP_GRAPH.clientId
    }));
  } catch { /* stockage indisponible → la session ne survivra pas au rechargement */ }
}

function graphLoadSession() {
  let raw; try { raw = sessionStorage.getItem(TP_GRAPH_SESSION_KEY); } catch { return; }
  if (!raw) return;
  let data; try { data = JSON.parse(raw); } catch { return; }
  if (!data?.refreshToken) return;
  TP_GRAPH.refreshToken = data.refreshToken;
  TP_GRAPH.account      = data.account || null;
  TP_GRAPH.clientId     = TP_GRAPH.clientId || data.clientId || null;
  TP_GRAPH.connected    = true;   // confirmé au premier renouvellement de jeton
}

function graphClearSession() {
  TP_GRAPH.connected = false;
  TP_GRAPH.account = null;
  TP_GRAPH.accessToken = null;
  TP_GRAPH.expiresAt = 0;
  TP_GRAPH.refreshToken = null;
  try { sessionStorage.removeItem(TP_GRAPH_SESSION_KEY); } catch {}
}

/* Dérogation de développement local. En local il n'y a pas de Functions, donc pas
   de /api/me, donc pas d'identifiant client : le bouton resterait masqué et rien
   ne serait testable. On accepte alors une valeur posée à la main dans
   localStorage — et uniquement sur localhost. En production seul /api/me fait
   autorité, ce garde-fou ne peut pas y être contourné. */
const TP_GRAPH_DEV_KEY = 'tenantpulse_graph_dev_clientid';
function graphDevClientId() {
  const h = location.hostname;
  if (h !== 'localhost' && h !== '127.0.0.1' && h !== '[::1]') return null;
  try { return localStorage.getItem(TP_GRAPH_DEV_KEY) || null; } catch { return null; }
}

/* ── Connexion ───────────────────────────────────────────────────────────── */

/* Redirige vers Entra. Le vérificateur PKCE et l'état sont déposés en
   sessionStorage : ils doivent survivre à la navigation, pas à l'onglet.
   L'identifiant client y est joint pour que le retour soit autonome et n'ait
   pas à attendre /api/me. */
async function graphBeginLogin(forcerSelection) {
  if (!TP_GRAPH.clientId) { TP_GRAPH.lastError = 'Connexion Graph non configurée sur ce déploiement.'; syncGraphUI(); return; }

  const verifier  = graphRandom(48);
  const state     = graphRandom(16);
  const challenge = await graphChallenge(verifier);
  /* Page de retour dédiée, et non la racine. Le cookie d'authentification de
     Static Web Apps est SameSite=Strict : il n'accompagne pas la navigation qui
     revient de login.microsoftonline.com. Un retour sur « / » déclenche donc un
     401, une redirection vers /.auth/login/aad, et le fragment portant le code
     d'autorisation se perd dans cette réauthentification silencieuse.
     graph-callback.html est déclarée en route anonyme : elle reçoit le fragment
     intact. Voir graph-callback.js. C'est cette URI exacte qu'il faut inscrire
     dans l'application Entra, en plateforme SPA. */
  const redirect  = location.origin + TP_GRAPH_CALLBACK;

  try {
    sessionStorage.setItem(TP_GRAPH_PENDING_KEY, JSON.stringify({
      verifier, state, redirect,
      clientId: TP_GRAPH.clientId,
      // Le champ de recherche est restauré au retour : une redirection ne doit
      // pas faire perdre ce que l'utilisateur était en train de taper.
      query: (document.getElementById('emailInput')?.value || '').slice(0, 253)
    }));
  } catch {
    TP_GRAPH.lastError = "Le stockage de session est indisponible, la connexion ne peut pas aboutir.";
    syncGraphUI(); return;
  }

  const p = new URLSearchParams({
    client_id:             TP_GRAPH.clientId,
    response_type:         'code',
    redirect_uri:          redirect,
    response_mode:         'fragment',   // le code reste dans le fragment, hors des journaux serveur
    scope:                 TP_GRAPH_SCOPES.join(' '),
    state,
    code_challenge:        challenge,
    code_challenge_method: 'S256'
  });

  /* L'utilisateur a déjà franchi l'authentification Entra de l'application : lui
     re-proposer un sélecteur de compte n'apporte rien. Avec login_hint et sans
     prompt, la session existante est réutilisée et la redirection est invisible.

     Sauf quand on le demande explicitement. En contexte partenaire, l'identité
     qui porte les droits GDAP n'est pas toujours celle du poste de travail :
     les rôles Partner Center (AdminAgents) vivent souvent sur un compte
     d'administration distinct. Sans échappatoire, l'utilisateur serait enfermé
     sur le compte de l'application, sans comprendre pourquoi sa liste GDAP est
     vide alors qu'il voit ses clients dans Partner Center. */
  let indice = null;
  if (!forcerSelection) {
    try { indice = TP_AUTH?.email || null; } catch { /* tenantpulse.js absent */ }
  }
  if (indice) p.set('login_hint', indice); else p.set('prompt', 'select_account');

  location.assign(TP_GRAPH_AUTHORITY + '/oauth2/v2.0/authorize?' + p.toString());
}

/* Traite le retour d'Entra si le fragment en porte un. Retourne true si un
   fragment d'authentification a été consommé — l'appelant sait alors qu'il ne
   doit pas interpréter le fragment autrement. */
async function graphHandleRedirect() {
  /* Le fragment arrive normalement par graph-callback.html, qui l'a déposé en
     sessionStorage. On accepte aussi location.hash en repli : utile en
     développement local, et si un jour la contrainte SameSite disparaît. */
  let hash = '';
  let viaStockage = false;
  try {
    hash = sessionStorage.getItem(TP_GRAPH_HASH_KEY) || '';
    if (hash) { sessionStorage.removeItem(TP_GRAPH_HASH_KEY); viaStockage = true; }
  } catch {}
  if (!hash) hash = location.hash || '';

  if (!hash.includes('code=') && !hash.includes('error=')) return false;

  const params = new URLSearchParams(hash.slice(1));
  const code   = params.get('code');
  const err    = params.get('error');
  const state  = params.get('state');

  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem(TP_GRAPH_PENDING_KEY) || 'null'); } catch {}
  try { sessionStorage.removeItem(TP_GRAPH_PENDING_KEY); } catch {}

  /* Le fragment est retiré de l'URL dans tous les cas : un rechargement ne doit
     pas rejouer un code déjà consommé. Inutile quand il venait du stockage — il
     n'a alors jamais atteint la barre d'adresse — mais sans effet de bord. */
  if (!viaStockage) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  }

  if (!pending) return false;                       // fragment orphelin, on l'ignore
  if (state !== pending.state) {                    // garde anti-CSRF
    graphSignalError("Réponse d'authentification inattendue, connexion abandonnée.");
    return true;
  }

  /* Restauration avant tout traitement : ce que l'utilisateur avait saisi ne doit
     pas dépendre de la réussite de la connexion. */
  const input = document.getElementById('emailInput');
  if (input && pending.query && !input.value) {
    input.value = pending.query;
    input.dispatchEvent(new Event('input'));
  }

  if (err) { graphSignalError(params.get('error_description') || err); return true; }
  if (!code) return true;

  TP_GRAPH.clientId = TP_GRAPH.clientId || pending.clientId;
  await graphExchange({ grant_type: 'authorization_code', code, code_verifier: pending.verifier, redirect_uri: pending.redirect });
  return true;
}

/* Un échec de connexion doit se voir à l'écran. Le titre d'infobulle ne suffit
   pas : il faut survoler pour le lire, et l'utilisateur qui revient d'une
   redirection ne sait même pas qu'il y a eu une erreur — il voit une page qui
   s'est rechargée et un bouton revenu à son état initial. */
function graphSignalError(msg) {
  TP_GRAPH.lastError = msg || null;
  syncGraphUI();
  if (msg && typeof heroTagFeedback === 'function') {
    heroTagFeedback('Microsoft Graph : ' + msg, true);
  }
}

/* Appel unique au point d'entrée de jetons — code d'autorisation ou
   actualisation, le corps seul change. Aucun secret client : l'inscription
   d'application est de type SPA, Entra y autorise le CORS et impose PKCE. */
async function graphExchange(extra) {
  const body = new URLSearchParams({
    client_id: TP_GRAPH.clientId,
    scope:     TP_GRAPH_SCOPES.join(' '),
    ...extra
  });

  let res;
  try {
    res = await fetch(TP_GRAPH_AUTHORITY + '/oauth2/v2.0/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString()
    });
  } catch {
    graphSignalError("Le point d'entrée de jetons Microsoft est injoignable. Vérifiez que l'inscription d'application est bien de type « Application à page unique » : une plateforme « Web » fait refuser la requête depuis un navigateur.");
    return false;
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    // invalid_grant sur un renouvellement = jeton d'actualisation expiré ou révoqué :
    // ce n'est pas une erreur à afficher, c'est une session à refermer proprement.
    const silencieux = data?.error === 'invalid_grant' && extra.grant_type === 'refresh_token';
    graphClearSession();
    graphSignalError(silencieux ? null : (data?.error_description || 'Authentification refusée.'));
    return false;
  }

  TP_GRAPH.accessToken  = data.access_token;
  TP_GRAPH.expiresAt    = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  if (data.refresh_token) TP_GRAPH.refreshToken = data.refresh_token;  // rotatif côté Entra
  TP_GRAPH.connected    = true;
  TP_GRAPH.lastError    = null;
  TP_GRAPH.account      = graphReadIdToken(data.id_token) || TP_GRAPH.account;
  graphSaveSession();
  syncGraphUI();
  return true;
}

/* Lecture de la charge utile du jeton d'identité, pour afficher qui est connecté.
   Aucune vérification de signature : ce jeton vient d'être obtenu par un canal
   TLS direct auprès d'Entra et ne sert qu'à de l'affichage — il n'autorise rien. */
function graphReadIdToken(idToken) {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length < 2) return null;
  try {
    const json = decodeURIComponent(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
      .split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    const c = JSON.parse(json);
    return { username: c.preferred_username || null, name: c.name || null, tenantId: c.tid || null };
  } catch { return null; }
}

/* Jeton d'accès valide, renouvelé 2 minutes avant l'échéance. */
async function graphToken() {
  if (TP_GRAPH.accessToken && Date.now() < TP_GRAPH.expiresAt - 120000) return TP_GRAPH.accessToken;
  if (!TP_GRAPH.refreshToken || !TP_GRAPH.clientId) return null;
  const ok = await graphExchange({ grant_type: 'refresh_token', refresh_token: TP_GRAPH.refreshToken });
  return ok ? TP_GRAPH.accessToken : null;
}

function graphDisconnect() {
  graphClearSession();
  TP_GRAPH.lastError = null;
  syncGraphUI();
}

/* Applique la décision du serveur, transmise par /api/me.
   Un accès retiré doit couper une session en cours, pas seulement masquer le
   bouton : graphLoadSession() restaure le jeton d'actualisation depuis
   sessionStorage, donc sans ce garde un utilisateur dont l'accès vient d'être
   révoqué continuerait d'interroger Graph jusqu'à la fermeture de l'onglet.
   Nulle part ailleurs on ne remet clientId à null — c'est ce qui rend impossible
   tout appel ultérieur, graphToken() refusant de s'exécuter sans lui. */
function graphApplyAccess(autorise, clientId) {
  if (!autorise) {
    if (TP_GRAPH.connected || TP_GRAPH.refreshToken) graphClearSession();
    TP_GRAPH.clientId = null;
    syncGraphUI();
    return;
  }
  if (clientId) TP_GRAPH.clientId = clientId;
  syncGraphUI();
}

/* ── Appels ──────────────────────────────────────────────────────────────── */

/* Lecture Graph. Ne lève jamais : retourne { ok, status, data }, l'analyse doit
   se poursuivre quoi qu'il arrive. Un 401 déclenche un renouvellement et un seul
   nouvel essai ; un 429 respecte Retry-After une fois. */
async function graphGet(path, signal, opts = {}) {
  const base     = opts.base || TP_GRAPH_BASE;
  const _retried = opts._retried === true;
  const token = await graphToken();
  if (!token) return { ok: false, status: 0, data: null };

  let res;
  try {
    res = await fetch(base + path, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal
    });
  } catch (e) {
    return { ok: false, status: 0, data: null, aborted: e?.name === 'AbortError' };
  }

  if (res.status === 401 && !_retried) {
    TP_GRAPH.expiresAt = 0;                       // force le renouvellement
    return graphGet(path, signal, { base, _retried: true });
  }
  if ((res.status === 429 || res.status === 503) && !_retried) {
    const attente = Math.min(Number(res.headers.get('Retry-After')) || 2, 10) * 1000;
    await new Promise(r => setTimeout(r, attente));
    return graphGet(path, signal, { base, _retried: true });
  }

  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

/* Identité du tenant propriétaire d'un domaine. Fonctionne pour n'importe quel
   domaine avec le seul jeton de l'utilisateur : aucun accès au tenant visé.
   C'est ce que l'endpoint openid-configuration ne donne pas — le nom lisible du
   tenant et son domaine .onmicrosoft.com.
   404 = le domaine n'appartient à aucun tenant Entra ; ce n'est pas une erreur. */
async function graphFindTenant(domain, signal) {
  if (!TP_GRAPH.connected || !domain) return null;
  if (!/^[a-z0-9.-]+$/i.test(domain)) return null;   // le domaine part dans un littéral OData
  const r = await graphGet(
    `/tenantRelationships/findTenantInformationByDomainName(domainName='${encodeURIComponent(domain)}')`,
    signal
  );
  if (r.status === 404) return { found: false };
  if (!r.ok || !r.data) return null;
  return {
    found:             true,
    tenantId:          r.data.tenantId || null,
    displayName:       r.data.displayName || null,
    defaultDomainName: r.data.defaultDomainName || null,
    federationBrand:   r.data.federationBrandName || null
  };
}

/* ── Couverture MFA, via Microsoft 365 Lighthouse ────────────────────────────

   Lighthouse agrège la posture des tenants gérés et l'expose **depuis le tenant
   partenaire**. C'est ce qui règle le problème de fond : lire directement le
   tenant d'un client exigerait d'y consentir l'application, tenant par tenant
   (AADSTS65001), soit des milliers de consentements. Ici, une seule portée
   consentie chez le partenaire couvre tout le parc.

   Trois limites à connaître :
     - l'API n'existe qu'en `beta`, Microsoft peut la faire évoluer sans préavis ;
     - le tenant doit être éligible et intégré à Lighthouse, sinon il est absent ;
     - les données sont agrégées périodiquement, ce n'est pas du temps réel.

   Les noms de propriétés varient selon les révisions de la beta, d'où la lecture
   tolérante de `lireResume()` : plusieurs graphies sont acceptées, et
   `graphDumpMfa()` sert à relever la forme réelle si aucune ne correspond.      */

const TP_GRAPH_MFA_PATH = '/tenantRelationships/managedTenants/credentialUserRegistrationsSummaries';

/* Extraction tolérante : on cherche un total de comptes et un nombre de comptes
   couverts, quels que soient les noms retenus par la révision courante. */
function lireResume(row) {
  const prem = (...noms) => {
    for (const n of noms) {
      const v = row[n];
      if (typeof v === 'number') return v;
    }
    return null;
  };
  const total = prem('totalUserCount', 'userCount', 'totalUsers');
  const couverts = prem('mfaRegisteredUserCount', 'mfaRegistered',
                        'mfaAndSsprCapableUserCount', 'mfaCapableUserCount', 'registeredUserCount');
  return { total, couverts };
}

/* Dernière réponse brute conservée pour diagnostic. Si le panneau annonce un
   format inattendu, `graphDumpMfa()` en console donne la forme exacte à mapper. */
function graphDumpMfa() { return TP_GRAPH.dernierResumeMfa || null; }

async function checkMfa(tenantId, signal) {
  if (!tenantId) return null;

  /* Filtrage côté serveur d'abord : avec un parc de plusieurs milliers de
     tenants, rapatrier tout le jeu pour n'en garder qu'une ligne serait absurde.
     Repli sur un chargement complet mis en cache si le filtre est refusé. */
  let r = await graphGet(
    `${TP_GRAPH_MFA_PATH}?$filter=tenantId eq '${encodeURIComponent(tenantId)}'`,
    signal, { base: TP_GRAPH_BETA }
  );

  if (!r.ok && r.status === 400) {
    if (!TP_GRAPH.mfaCache) {
      const tout = await graphGet(`${TP_GRAPH_MFA_PATH}?$top=999`, signal, { base: TP_GRAPH_BETA });
      if (!tout.ok) r = tout; else TP_GRAPH.mfaCache = tout.data?.value || [];
    }
    if (TP_GRAPH.mfaCache) {
      const cible = String(tenantId).toLowerCase();
      r = { ok: true, status: 200, data: { value: TP_GRAPH.mfaCache.filter(x => String(x.tenantId || '').toLowerCase() === cible) } };
    }
  }

  if (!r.ok) {
    if (r.status === 403) return { erreur: 'portee',  message: "Accès refusé. La portée ManagedTenants.Read.All n'est pas consentie sur l'inscription d'application, ou le compte connecté n'a pas accès à Lighthouse." };
    if (r.status === 404) return { erreur: 'absent',  message: "Point d'entrée Lighthouse introuvable. L'API est en beta, sa forme a pu changer." };
    if (!r.status)        return { erreur: 'reseau',  message: "Microsoft Graph est injoignable." };
    return { erreur: 'http', message: 'Réponse inattendue de Graph (HTTP ' + r.status + ').' };
  }

  const row = (r.data?.value || [])[0];
  if (!row) return { erreur: 'nonGere', message: "Ce tenant n'apparaît pas dans Lighthouse. Il n'est pas intégré, ou il ne remplit pas les conditions d'éligibilité (relation GDAP conforme et licences requises côté client)." };

  TP_GRAPH.dernierResumeMfa = row;
  const { total, couverts } = lireResume(row);

  if (total === null || couverts === null) {
    return {
      erreur: 'format',
      message: "Lighthouse a répondu mais dans un format que je ne sais pas lire. L'API est en beta. Relevez la forme exacte avec graphDumpMfa() en console.",
      champs: Object.keys(row).join(', ')
    };
  }
  if (!total) return { total: 0 };

  return {
    total,
    couverts,
    sansMfa:         total - couverts,
    pourcentAvecMfa: Math.round((couverts / total) * 100),
    majLe:           row.lastRefreshedDateTime || row.lastUpdatedDateTime || null,
    tenantNom:       row.tenantDisplayName || null
  };
}



/* ── Posture du tenant, via Microsoft 365 Lighthouse ─────────────────────────

   `ManagedTenants.Read.All` ouvre le **service** Lighthouse, pas les **données**
   qu'il agrège. Chaque jeu qui expose de la donnée client réclame en plus la
   portée Graph propre à cette donnée, et un refus se présente sous la forme
   d'un 403 « Delegate scope doesn't meet requirement », message trompeur : les
   rôles GDAP, eux, sont bien suffisants.

   Correspondance relevée dans les bundles du portail Lighthouse (2026-08-17) :

     credentialUserRegistrationsSummaries  →  Reports.Read.All
     managedDeviceCompliances              →  DeviceManagementManagedDevices.Read.All
     windowsDeviceMalwareStates            →  DeviceManagementManagedDevices.Read.All
     conditionalAccessPolicyCoverages      →  Policy.Read.All

   D'où le parti pris de cette section : **chaque jeu est indépendant et
   facultatif**. Un refus n'est pas une erreur, il retire une ligne de
   l'affichage et rien d'autre. Les jeux encore refusés sont donc interrogés
   quand même, pour qu'ils apparaissent d'eux-mêmes le jour où la portée est
   accordée, sans qu'une ligne de code change. `graphDumpPosture()` en console
   donne le détail des refus quand quelque chose manque à l'écran, et
   `PORTEE_REQUISE` plus bas sert à l'expliquer à l'utilisateur.

   Rappel valable pour tout le bloc : l'API est en beta, le tenant doit être
   intégré à Lighthouse, et les chiffres sont agrégés périodiquement. La date
   d'arrêté est affichée pour cette raison.                                    */

const TP_GRAPH_MT = '/tenantRelationships/managedTenants';
const TP_GRAPH_SEVERITES = ['high', 'medium', 'low', 'informational'];

/* Ce qui manque, et pourquoi. Sert à écrire à l'écran une phrase exploitable
   plutôt qu'un silence : sans elle, un chiffre absent se lit comme un zéro.
   Le libellé est celui que l'utilisateur cherchait, pas le nom de l'entité. */
/* `vue` porte la route du portail Lighthouse ou la donnee refusee est, elle,
   consultable — `null` renvoyant a la fiche du client, comme addLienLighthouse.
   Sans ce lien, la rubrique la plus utile est aussi la seule sans porte de
   sortie : l'utilisateur lit qu'une autorisation manque et n'a nulle part ou
   aller, alors que ses roles GDAP lui donnent acces a la donnee depuis le
   portail dans la seconde. */
const PORTEE_REQUISE = {
  appareils:  { quoi: 'Appareils non conformes', portee: 'DeviceManagementManagedDevices.Read.All', vue: 'DeviceCompliance.ReactView' },
  mfa:        { quoi: 'Couverture MFA',          portee: 'Reports.Read.All',                        vue: null },
  exposition: { quoi: 'Vulnérabilités Defender', portee: 'DeviceManagementManagedDevices.Read.All', vue: 'MDE.ReactView' }
};

/* Le tenantId part dans un littéral OData : on n'y laisse passer qu'un GUID. */
const TP_GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Un jeu de données facultatif. Toute anomalie (refus, absence, format
   inattendu, réseau) se solde par `null` : l'appelant n'a rien à vérifier. */
async function litJeu(nom, chemin, signal, refus) {
  const r = await graphGet(chemin, signal, { base: TP_GRAPH_BETA });
  if (!r.ok) {
    refus[nom] = r.status || 'réseau';
    return null;
  }
  return r.data;
}

/* Première ligne d'une collection OData, en vérifiant qu'elle concerne bien le
   tenant demandé. Le portail interroge certains jeux avec `filter=` sans `$` ;
   si une révision de la beta cessait de l'honorer, la réponse porterait la
   première ligne venue du parc. Ce contrôle évite d'attribuer à un client les
   chiffres d'un autre, silencieusement, sur une page de diagnostic. */
function ligneDuTenant(data, tenantId) {
  const row = (data?.value || [])[0];
  if (!row) return null;
  if (row.tenantId && String(row.tenantId).toLowerCase() !== String(tenantId).toLowerCase()) return null;
  return row;
}

async function checkPosture(tenantId, signal) {
  if (!tenantId || !TP_GUID_RE.test(tenantId)) return null;

  const id    = tenantId;
  const refus = {};
  const J     = (nom, chemin) => litJeu(nom, chemin, signal, refus);

  /* Les jeux sont indépendants : en série, une analyse coûterait la somme des
     latences pour un résultat identique. */
  const [score, expo, base, ident, adopt, apparCpt, appar, ...alertes] = await Promise.all([
    J('secureScore', `${TP_GRAPH_MT}/managedTenantSecureScores?$filter=tenantId eq '${id}'&$orderby=createdDateTime desc&$top=1`),
    J('exposition',  `${TP_GRAPH_MT}/tenantExposureSummaries?$filter=tenantId eq '${id}'`),
    J('baseline',    `${TP_GRAPH_MT}/managementTemplateCollectionTenantSummaries?$apply=filter((tenantId in ('${id}')))`),
    J('identite',    `${TP_GRAPH_MT}/tenantsDetailedInformation?filter=tenantId eq '${id}'`),
    J('adoption',    `${TP_GRAPH_MT}/managedTenantAdoptionReports?$filter=tenantId eq '${id}'&$orderBy=createdDateTime desc&$top=1`),
    /* Refusés en l'état (DeviceManagementManagedDevices.Read.All manquante), mais
       interrogés quand même : le jour où la portée est accordée, les chiffres
       apparaissent sans modification.

       Deux requêtes et non une, comme le fait le portail Lighthouse : la liste
       est paginée par le service (100 lignes observées sur un parc de 865) et
       compter les lignes rapatriées donnerait le décompte d'une page pour celui
       d'un parc. L'agrégat, lui, porte sur la totalité et ne coûte qu'une ligne
       par statut. La liste ne sert donc qu'à nommer les machines, jamais à les
       compter. Syntaxe OData relevée telle quelle dans le portail. */
    J('appareilsCpt', `${TP_GRAPH_MT}/managedDeviceCompliances`
                    + `?$apply=filter(tenantId in ('${id}'))/groupby((complianceStatus),aggregate(1 with sum as complianceCount))`),
    J('appareils',   `${TP_GRAPH_MT}/managedDeviceCompliances?$filter=(tenantId in ('${id}'))&$orderBy=managedDeviceName asc&$count=true&$top=999`),
    ...TP_GRAPH_SEVERITES.map(s =>
      J('alertes_' + s, `${TP_GRAPH_MT}/managedTenantAlerts?$count=true&$select=id&$top=1&$filter=tenantId in ('${id}') and severity in ('${s}')`))
  ]);

  const out = { refus };

  const rScore = ligneDuTenant(score, id);
  if (rScore && typeof rScore.currentScore === 'number' && rScore.maxScore > 0) {
    out.secureScore = {
      courant:   rScore.currentScore,
      max:       rScore.maxScore,
      pourcent:  Math.round((rScore.currentScore / rScore.maxScore) * 100),
      arreteLe:  rScore.createdDateTime || null
    };
  }

  const rExpo = ligneDuTenant(expo, id);
  if (rExpo) {
    const passe = Array.isArray(rExpo.pastRiskExposureScores) ? rExpo.pastRiskExposureScores.filter(v => typeof v === 'number' && v > 0) : [];
    out.exposition = {
      appareils:     rExpo.totalDeviceCount ?? null,
      exposes:       rExpo.exposedDeviceCount ?? null,
      critiques:     rExpo.criticalVulnerabilityCount ?? null,
      elevees:       rExpo.highVulnerabilityCount ?? null,
      total:         rExpo.totalVulnerabilityCount ?? null,
      recommandations: rExpo.recommendationCount ?? null,
      score:         typeof rExpo.riskExposureScore === 'number' ? Math.round(rExpo.riskExposureScore * 10) / 10 : null,
      /* `riskExposureDrift` vaut l'écart avec la plus ancienne valeur de la
         série, laquelle est parfois à zéro faute d'historique, si bien que la
         dérive vaudrait le score lui-même. On la recalcule sur les
         seules valeurs réelles, et on ne l'affiche pas s'il n'y en a qu'une. */
      derive:        passe.length > 1 ? Math.round((passe[0] - passe[passe.length - 1]) * 10) / 10 : null
    };
  }

  const rBase = ligneDuTenant(base, id);
  if (rBase) {
    const conformes = rBase.completeStepsCount ?? 0;
    const restantes = (rBase.incompleteStepsCount ?? 0) + (rBase.regressedStepsCount ?? 0);
    out.baseline = {
      nom:          rBase.managementTemplateCollectionDisplayName || 'Base de référence',
      conformes,
      incompletes:  rBase.incompleteStepsCount ?? null,
      regressees:   rBase.regressedStepsCount ?? null,
      total:        conformes + restantes || null,
      usagersIncomplets: rBase.incompleteUsersCount ?? null,
      usagersComplets:   rBase.completeUsersCount ?? null,
      sansLicence:  rBase.unlicensedUsersCount ?? null,
      termine:      rBase.isComplete === true
    };
  }

  const rIdent = ligneDuTenant(ident, id);
  if (rIdent) {
    out.identite = {
      pays:      rIdent.countryName || null,
      ville:     rIdent.city || null,
      region:    rIdent.region || null,
      segment:   rIdent.segmentName || null,
      /* Lighthouse renvoie littéralement « Unknown » et « N/A » quand le client
         n'a pas renseigné son secteur : afficher ces valeurs telles quelles
         ferait passer une absence de saisie pour une information. */
      industrie: (rIdent.industryName && !/^(n\/a|unknown)$/i.test(rIdent.industryName)) ? rIdent.industryName : null,
      vertical:  (rIdent.verticalName && !/^(n\/a|unknown)$/i.test(rIdent.verticalName)) ? rIdent.verticalName : null
    };
  }

  const rAdopt = ligneDuTenant(adopt, id);
  if (rAdopt) {
    const pc = v => typeof v === 'number' ? Math.round(v) : null;
    out.adoption = {
      arreteLe:      rAdopt.createdDateTime || null,
      communication: pc(rAdopt.communicationScoreInPercentage),
      collaboration: pc(rAdopt.contentCollaborationScoreInPercentage),
      flexibilite:   pc(rAdopt.flexibilityScoreInPercentage),
      santeApps:     pc(rAdopt.m365AppHealthScoreInPercentage),
      reseau:        pc(rAdopt.networkConnectScoreInPercentage),
      teamwork:      pc(rAdopt.teamworkScoreInPercentage)
    };
  }

  /* Conformité des appareils. Forme relevée le 2026-08-21 dans un export HAR du
     portail Lighthouse, l'entité ayant toujours répondu 403 chez nous : les noms
     de propriétés ci-dessous sont donc observés, plus devinés.

       managedDeviceName · complianceStatus · osDescription · osVersion
       ownerType · lastSyncDateTime · inGracePeriodUntilDateTime
       model · manufacturer · deviceType · tenantId · managedDeviceId

     `complianceStatus` prend exactement quatre valeurs, relevées sur l'agrégat
     du parc entier : Compliant, InGracePeriod, Noncompliant, Unknown. La période
     de grâce est un état à part et non une non-conformité : la machine est hors
     politique mais la contrainte n'est pas encore appliquée, ce qui n'appelle
     pas la même action. La confondre gonflerait le décompte des fautives.

     La lecture reste tolérante par précaution : c'est une API beta, et les noms
     de propriétés y ont déjà varié entre révisions. */
  const CPT_SEAU = { compliant: 'conforme', noncompliant: 'nonconforme', ingraceperiod: 'grace' };
  const normStatut = v => typeof v === 'string' && v ? v.toLowerCase().replace(/[\s_-]/g, '') : null;

  /* Décompte du parc entier, indépendant de la pagination de la liste. */
  const compte = { conforme: 0, nonconforme: 0, grace: 0, indetermine: 0 };
  let compteLu = false, totalAgg = 0;
  (Array.isArray(apparCpt?.value) ? apparCpt.value : []).forEach(r => {
    const n = r.complianceCount ?? r.count;
    if (typeof n !== 'number') return;
    compteLu = true;
    totalAgg += n;
    compte[CPT_SEAU[normStatut(r.complianceStatus)] || 'indetermine'] += n;
  });

  const rows = Array.isArray(appar?.value) ? appar.value : null;
  if (rows && rows.length) {
    /* Première valeur exploitable parmi plusieurs graphies. Les booléens sont
       volontairement écartés : le portail Lighthouse affiche littéralement
       « True » en colonne « SE » sur certaines lignes, faute de ce garde. */
    const champ = (r, noms) => {
      for (const n of noms) {
        const v = r[n];
        if (typeof v === 'string' && v.trim()) return v.trim();
        if (typeof v === 'number' && isFinite(v)) return String(v);
      }
      return null;
    };
    /* Sur un ticket, on cherche ce qui ne va pas, pas l'inventaire : les
       fautives remontent, la période de grâce ensuite, les conformes en fin. */
    const RANG = { nonconforme: 0, grace: 1, indetermine: 2, conforme: 3 };

    const listeCompte = { conforme: 0, nonconforme: 0, grace: 0, indetermine: 0 };
    const liste = rows.map(r => {
      const brut = champ(r, ['complianceStatus', 'complianceState', 'deviceComplianceStatus', 'status', 'state']);
      const etat = CPT_SEAU[normStatut(brut)] || 'indetermine';
      listeCompte[etat]++;
      return {
        nom:       champ(r, ['managedDeviceName', 'deviceName', 'displayName', 'name']),
        etat,
        etatBrut:  brut,
        os:        champ(r, ['osDescription', 'operatingSystem', 'platform', 'deviceType']),
        version:   champ(r, ['osVersion', 'operatingSystemVersion', 'osBuildNumber']),
        propriete: champ(r, ['ownerType', 'managedDeviceOwnerType', 'ownership']),
        vuLe:      champ(r, ['lastSyncDateTime', 'lastCheckInDateTime', 'lastContactDateTime', 'lastReportedDateTime'])
      };
      /* Les lignes sans nom sont écartées juste après : leur rang de tri
         n'a pas d'importance. */
    }).sort((x, y) => (RANG[x.etat] - RANG[y.etat])
                   || (x.nom || '').localeCompare(y.nom || '', 'fr', { numeric: true }));

    /* Le total vient de l'agrégat, sinon du @odata.count, et seulement en
       dernier recours du nombre de lignes reçues. Une liste tronquée dont on
       compterait les lignes annoncerait 100 appareils sur un parc de 865. */
    const totalOdata = typeof appar['@odata.count'] === 'number' ? appar['@odata.count'] : null;
    const total = compteLu ? totalAgg : (totalOdata ?? rows.length);
    const c = compteLu ? compte : listeCompte;

    if (c.indetermine < total) {
      out.appareils = {
        total,
        conformes:    c.conforme,
        nonConformes: c.nonconforme,
        grace:        c.grace,
        indetermines: c.indetermine,
        /* Vrai dès que la liste ne porte pas tout le parc, quelle que soit la
           taille de page réellement appliquée par le service. */
        tronque:      rows.length < total,
        affiches:     rows.length,
        /* Une ligne sans nom ne sert à rien dans une liste : elle reste dans
           les compteurs, pas à l'écran. */
        liste:        liste.filter(d => d.nom)
      };
    }
    /* Forme réelle de la première ligne, pour relever une graphie qui aurait
       change d'une révision beta à l'autre. */
    TP_GRAPH.dernierAppareil = rows[0];
  } else if (compteLu && compte.indetermine < totalAgg) {
    /* L'agrégat a répondu mais pas la liste : les chiffres valent d'être
       affichés même sans les noms. */
    out.appareils = {
      total: totalAgg, conformes: compte.conforme, nonConformes: compte.nonconforme,
      grace: compte.grace, indetermines: compte.indetermine,
      tronque: false, affiches: 0, liste: []
    };
  }

  /* Les alertes ne sont comptées que côté serveur (`$count=true`, `$top=1`) :
     rapatrier les alertes elles-mêmes n'apporterait rien ici et Lighthouse en
     porte des milliers. */
  const parGravite = {};
  let totalAlertes = 0, alerteLue = false;
  TP_GRAPH_SEVERITES.forEach((s, i) => {
    const n = alertes[i]?.['@odata.count'];
    if (typeof n !== 'number') return;
    alerteLue = true;
    parGravite[s] = n;
    totalAlertes += n;
  });
  if (alerteLue) out.alertes = { total: totalAlertes, parGravite };

  TP_GRAPH.dernierePosture = out;
  /* Aucun jeu n'a répondu : rien à afficher, et surtout pas une carte vide. */
  const utiles = ['secureScore', 'exposition', 'baseline', 'identite', 'adoption', 'alertes', 'appareils'];
  return utiles.some(k => out[k]) ? out : null;
}

/* Détail des refus et dernière charge utile, pour diagnostic en console. */
function graphDumpPosture() { return TP_GRAPH.dernierePosture || null; }

/* Première ligne brute de `managedDeviceCompliances`, pour relever les vraies
   graphies de ses propriétés. Elles n'ont jamais pu être observées : tant que
   `DeviceManagementManagedDevices.Read.All` n'est pas consentie, l'entité
   répond 403 et la liste d'appareils repose sur des noms de champs devinés. */
function graphDumpAppareil() { return TP_GRAPH.dernierAppareil || null; }

/* Interroge Graph pour un domaine. Retourne null si l'utilisateur n'est pas
   connecté : l'application doit rester entièrement fonctionnelle sans Graph,
   c'est un enrichissement, pas un prérequis. */
async function checkGraph(domain, tenantIdConnu) {
  if (!TP_GRAPH.connected) return null;

  const ctrl = new AbortController();
  stepControllers.graph = ctrl;
  try {
    const tenant  = await graphFindTenant(domain, ctrl.signal);
    const cible   = tenant?.tenantId || tenantIdConnu;
    /* MFA et posture visent le même tenant et ne dépendent pas l'un de l'autre. */
    const [mfa, posture] = await Promise.all([
      checkMfa(cible, ctrl.signal),
      checkPosture(cible, ctrl.signal)
    ]);
    if (!tenant && !mfa && !posture) return null;
    return { tenant, mfa, posture };
  } catch {
    return null;
  } finally {
    delete stepControllers.graph;
  }
}

/* ── Interface ───────────────────────────────────────────────────────────── */

/* Pastille dans la barre du haut, sur le modèle de l'état de l'extension :
   bouton d'appel à l'action tant que rien n'est connecté, pastille verte ensuite.
   Rien du tout si le déploiement n'a pas d'identifiant client configuré. */
function syncGraphUI() {
  const badge = document.getElementById('graphStatus');
  const cta   = document.getElementById('graphConnect');
  const label = document.getElementById('graphStatusLabel');
  if (!badge || !cta || !label) return;

  if (TP_GRAPH.connected) {
    label.textContent = 'Graph connecté';
    badge.title = TP_GRAPH.account?.username
      ? 'Microsoft Graph : ' + TP_GRAPH.account.username + ' (cliquer pour changer de compte ou se déconnecter)'
      : 'Microsoft Graph connecté (cliquer pour changer de compte ou se déconnecter)';
    badge.hidden = false; cta.hidden = true;
    return;
  }

  badge.hidden = true;
  cta.hidden   = !TP_GRAPH.clientId;
  cta.title    = TP_GRAPH.lastError
    ? 'Microsoft Graph : ' + TP_GRAPH.lastError
    : "Se connecter à Microsoft Graph pour enrichir l'analyse (nom du tenant, Secure Score, alertes et posture Lighthouse)";
}

/* Appelé au chargement, avant toute lecture du fragment par le reste de
   l'application : le retour d'Entra doit être consommé en premier. */
async function initGraph() {
  graphLoadSession();
  TP_GRAPH.clientId = TP_GRAPH.clientId || graphDevClientId();
  const consomme = await graphHandleRedirect();
  syncGraphUI();
  return consomme;
}

/* Publié explicitement : un `const` de premier niveau ne devient pas une propriété
   de window, et tenantpulse.js doit pouvoir tester `window.TP_GRAPH?.connected`
   sans exploser si ce fichier n'a pas été chargé. Graph est un enrichissement —
   son absence ne doit jamais casser l'analyse. */
window.TP_GRAPH = TP_GRAPH;
