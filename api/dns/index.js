const { getAuthContext } = require("../shared/auth");
const { isDnsRelayEnabled } = require("../shared/config");

/* Résolveur DoH amont. Même service que l'appel direct du navigateur : le relais ne
   change que le chemin emprunté, pas la source des réponses. */
const UPSTREAM = "https://cloudflare-dns.com/dns-query";
const UPSTREAM_TIMEOUT_MS = 8000;

/* Types interrogés par l'application (tenantpulse.js). Liste fermée : le relais ne doit
   pas devenir un résolveur généraliste ouvert. */
const ALLOWED_TYPES = ["A", "AAAA", "CAA", "CNAME", "DNSKEY", "DS", "MX", "NS", "SOA", "SRV", "TXT"];

/**
 * Normalise et valide un nom à résoudre.
 * Retourne le nom en forme ASCII (punycode) ou null s'il est refusé.
 *
 * Le passage par URL fait deux choses d'un coup : la conversion IDN (societé.fr →
 * xn--socit-esa.fr, que Cloudflare accepte sans ambiguïté) et l'extraction du seul
 * hostname — un « exemple.fr/autre » ne peut donc pas ressortir autrement que « exemple.fr ».
 * Les underscores sont autorisés : _dmarc, _mta-sts, selector1._domainkey, _sipfederationtls._tcp.
 */
function normalizeName(raw) {
  const s = String(raw || "").trim().replace(/\.$/, "");
  if (!s || s.length > 253) return null;
  if (/[\s/\\@:?#%]/.test(s)) return null; // schéma, chemin, port, identifiants, encodage
  let host;
  try { host = new URL("https://" + s).hostname; } catch { return null; }
  if (!host || host.length > 253 || host.startsWith("[")) return null; // [ = littéral IPv6
  const LABEL = /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/i;
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every(l => LABEL.test(l))) return null;
  return host;
}

/**
 * GET /api/dns?name=<fqdn>&type=<TYPE>
 *
 * Relais DNS-over-HTTPS de même origine. Réponse identique à celle de Cloudflare
 * (format JSON DoH : { Status, Answer: [...] }) — le frontend n'a rien à réinterpréter.
 *
 * Raison d'être : sur un poste géré, le pare-feu coupe fréquemment QUIC/UDP 443 vers
 * cloudflare-dns.com, et l'appel direct du navigateur meurt en ERR_QUIC_PROTOCOL_ERROR.
 * En passant par l'origine de l'application, la résolution emprunte la connexion qui
 * fonctionne déjà (celle qui sert la page et les autres appels /api).
 *
 * Accessible : tous les utilisateurs connectés et non bloqués. L'authentification n'est
 * pas décorative — sans elle, ce point d'entrée serait un résolveur DNS ouvert.
 */
module.exports = async function (context, req) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      context.res = {
        status: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Non authentifié" })
      };
      return;
    }
    if (auth.blocked) {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Compte bloqué" })
      };
      return;
    }

    /* Relais désactivé : on refuse. Le garde-fou n'est pas cosmétique — sans lui, le
       point d'entrée resterait appelable directement, hors interface, et la dépense
       serveur comme le transit des domaines analysés échapperaient à la décision admin. */
    if (!(await isDnsRelayEnabled())) {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Relais DNS désactivé" })
      };
      return;
    }

    const name = normalizeName(req.query && req.query.name);
    const type = String((req.query && req.query.type) || "").trim().toUpperCase();

    if (!name) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "name invalide (nom de domaine pleinement qualifié attendu)" })
      };
      return;
    }
    if (!ALLOWED_TYPES.includes(type)) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "type non supporté", allowed: ALLOWED_TYPES })
      };
      return;
    }

    const url = `${UPSTREAM}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;

    let upstream;
    try {
      upstream = await fetch(url, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
      });
    } catch (e) {
      context.log.warn(`Relais DNS : résolveur amont injoignable (${type}) — ${e.message}`);
      context.res = {
        status: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Résolveur DNS amont injoignable" })
      };
      return;
    }

    if (!upstream.ok) {
      context.log.warn(`Relais DNS : réponse ${upstream.status} du résolveur amont (${type})`);
      context.res = {
        status: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Réponse invalide du résolveur DNS amont" })
      };
      return;
    }

    let data;
    try { data = await upstream.json(); }
    catch {
      context.res = {
        status: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Réponse illisible du résolveur DNS amont" })
      };
      return;
    }

    /* Cache court : une analyse complète enchaîne une vingtaine de résolutions et l'outil
       sert aussi à vérifier une correction d'enregistrement — 60 s allège les invocations
       sans figer un TXT qu'on vient de modifier. « private » : jamais de cache partagé. */
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=60" },
      body: JSON.stringify(data)
    };

  } catch (err) {
    context.log.error("Erreur /api/dns :", err.message);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Erreur serveur" })
    };
  }
};
