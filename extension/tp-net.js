/* ──────────────────────────────────────────────────────────────────────────────
   tp-net.js — résolution du Tenant ID : les seuls appels réseau de l'extension.

   Chargé par le service worker (importScripts dans background.js), et par lui seul.
   C'est délibéré : un fetch émis depuis un script de contenu part avec l'origine de
   la page hôte, donc soumis au CORS de cette origine et à sa politique de sécurité
   de contenu — inutilisable sur une page tierce. Depuis le service worker, ce sont
   les « host_permissions » du manifest qui s'appliquent, et l'appel aboutit quelle
   que soit la page à l'origine de la demande.

   La popup comme le panneau injecté passent donc par un message « tp-lookup »
   adressé à background.js : une seule implémentation, un seul endroit où les
   endpoints publics interrogés sont listés.

   Dépend de tp-core.js (extractGuid, MS_GENERIC_GUIDS, GUID_ONLY_RE), chargé avant.
   Portage de checkMicrosoft / checkMicrosoftById / checkHealth (tenantpulse.js).
   ────────────────────────────────────────────────────────────────────────────── */

// ── Réseau : un AbortController par appel, délai borné ──
async function fetchJson(url, timeout = 8000, headers = null) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, headers ? { signal: ctrl.signal, headers } : { signal: ctrl.signal });
    clearTimeout(tid);
    if (!r.ok) return null;
    return await r.json();
  } catch { clearTimeout(tid); return null; }
}
async function fetchText(url, timeout = 8000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!r.ok) return null;
    return await r.text();
  } catch { clearTimeout(tid); return null; }
}

/* Validation de forme avant toute requête. Les demandes arrivent par message : même
   si seuls nos propres contextes peuvent en émettre, une valeur n'est jamais insérée
   telle quelle dans une URL sans avoir la forme attendue. */
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
function isPlausibleDomain(d) {
  return typeof d === 'string' && d.length > 0 && d.length <= 253 && DOMAIN_RE.test(d);
}
function isPlausibleGuid(g) {
  return typeof g === 'string' && GUID_ONLY_RE.test(g);
}

/* Valide un GUID de tenant auprès de l'endpoint OIDC (portage de validateTenantGuid). */
async function validateTenantGuid(guid) {
  const r = await fetchJson(`https://login.microsoftonline.com/${guid}/.well-known/openid-configuration`, 6000);
  if (!r || !r.issuer || !r.issuer.includes(guid)) return false;
  return !MS_GENERIC_GUIDS.has(guid.toLowerCase());
}

/* Recherche du tenant par domaine — portage de checkMicrosoft (tenantpulse.js).
   Endpoint OIDC public, puis repli sur les métadonnées de fédération. */
async function lookupByDomain(domain) {
  if (!isPlausibleDomain(domain)) return null;
  let tenantId = null, oidcData = null, tenantValid = false;
  const direct = await fetchJson(`https://login.microsoftonline.com/${domain}/.well-known/openid-configuration`);
  if (direct) {
    const c = extractGuid(direct.issuer) || extractGuid(direct.token_endpoint) || extractGuid(direct.authorization_endpoint);
    if (c && !MS_GENERIC_GUIDS.has(c.toLowerCase()) && direct.issuer && direct.issuer.includes(c)) {
      oidcData = direct; tenantId = c; tenantValid = true;
    }
  }
  if (!tenantId) {
    const x = await fetchText(`https://login.microsoftonline.com/${domain}/federationmetadata/2007-06/federationmetadata.xml`);
    if (x) {
      const c = extractGuid(x);
      if (c && !MS_GENERIC_GUIDS.has(c.toLowerCase()) && await validateTenantGuid(c)) { tenantId = c; tenantValid = true; }
    }
  }
  if (!tenantId) return null;
  return {
    tenantId, tenantValid,
    issuer: oidcData ? oidcData.issuer : null,
    tokenEndpoint: oidcData ? oidcData.token_endpoint : null,
  };
}

/* Recherche directe par Tenant ID — portage de checkMicrosoftById (tenantpulse.js). */
async function lookupById(tenantId) {
  if (!isPlausibleGuid(tenantId)) return null;
  const direct = await fetchJson(`https://login.microsoftonline.com/${tenantId}/.well-known/openid-configuration`);
  if (!direct || !direct.issuer || !direct.issuer.includes(tenantId) || MS_GENERIC_GUIDS.has(tenantId.toLowerCase())) return null;
  return { tenantId, tenantValid: true, issuer: direct.issuer, tokenEndpoint: direct.token_endpoint };
}

/* Nom de tenant SharePoint : le CNAME DKIM selector1 pointe vers « …<tenant>.onmicrosoft.com ».
   Requête DoH ciblée (même extraction que checkHealth dans tenantpulse.js) — c'est le seul
   appel DNS de l'extension, et il n'est déclenché que si la tuile SharePoint est active. */
async function lookupSpTenant(domain) {
  if (!isPlausibleDomain(domain)) return null;
  const d = await fetchJson(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent('selector1._domainkey.' + domain)}&type=CNAME`,
    8000, { Accept: 'application/dns-json' }
  );
  const answers = d && Array.isArray(d.Answer) ? d.Answer : [];
  for (const a of answers) {
    const m = (a.data || '').match(/([a-z0-9][a-z0-9-]*)\.onmicrosoft\.com/i);
    if (m) return m[1].toLowerCase();
  }
  return null;
}
