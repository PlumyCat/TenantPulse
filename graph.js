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
  'offline_access', 'openid', 'profile'
];

/* Portées demandées sur le tenant d'un CLIENT, via la délégation GDAP.
   AuditLog.Read.All couvre le rapport d'inscription aux méthodes
   d'authentification, d'où se déduit la couverture MFA.

   DelegatedAdminRelationship.Read.All a été retirée de la liste ci-dessus :
   l'affichage des relations GDAP ne servait pas le besoin. Le consentement reste
   accordé côté Entra, donc la réintroduire un jour ne coûtera qu'une ligne ici,
   sans nouvelle sollicitation d'un administrateur. */
const TP_GRAPH_TENANT_SCOPES = [
  'https://graph.microsoft.com/AuditLog.Read.All',
  'offline_access', 'openid', 'profile'
];

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
async function graphGet(path, signal, _retried = false) {
  const token = await graphToken();
  if (!token) return { ok: false, status: 0, data: null };

  let res;
  try {
    res = await fetch(TP_GRAPH_BASE + path, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal
    });
  } catch (e) {
    return { ok: false, status: 0, data: null, aborted: e?.name === 'AbortError' };
  }

  if (res.status === 401 && !_retried) {
    TP_GRAPH.expiresAt = 0;                       // force le renouvellement
    return graphGet(path, signal, true);
  }
  if ((res.status === 429 || res.status === 503) && !_retried) {
    const attente = Math.min(Number(res.headers.get('Retry-After')) || 2, 10) * 1000;
    await new Promise(r => setTimeout(r, attente));
    return graphGet(path, signal, true);
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

/* ── Palier 1 : jeton pour le tenant d'un client (banc d'essai) ──────────────

   Lire le MFA, le Secure Score ou les licences d'un client suppose un jeton émis
   pour SON tenant, obtenu grâce à la relation GDAP. La question ouverte, et elle
   décide de la forme du palier 1 : Entra accorde-t-il ce jeton **sans
   interaction**, en rejouant le jeton d'actualisation du tenant partenaire sur
   l'autorité du tenant client ?

   Si oui, un client analysé coûte un appel réseau et rien d'autre. Si non, il
   faut une redirection et un consentement par client, ce qui est inutilisable
   dans un outil de diagnostic — et le palier 1 devra alors changer de forme.

   Fonction de diagnostic, volontairement non branchée au pipeline.

   > Attention : Entra fait tourner les jetons d'actualisation. Un essai peut
   > invalider la session en cours. C'est sans gravité — il suffit de se
   > reconnecter — mais il ne faut pas s'en étonner.                            */

async function graphTokenForTenant(tenantId, scopes) {
  if (!TP_GRAPH.connected || !TP_GRAPH.refreshToken || !TP_GRAPH.clientId) {
    return { ok: false, raison: 'Aucune session Graph active.' };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(tenantId || ''))) {
    return { ok: false, raison: 'tenantId attendu sous forme de GUID.' };
  }

  /* Un jeton déjà obtenu pour ce tenant sert de point de départ : c'est la base
     d'un cache par tenant si le palier 1 se confirme. */
  TP_GRAPH.tenantTokens = TP_GRAPH.tenantTokens || {};
  const connu = TP_GRAPH.tenantTokens[tenantId];
  const rt    = (connu && connu.refreshToken) || TP_GRAPH.refreshToken;

  const body = new URLSearchParams({
    client_id:     TP_GRAPH.clientId,
    grant_type:    'refresh_token',
    refresh_token: rt,
    scope:         (Array.isArray(scopes) && scopes.length ? scopes : TP_GRAPH_SCOPES).join(' ')
  });

  let res, data;
  try {
    res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString()
    });
    data = await res.json().catch(() => null);
  } catch {
    return { ok: false, raison: "Requête refusée avant réponse (CORS ou réseau)." };
  }

  if (!res.ok || !data?.access_token) {
    return {
      ok: false, status: res.status,
      erreur: data?.error || null,
      description: data?.error_description || null,
      /* Lecture des codes les plus probables, pour que le résultat se passe
         d'interprétation. */
      diagnostic:
        data?.error === 'invalid_grant'          ? "Consentement ou accès manquant sur le tenant client — une interaction serait nécessaire."
        : data?.error === 'interaction_required' ? "Entra exige une interaction : pas de jeton silencieux pour ce tenant."
        : data?.error === 'unauthorized_client'  ? "L'application n'est pas autorisée sur ce tenant."
        : null
    };
  }

  TP_GRAPH.tenantTokens[tenantId] = {
    accessToken:  data.access_token,
    expiresAt:    Date.now() + (Number(data.expires_in) || 3600) * 1000,
    refreshToken: data.refresh_token || rt
  };
  return { ok: true, tenant: tenantId, expiresIn: data.expires_in, portees: data.scope };
}

/* ── Étape d'analyse ─────────────────────────────────────────────────────── */

/* ── MFA du tenant client ────────────────────────────────────────────────────

   Le rapport d'inscription aux méthodes d'authentification, lu dans le tenant du
   client. C'est la mesure qui compte : combien d'utilisateurs n'ont aucune
   méthode d'authentification forte enregistrée, et surtout combien parmi les
   administrateurs.

   Deux prérequis, tous deux hors du code :
     1. Un jeton pour le tenant du client, obtenu par graphTenantToken() grâce à
        la délégation GDAP. Si Entra exige une interaction, rien n'est possible.
     2. La portée AuditLog.Read.All consentie sur l'inscription d'application.

   Les invités sont comptés à part : ils s'authentifient sur leur tenant
   d'origine, les inclure fausserait le pourcentage vers le bas.               */

/* Jeton valide pour un tenant client, renouvelé 2 minutes avant l'échéance. */
async function graphTenantToken(tenantId) {
  const cache = (TP_GRAPH.tenantTokens || {})[tenantId];
  if (cache && Date.now() < cache.expiresAt - 120000) return cache.accessToken;
  const r = await graphTokenForTenant(tenantId, TP_GRAPH_TENANT_SCOPES);
  return r.ok ? TP_GRAPH.tenantTokens[tenantId].accessToken : null;
}

/* Lecture Graph sur le tenant d'un client. Même contrat que graphGet : ne lève
   jamais, retourne { ok, status, data }. */
async function graphGetTenant(tenantId, path, signal) {
  const token = await graphTenantToken(tenantId);
  if (!token) return { ok: false, status: 0, data: null, refus: true };
  let res;
  try {
    res = await fetch(TP_GRAPH_BASE + path, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, signal
    });
  } catch (e) { return { ok: false, status: 0, data: null, aborted: e?.name === 'AbortError' }; }
  if (res.status === 429 || res.status === 503) {
    const attente = Math.min(Number(res.headers.get('Retry-After')) || 2, 10) * 1000;
    await new Promise(r => setTimeout(r, attente));
    return graphGetTenant(tenantId, path, signal);
  }
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

async function checkMfa(tenantId, signal) {
  if (!tenantId) return null;

  const users = [];
  let next  = '/reports/authenticationMethods/userRegistrationDetails?$top=500';
  let pages = 0;

  while (next && pages < 20) {           // 10 000 comptes, bien au-delà d'un client type
    pages++;
    const r = await graphGetTenant(tenantId, next, signal);
    if (!r.ok) {
      /* On distingue les causes : elles n'appellent pas la même action, et un
         message unique « erreur » ferait perdre du temps à tout le monde. */
      if (r.refus)          return { erreur: 'jeton', message: "Impossible d'obtenir un jeton sur ce tenant. La délégation GDAP ne couvre pas ce client, ou Entra exige une interaction." };
      if (r.status === 403) return { erreur: 'portee', message: "Accès refusé. La portée AuditLog.Read.All n'est pas consentie, ou votre rôle délégué sur ce client ne permet pas de lire les rapports." };
      if (r.status === 404) return { erreur: 'licence', message: "Rapport indisponible sur ce tenant. Il demande généralement une licence Entra ID P1 ou P2." };
      return { erreur: 'http', message: 'Réponse inattendue de Graph (HTTP ' + r.status + ').' };
    }
    (r.data?.value || []).forEach(u => users.push(u));
    const lien = r.data?.['@odata.nextLink'];
    next = (typeof lien === 'string' && lien.startsWith(TP_GRAPH_BASE + '/'))
      ? lien.slice(TP_GRAPH_BASE.length) : null;
  }

  const membres = users.filter(u => String(u.userType || '').toLowerCase() !== 'guest');
  const total   = membres.length;
  if (!total) return { total: 0, invites: users.length };

  const sansMfa       = membres.filter(u => u.isMfaRegistered === false);
  const admins        = membres.filter(u => u.isAdmin === true);
  const adminsSansMfa = admins.filter(u => u.isMfaRegistered === false);

  return {
    total,
    sansMfa:        sansMfa.length,
    avecMfa:        total - sansMfa.length,
    pourcentAvecMfa: Math.round(((total - sansMfa.length) / total) * 100),
    admins:         admins.length,
    adminsSansMfa:  adminsSansMfa.length,
    /* Noms des admins sans MFA : c'est la liste sur laquelle on agit le jour même.
       Plafonnée, le panneau n'est pas un export. */
    adminsNoms:     adminsSansMfa.slice(0, 10).map(u => u.userPrincipalName).filter(Boolean),
    invites:        users.length - total
  };
}

/* Interroge Graph pour un domaine. Retourne null si l'utilisateur n'est pas
   connecté : l'application doit rester entièrement fonctionnelle sans Graph,
   c'est un enrichissement, pas un prérequis. */
async function checkGraph(domain, tenantIdConnu) {
  if (!TP_GRAPH.connected) return null;

  const ctrl = new AbortController();
  stepControllers.graph = ctrl;
  try {
    const tenant = await graphFindTenant(domain, ctrl.signal);
    const mfa    = await checkMfa(tenant?.tenantId || tenantIdConnu, ctrl.signal);
    if (!tenant && !mfa) return null;
    return { tenant, mfa };
  } catch {
    return null;
  } finally {
    delete stepControllers.graph;
  }
}

/* ── Rendu ───────────────────────────────────────────────────────────────── */

function graphCardSub(g) {
  const bouts = [];
  if (g.tenant?.displayName)       bouts.push(g.tenant.displayName);
  if (g.tenant?.defaultDomainName) bouts.push(g.tenant.defaultDomainName);
  if (!bouts.length && g.tenant?.found === false) bouts.push('Domaine hors Entra ID');
  return bouts.join(' · ') || 'Informations tenant';
}

function graphCardBadge(g) {
  const m = g.mfa;
  if (!m || m.erreur || !m.total) return 'Tenant';
  return 'MFA ' + m.pourcentAvecMfa + ' %';
}

function buildGraphPanel(g) {
  return b => {
    const t = g.tenant;
    if (t?.found === false) {
      addRow(b, 'Tenant Entra ID', "Aucun tenant ne revendique ce domaine.");
    } else if (t) {
      if (t.displayName)       addRow(b, 'Nom du tenant',      t.displayName, 'hi-ms');
      if (t.defaultDomainName) addRow(b, 'Domaine par défaut', t.defaultDomainName);
      if (t.tenantId)          addRow(b, 'Tenant ID',          t.tenantId);
      if (t.federationBrand)   addRow(b, 'Marque de fédération', t.federationBrand);
    }

    const m = g.mfa;
    if (!m) return;

    const sub = document.createElement('div');
    sub.className = 'hc-subhead';
    sub.textContent = 'Authentification multifacteur';
    b.appendChild(sub);

    if (m.erreur) {
      addRow(b, 'Lecture impossible', m.message, 'hi-warn');
      if (m.erreur === 'jeton' && TP_GRAPH.account?.username) {
        addRow(b, 'Compte utilisé', TP_GRAPH.account.username);
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'admin-btn';
        btn.textContent = 'Se connecter avec un autre compte';
        btn.addEventListener('click', () => { graphDisconnect(); graphBeginLogin(true); });
        b.appendChild(btn);
      }
      return;
    }

    if (!m.total) { addRow(b, 'Comptes', 'Aucun compte membre dans ce tenant.'); return; }

    const alerte = m.pourcentAvecMfa < 90;
    addRow(b, 'Couverture MFA', m.pourcentAvecMfa + ' % des comptes membres', alerte ? 'hi-warn' : 'hi-ms');
    addRow(b, 'Sans MFA', m.sansMfa + ' compte(s) sur ' + m.total);

    if (m.admins) {
      addRow(b, 'Administrateurs sans MFA',
        m.adminsSansMfa + ' sur ' + m.admins,
        m.adminsSansMfa > 0 ? 'hi-warn' : '');
      if (m.adminsNoms?.length) addRow(b, 'Comptes concernés', m.adminsNoms.join('\n'));
    }
    if (m.invites) addRow(b, 'Invités exclus du calcul', String(m.invites));
  };
}

/* Carte de résultat. Construite ici plutôt que dans tenantpulse.js pour que tout
   ce qui touche à Graph reste dans un seul fichier — makeCard et openPanel sont
   des helpers globaux, disponibles à l'exécution. */
function makeGraphCard(g) {
  return makeCard({
    id:       'graph',
    iconEl:   makeImgIcon('assets/Microsoft.png', 'Microsoft Graph', 20),
    iconBg:   'ms-clr',
    title:    'Microsoft Graph',
    sub:      graphCardSub(g),
    badge:    graphCardBadge(g),
    badgeCls: 'ms-b',
    selCls:   'selected',
    onClick:  () => openPanel('graph', 'Microsoft Graph', buildGraphPanel(g))
  });
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
      ? 'Microsoft Graph — ' + TP_GRAPH.account.username + ' (cliquer pour se déconnecter)'
      : 'Microsoft Graph connecté (cliquer pour se déconnecter)';
    badge.hidden = false; cta.hidden = true;
    return;
  }

  badge.hidden = true;
  cta.hidden   = !TP_GRAPH.clientId;
  cta.title    = TP_GRAPH.lastError
    ? 'Microsoft Graph — ' + TP_GRAPH.lastError
    : "Se connecter à Microsoft Graph pour enrichir l'analyse (nom du tenant, couverture MFA)";
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
