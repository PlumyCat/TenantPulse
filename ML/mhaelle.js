/* ──────────────────────────────────────────────────────────────
   Mhaelle — Analyseur Header Email V9 PRO
   Script externe (CSP-compliant : script-src 'self')

   Conformité :
   - Aucun appel réseau externe (analyse 100 % locale en navigateur)
   - Aucun localStorage / cookie / stockage persistant
   - Aucune collecte de mot de passe ni d'identifiant
   - Construction DOM via createElement / textContent (pas d'innerHTML
     sur entrées utilisateur)
   - Pas d'inline event handlers ni d'inline styles
   ────────────────────────────────────────────────────────────── */

/* ── Détection mode embarqué (iframe TenantPulse) ──
   Exécutée immédiatement à l'évaluation du script (depuis <head>),
   avant le rendu du <body>, pour éviter le flash de la navbar. */
(function detectEmbedded() {
  try {
    var embedded = window.self !== window.top || /[?&]embedded=1/.test(location.search);
    if (embedded) document.documentElement.classList.add('embedded');
  } catch (e) { /* sandbox restriction */ }
})();

/* ── Synchronisation thème clair / sombre ──
   Stratégie double :
   1. Accès DOM direct au parent (fonctionne sur serveur, même origine HTTP/S)
   2. postMessage de TenantPulse (fonctionne aussi sur file://)
   Mode standalone : préférence système via matchMedia.
   Exécuté depuis <head> pour éviter le flash (FOUC). */
(function syncTheme() {
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme || 'light');
  }
  try {
    if (window.self !== window.top) {
      /* ── Embarqué (iframe) ── */

      /* 1. Accès DOM direct — marche sur serveur (même origine HTTP/S) */
      try {
        var parentHtml = window.parent.document.documentElement;
        var t = parentHtml.getAttribute('data-theme');
        if (t) applyTheme(t);
        new MutationObserver(function () {
          applyTheme(parentHtml.getAttribute('data-theme'));
        }).observe(parentHtml, { attributes: true, attributeFilter: ['data-theme'] });
      } catch (e) { /* accès bloqué (file://) — on se rabat sur postMessage */ }

      /* 2. postMessage — fiable sur file:// et toute origine.
         Vérification d'origine : on n'accepte que les messages du parent
         de même origine (ou origine opaque 'null' sur file://). */
      window.addEventListener('message', function (e) {
        /* Rejet des messages provenant d'une origine non fiable. */
        var parentOrigin;
        try { parentOrigin = window.parent.location.origin; } catch (ex) { parentOrigin = null; }
        var isSameOrigin = parentOrigin !== null && parentOrigin === location.origin;
        var isFileMode   = location.origin === 'null' || location.origin === 'file://';
        var isOpaqueNull = e.origin === 'null';
        if (!isSameOrigin && !(isFileMode && isOpaqueNull)) return;
        if (!e.data) return;
        if (e.data.type === 'tp-theme') applyTheme(e.data.theme);
        if (e.data.type === 'ml-profile') {
          try { localStorage.setItem(ML_PROFILE_KEY, JSON.stringify(e.data.profile)); } catch {}
          /* Re-rendre si des headers sont déjà analysés */
          var hdr = document.getElementById('header');
          if (hdr && hdr.value.trim()) {
            /* Petit délai pour laisser le localStorage se propager */
            setTimeout(function () { analyse(); }, 0);
          }
        }
      });

    } else {
      /* ── Standalone — suit la préférence système ── */
      var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      if (mq) {
        applyTheme(mq.matches ? 'dark' : 'light');
        mq.addEventListener('change', function (e) {
          applyTheme(e.matches ? 'dark' : 'light');
        });
      }
    }
  } catch (e) { /* absence de support navigateur */ }
})();

/* ────────────────────────────────────────────────────────────── */
/* Constantes                                                     */
/* ────────────────────────────────────────────────────────────── */

const STATIC_TOOLS = [
  { name: "Google Message Header", url: "https://toolbox.googleapps.com/apps/messageheader/", desc: "Analyse complète des headers" },
  { name: "Microsoft Header Analyzer", url: "https://mha.azurewebsites.net/", desc: "Outil officiel Microsoft" },
  { name: "Gaijin Header Analyzer", url: "https://www.gaijin.at/en/tools/e-mail-header-analyzer", desc: "Visualisation des hops" },
  { name: "IPQualityScore Email Validator", url: "https://www.ipqualityscore.com/email-verification/validate", desc: "Validation email" },
  { name: "VirusTotal", url: "https://www.virustotal.com/", desc: "IP, URL, hash" },
  { name: "URLScan.io", url: "https://urlscan.io/", desc: "Analyse de pages web" },
  { name: "AbuseIPDB", url: "https://www.abuseipdb.com/", desc: "Réputation IP" },
  { name: "Talos Intelligence", url: "https://talosintelligence.com/reputation_center", desc: "Réputation Cisco" },
  { name: "DNSChecker Tools", url: "https://dnschecker.org/", desc: "SPF, DNS, blacklist" },
  { name: "DMARCian Inspector", url: "https://dmarcian.com/dmarc-inspector/", desc: "Politique DMARC" },
  { name: "DKIMCore Validator", url: "https://dkimvalidator.com/", desc: "Test DKIM" },
  { name: "PhishTool", url: "https://phishtool.com/", desc: "Headers + IOCs" },
  { name: "Have I Been Pwned", url: "https://haveibeenpwned.com/", desc: "Fuites de comptes" },
  { name: "OpenPhish / PhishTank", url: "https://phishtank.org/", desc: "URLs de phishing connues" },
];

let lastReports = { client: "", tech: "" };

/* ── Profil Mhaelle : ordre et visibilité des blocs ── */
const ML_PROFILE_KEY = 'mhaelle_profile_v1';
const ML_BLOCKS_DEFAULT = {
  left:        ['message', 'smtp', 'urls', 'reports'],
  right:       ['auth', 'ms', 'signals'],
  hidden:      [],
  defaultOpen: []
};
function loadMlProfile() {
  try {
    const raw = localStorage.getItem(ML_PROFILE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p.left) && Array.isArray(p.right)) {
        if (!Array.isArray(p.defaultOpen)) p.defaultOpen = [];
        return p;
      }
    }
  } catch {}
  return {
    left:        [...ML_BLOCKS_DEFAULT.left],
    right:       [...ML_BLOCKS_DEFAULT.right],
    hidden:      [],
    defaultOpen: []
  };
}

/* ────────────────────────────────────────────────────────────── */
/* Helpers DOM (CSP-safe : pas d'innerHTML)                       */
/* ────────────────────────────────────────────────────────────── */

/**
 * Crée un élément DOM avec attributs, classes, styles et enfants.
 * Tous les enfants string sont insérés via textContent → 0 XSS.
 */
function el(tag, props, ...children) {
  const e = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
  }
  children.flat().forEach(c => {
    if (c == null || c === false) return;
    if (typeof c === 'string' || typeof c === 'number') {
      e.appendChild(document.createTextNode(String(c)));
    } else {
      e.appendChild(c);
    }
  });
  return e;
}

/** Construit un lien externe sécurisé (target=_blank + rel=noopener). */
function extLink(href, text, className) {
  return el('a', { href, target: '_blank', rel: 'noopener noreferrer', class: className || 'tool-btn' }, text);
}

/** Nettoie une valeur pour affichage texte : supprime caractères de contrôle. */
function clean(v) {
  if (v == null) return "";
  return String(v).replace(/[\x00-\x1F\x7F]/g, "");
}

/* ────────────────────────────────────────────────────────────── */
/* Bases de connaissances — détection phishing                    */
/* (constantes locales, aucun appel réseau)                       */
/* ────────────────────────────────────────────────────────────── */

/** Marques fréquemment usurpées (contexte FR + international). */
const BRAND_KEYWORDS = [
  // Tech / SaaS
  "microsoft", "office365", "outlook", "onedrive", "sharepoint", "teams",
  "google", "gmail", "googledrive", "apple", "icloud", "amazon", "amazonaws",
  "facebook", "instagram", "linkedin", "whatsapp", "twitter",
  "dropbox", "wetransfer", "docusign", "adobe", "github", "netflix", "spotify", "disney",
  // Paiement
  "paypal", "stripe", "wise", "n26", "revolut",
  // Banques FR
  "bnpparibas", "creditagricole", "societegenerale", "lcl", "caisse-epargne", "caisseepargne",
  "banquepopulaire", "cic", "boursorama", "fortuneo", "hellobank", "monabanq", "ing",
  // Administration FR
  "impots", "impots-gouv", "ameli", "urssaf", "service-public", "dgfip", "ants",
  "pole-emploi", "caf", "msa", "cpam", "douane",
  // Livraison
  "colissimo", "chronopost", "laposte", "dpd", "fedex", "ups", "mondialrelay", "geodis", "dhl",
  // E-commerce / loisirs FR
  "cdiscount", "fnac", "leboncoin", "vinted", "rakuten", "darty", "boulanger",
  // Opérateurs FR
  "orange", "sfr", "bouygues", "bouyguestelecom", "free", "freemobile",
];

/** Domaines légitimes officiels (pour confirmer un mismatch suspect). */
const OFFICIAL_DOMAIN_PATTERN = /\.(microsoft|office|google|apple|amazon|facebook|linkedin|paypal|stripe|dropbox|wetransfer|docusign|adobe|netflix|github|bnpparibas|credit-agricole|societegenerale|lcl|caisse-epargne|banquepopulaire|impots\.gouv|ameli|urssaf|service-public\.fr|gouv\.fr|laposte|chronopost|colissimo|orange|sfr|bouyguestelecom|free)\.(fr|com|net|org)$/i;

/** Raccourcisseurs d'URL. */
const URL_SHORTENERS = [
  "bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "is.gd", "buff.ly",
  "rebrand.ly", "cutt.ly", "lnkd.in", "tiny.cc", "shorte.st", "adf.ly",
  "tr.im", "fb.me", "rb.gy", "qr.ae"
];

/** Mots-clés d'urgence dans le sujet (FR + EN). */
const URGENCY_PATTERNS = [
  { rx: /\b(urgent|urgence)\b/i,                label: "Urgence" },
  { rx: /\b(immédiat|immediate(ly)?|now)\b/i,   label: "Immédiateté" },
  { rx: /\baction requise\b/i,                  label: "Action requise" },
  { rx: /\baction required\b/i,                 label: "Action required" },
  { rx: /\bsous \d+\s*h\b/i,                    label: "Délai très court" },
  { rx: /\bwithin \d+\s*h(ours?)?\b/i,          label: "Short deadline" },
  { rx: /\b(expir|expire|expiration)\b/i,       label: "Expiration" },
  { rx: /\b(suspend|suspendu|blocked|bloqué)\b/i, label: "Compte/service bloqué" },
  { rx: /\b(confirm(ez|er|ation)?|verify|vérif)/i, label: "Demande de confirmation" },
  { rx: /\b(reset|réinitialis)/i,               label: "Réinitialisation" },
  { rx: /\b(rembours|refund)/i,                 label: "Remboursement" },
  { rx: /\b(facture|invoice|payment|paiement)\b/i, label: "Facture/paiement" },
  { rx: /\b(identi(té|fier|fication)|identity)\b/i, label: "Vérification identité" },
];

/* ────────────────────────────────────────────────────────────── */
/* Détecteurs spécialisés                                          */
/* ────────────────────────────────────────────────────────────── */

/**
 * Détecte un mélange Latin + alphabet visuellement similaire
 * (Cyrillic, Greek, Hebrew, Armenian) dans la même chaîne — technique
 * d'usurpation #1 en 2024-2025.
 */
function hasHomoglyph(str) {
  if (!str) return false;
  const hasLatin = /[a-zA-Z]/.test(str);
  // Cyrillic, Greek, Hebrew, Armenian, fullwidth Latin
  const hasLookalike = /[Ѐ-ӿͰ-Ͽ֐-׿԰-֏Ａ-ｚ]/.test(str);
  return hasLatin && hasLookalike;
}

/** Détecte un domaine en notation Punycode (IDN). */
function hasPunycode(domain) {
  return /(^|\.)xn--/i.test(domain || "");
}

/**
 * Parse une date d'en-tête email en timestamp ; renvoie null si invalide.
 */
function parseEmailDate(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}

/**
 * Cohérence temporelle : compare l'en-tête Date au timestamp du
 * dernier hop Received (le plus récent — celui de destination).
 * Renvoie l'écart en heures (positif si Date > Received).
 */
function temporalDelta(dateHeader, receivedHops) {
  const d = parseEmailDate(dateHeader);
  if (!d || !receivedHops.length) return null;
  // Le dernier hop dans l'ordre du tableau (déjà reversed) = destination = plus récent
  const lastHop = receivedHops[receivedHops.length - 1];
  const rd = parseEmailDate(lastHop.date);
  if (!rd) return null;
  return (d - rd) / 3600000; // heures
}

/**
 * Détecte les conflits entre plusieurs blocs Authentication-Results
 * (un attaquant peut injecter un faux bloc).
 */
function authResultsConflict(blocks) {
  if (blocks.length < 2) return false;
  const fields = ['spf', 'dkim', 'dmarc'];
  for (const f of fields) {
    const values = new Set(blocks.map(b => b[f]).filter(v => v && v !== 'inconnu'));
    if (values.has('pass') && values.has('fail')) return f;
  }
  return false;
}

/**
 * Détecte un display name qui imite une marque sans correspondance
 * de domaine ET avec homoglyphe potentiel.
 */
function displayNameDeception(displayName, fromDomain) {
  if (!displayName) return null;
  const dn = displayName.toLowerCase();
  const homoglyph = hasHomoglyph(displayName);
  const matchedBrand = BRAND_KEYWORDS.find(b => dn.includes(b));
  if (!matchedBrand) return homoglyph ? { brand: null, homoglyph: true } : null;
  // Vérifier alignement avec le domaine réel
  const aligned = fromDomain && fromDomain.includes(matchedBrand);
  if (!aligned) return { brand: matchedBrand, homoglyph };
  return homoglyph ? { brand: matchedBrand, homoglyph: true, aligned: true } : null;
}

/* ────────────────────────────────────────────────────────────── */
/* Parsing                                                         */
/* ────────────────────────────────────────────────────────────── */

function decodeMime(str) {
  if (!str) return "";
  try {
    return str.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_, cs, enc, data) => {
      if (enc.toUpperCase() === "B") {
        return atob(data.replace(/\s/g, ""));
      }
      return decodeURIComponent(data.replace(/_/g, " ").replace(/=([A-F0-9]{2})/gi, "%$1"));
    });
  } catch { return str; }
}

function getValue(regex, text, def = "Non trouvé") {
  const m = text.match(regex);
  return m ? m[1].trim() : def;
}

function extractEmail(v) {
  const m = v.match(/<([^>]+)>/) || v.match(/([\w.%+-]+@[\w.-]+\.\w+)/);
  return m ? m[1].toLowerCase() : "";
}

function extractDomain(v) {
  const e = extractEmail(v) || v;
  const m = e.match(/@([a-zA-Z0-9.-]+)/);
  return m ? m[1].toLowerCase() : "inconnu";
}

function extractDisplayName(v) {
  const m = v.match(/^(.+?)\s*</);
  return m ? decodeMime(m[1].replace(/^["']|["']$/g, "").trim()) : "";
}

function statusClass(s) {
  if (!s) return "status-unknown";
  const x = s.toLowerCase();
  if (x === "pass" || x === "bestguesspass") return "status-pass";
  if (x === "fail") return "status-fail";
  if (["softfail", "neutral", "none", "temperror", "permerror"].includes(x)) return "status-softfail";
  return "status-unknown";
}

function parseAuthResults(h) {
  const blocks = [];
  const re = /^Authentication-Results:\s*([^\n]*(?:\n[ \t]+[^\n]*)*)/gim;
  let m;
  while ((m = re.exec(h)) !== null) {
    const block = m[0].replace(/\n[ \t]+/g, " ");
    const host = (block.match(/^Authentication-Results:\s*(\S+)/i) || [])[1] || "?";
    const pick = (key) => {
      const r = new RegExp(key + "\\s*=\\s*([\\w.-]+)", "i");
      const k = block.match(r);
      return k ? k[1].toLowerCase() : "inconnu";
    };
    blocks.push({
      host,
      spf: pick("spf"),
      dkim: pick("dkim"),
      dmarc: pick("dmarc"),
      compauth: pick("compauth"),
      arc: /arc=pass/i.test(block) ? "pass" : (/arc=fail/i.test(block) ? "fail" : "inconnu"),
    });
  }
  if (!blocks.length) {
    const l = h.toLowerCase();
    return [{
      host: "détection simple",
      spf: l.includes("spf=pass") ? "pass" : l.includes("spf=fail") ? "fail" : "inconnu",
      dkim: l.includes("dkim=pass") ? "pass" : l.includes("dkim=fail") ? "fail" : "inconnu",
      dmarc: l.includes("dmarc=pass") ? "pass" : l.includes("dmarc=fail") ? "fail" : "inconnu",
      compauth: l.includes("compauth=pass") ? "pass" : l.includes("compauth=fail") ? "fail" : "inconnu",
      arc: "inconnu",
    }];
  }
  return blocks;
}

function parseReceived(h) {
  const lines = h.split(/\r?\n/);
  const received = [];
  let cur = "";
  for (const line of lines) {
    if (/^Received:/i.test(line)) {
      if (cur) received.push(cur);
      cur = line;
    } else if (/^\s/.test(line) && cur) {
      cur += " " + line.trim();
    } else if (cur) {
      received.push(cur);
      cur = "";
    }
  }
  if (cur) received.push(cur);
  return received.reverse().map((raw, i) => {
    const ips = [...raw.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)].map(x => x[0]);
    const helo = (raw.match(/from\s+([^\s\[\(]+)/i) || [])[1] || "";
    const by = (raw.match(/\bby\s+([^\s\[\(]+)/i) || [])[1] || "";
    const date = (raw.match(/;\s*(.+)$/i) || [])[1] || "";
    const tls = /TLS|ESMTPS/i.test(raw);
    return { index: i + 1, raw, ips, helo, by, date, tls };
  });
}

function parseForefront(h) {
  const m = h.match(/X-Forefront-Antispam-Report:\s*(.*)/i);
  if (!m) return {};
  const c = m[1];
  const g = f => {
    const r = new RegExp(f + ":([^;\\s]*)", "i");
    const k = c.match(r);
    return k ? k[1].trim() : "Non trouvé";
  };
  return {
    SCL: g("SCL"), CAT: g("CAT"), SFV: g("SFV"), CTRY: g("CTRY"),
    PTR: g("PTR"), CIP: g("CIP"), H: g("H"), LANG: g("LANG"), DIR: g("DIR"),
  };
}

function interpretCAT(cat) {
  const map = {
    PHSH: "Phishing", HPHSH: "Phishing (high)", MALW: "Malware", SPM: "Spam",
    BULK: "Newsletter", AMP: "Anti-malware", FTBP: "Phishing filter", NONE: "Aucune",
  };
  return map[cat] || (cat === "Non trouvé" ? "Non trouvé" : "Inconnu (" + cat + ")");
}

function interpretSCL(scl) {
  const n = parseInt(scl, 10);
  if (isNaN(n)) return "Non évalué";
  if (n <= 1) return "Très probablement légitime";
  if (n <= 4) return "Probablement légitime / gris";
  if (n <= 6) return "Suspect, modération possible";
  if (n <= 8) return "Probablement spam";
  return "Très probablement spam / blocage";
}

function extractUrls(h) {
  return [...h.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)].map(m => clean(m[0]));
}

function getUrlDomain(u) {
  try { return new URL(u).hostname.toLowerCase(); }
  catch { return "invalide"; }
}

function isPrivateIP(ip) {
  if (!ip) return true;
  const p = ip.split(".").map(Number);
  if (p[0] === 10) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 127) return true;
  return false;
}

/* ────────────────────────────────────────────────────────────── */
/* Liens outils (uniquement vers des sites tiers réputés)         */
/* ────────────────────────────────────────────────────────────── */

function toolLinks(type, value) {
  const enc = encodeURIComponent(value);
  const links = [];
  if (type === "ip") {
    links.push({ n: "VirusTotal IP", u: `https://www.virustotal.com/gui/ip-address/${enc}` });
    links.push({ n: "AbuseIPDB", u: `https://www.abuseipdb.com/check/${enc}` });
    links.push({ n: "Talos", u: `https://talosintelligence.com/reputation_center/lookup?search=${enc}` });
    links.push({ n: "multiRBL Blacklist", u: `https://multirbl.valli.org/lookup/${enc}.html` });
    links.push({ n: "Shodan", u: `https://www.shodan.io/host/${enc}` });
    links.push({ n: "GreyNoise", u: `https://viz.greynoise.io/ip/${enc}` });
  }
  if (type === "domain") {
    links.push({ n: "VirusTotal Domain", u: `https://www.virustotal.com/gui/domain/${enc}` });
    links.push({ n: "DNS Records", u: `https://dnschecker.org/all-dns-records-of-domain.php?query=${enc}&rtype=ALL&dns=google` });
    links.push({ n: "SPF Record", u: `https://easydmarc.com/tools/spf-lookup?domain=${enc}` });
    links.push({ n: "DMARC Record", u: `https://easydmarc.com/tools/dmarc-lookup?domain=${enc}` });
    links.push({ n: "WHOIS", u: `https://who.is/whois/${enc}` });
    links.push({ n: "URLhaus", u: `https://urlhaus.abuse.ch/browse.php?search=${enc}` });
  }
  if (type === "url") {
    let b64 = "";
    try { b64 = btoa(value).replace(/=/g, ""); } catch { b64 = enc; }
    links.push({ n: "VirusTotal URL", u: `https://www.virustotal.com/gui/url/${b64}` });
    links.push({ n: "URLScan", u: `https://urlscan.io/search/#${enc}` });
    links.push({ n: "Google Safe Browsing", u: `https://transparencyreport.google.com/safe-browsing/search?url=${enc}` });
    links.push({ n: "PhishTank", u: `https://www.phishtank.com/phish_search.php?url=${enc}` });
  }
  if (type === "email") {
    links.push({ n: "HIBP", u: `https://haveibeenpwned.com/` });
    links.push({ n: "EmailRep", u: `https://emailrep.io/${enc}` });
  }
  return links.map(l => extLink(l.u, l.n + " ↗"));
}

/* ────────────────────────────────────────────────────────────── */
/* Analyse heuristique des URLs                                   */
/* ────────────────────────────────────────────────────────────── */

/**
 * Analyse les URLs et retourne des signaux pondérés (axis: content).
 * Chaque signal : { label, weight, level, explanation }
 *  - weight négatif = pénalité ; positif = bonus
 *  - level : info | warn | danger
 */
function analyseUrls(urls, fromDomain) {
  const domains = urls.map(getUrlDomain);
  const uniqueDomains = [...new Set(domains)];
  const signals = [];
  const seen = new Set();

  // Helper pour dédupliquer
  const add = (label, weight, level, explanation) => {
    if (seen.has(label)) return;
    seen.add(label);
    signals.push({ label, axis: 'content', weight, level, explanation });
  };

  urls.forEach(u => {
    const d = getUrlDomain(u);
    const lu = u.toLowerCase();

    if (/^\d+\.\d+\.\d+\.\d+$/.test(d)) {
      add("URL pointant vers une IP", -22, 'danger',
          "Lien pointant vers une adresse IP brute : très suspect en contexte email.");
    }
    if (URL_SHORTENERS.some(s => d === s || d.endsWith("." + s))) {
      add("URL raccourcie", -15, 'warn',
          "Raccourcisseur d'URL masquant la destination réelle.");
    }
    if (hasPunycode(d)) {
      add("Domaine IDN (Punycode)", -25, 'danger',
          "Domaine en notation xn-- (IDN), souvent utilisé pour usurper des marques via des caractères étrangers.");
    }
    if (hasHomoglyph(d)) {
      add("Homoglyphe dans le domaine de lien", -30, 'danger',
          "Mélange de caractères latins et d'alphabets visuellement similaires (cyrillique/grec) : usurpation probable.");
    }
    // Typosquatting de marque dans le lien
    const brand = BRAND_KEYWORDS.find(b => lu.includes(b));
    if (brand && !OFFICIAL_DOMAIN_PATTERN.test(d)) {
      add("Marque imitée dans une URL", -25, 'danger',
          `Le lien évoque la marque « ${brand} » mais ne pointe pas vers son domaine officiel.`);
    }
    if (/\b(login|secure|verify|account|password|signin|update|confirm)\b/i.test(lu)) {
      add("Mot-clé sensible dans l'URL", -10, 'warn',
          "Mots typiques du phishing (login, secure, verify…) détectés dans l'URL.");
    }
    if (fromDomain !== "inconnu" && d !== "invalide" && !d.endsWith(fromDomain) && !fromDomain.endsWith(d)) {
      // Tolérance pour les CDN/marketing d'un même groupe : on signale en warn léger
      add("Domaine du lien ≠ expéditeur", -8, 'warn',
          `Lien (${d}) non aligné avec l'expéditeur (${fromDomain}).`);
    }
    if (u.length > 200) {
      add("URL anormalement longue", -8, 'warn',
          "URL > 200 caractères pouvant masquer la destination réelle.");
    }
  });

  if (uniqueDomains.length > 3) {
    add("Nombreux domaines distincts", -10, 'warn',
        `${uniqueDomains.length} domaines différents : indicateur de campagne automatisée.`);
  }

  return { domains: uniqueDomains, signals };
}

/**
 * Analyse heuristique du sujet (urgence, ALL CAPS, etc.).
 */
function analyseSubject(subject) {
  const signals = [];
  if (!subject || subject === "Non trouvé") return signals;
  const s = subject.trim();

  // Mots-clés d'urgence
  const urgencyHits = URGENCY_PATTERNS.filter(p => p.rx.test(s));
  if (urgencyHits.length >= 2) {
    signals.push({
      label: "Plusieurs marqueurs d'urgence dans le sujet",
      axis: 'content', weight: -15, level: 'warn',
      explanation: "Le sujet combine plusieurs signaux d'urgence (" + urgencyHits.map(h => h.label).join(", ") + "), schéma classique de phishing."
    });
  } else if (urgencyHits.length === 1) {
    signals.push({
      label: "Marqueur d'urgence dans le sujet",
      axis: 'content', weight: -7, level: 'info',
      explanation: `Sujet contient « ${urgencyHits[0].label} ».`
    });
  }

  // ALL CAPS (≥ 6 chars consécutifs)
  if (/[A-Z]{6,}/.test(s) && s.length > 10) {
    signals.push({
      label: "Sujet en MAJUSCULES",
      axis: 'content', weight: -6, level: 'info',
      explanation: "Sujet contient des passages en majuscules : technique classique d'attention."
    });
  }

  // Homoglyphe / Unicode dans le sujet (peut indiquer obfuscation)
  if (hasHomoglyph(s)) {
    signals.push({
      label: "Caractères Unicode trompeurs dans le sujet",
      axis: 'content', weight: -12, level: 'warn',
      explanation: "Mélange d'alphabets dans le sujet : souvent utilisé pour contourner les filtres."
    });
  }

  // Punctuation abuse (!!! ou ???)
  if (/!{3,}|\?{3,}/.test(s)) {
    signals.push({
      label: "Ponctuation excessive dans le sujet",
      axis: 'content', weight: -4, level: 'info',
      explanation: "Plusieurs ! ou ? consécutifs."
    });
  }

  // MIME encoded mais decode raté (chaîne =? résiduelle)
  if (/=\?[^?]+\?[BQ]\?/i.test(s)) {
    signals.push({
      label: "Décodage MIME incomplet du sujet",
      axis: 'content', weight: -4, level: 'info',
      explanation: "Encodage MIME résiduel : peut masquer le vrai sujet."
    });
  }

  return signals;
}

/* ────────────────────────────────────────────────────────────── */
/* Rendu (DOM API, pas d'innerHTML sur entrées utilisateur)       */
/* ────────────────────────────────────────────────────────────── */

function row(label, value, status) {
  const children = [
    el('span', { class: 'label', text: label }),
    el('span', { class: 'value', text: clean(value) }),
  ];
  if (status) {
    children.push(el('span', { class: 'status ' + statusClass(status), text: status }));
  }
  return el('div', { class: 'row' }, ...children);
}

/** Construit un chip "axe" avec score 0-100 et libellé. */
function makeAxisChip(name, score, weight, sub) {
  const colorClass = score >= 70 ? 'good' : score >= 40 ? 'medium' : 'bad';
  const fill = el('div', { class: 'axis-bar-fill ' + colorClass });
  fill.style.width = score + '%';
  return el('div', { class: 'axis-card' },
    el('div', { class: 'axis-card-head' },
      el('span', { class: 'axis-name', text: name }),
      el('span', { class: 'axis-weight', text: weight })
    ),
    el('div', { class: 'axis-bar' }, fill),
    el('div', { class: 'axis-card-foot' },
      el('span', { class: 'axis-score-num ' + colorClass, text: score + '/100' }),
      el('span', { class: 'axis-sub', text: sub })
    )
  );
}

/** Construit un chip "signal" avec son poids ±N et libellé. */
function makeSignalRow(sig) {
  const neg = sig.weight < 0;
  const chipClass = 'signal-chip ' + (neg ? 'chip-neg' : 'chip-pos');
  const sign = neg ? '' : '+';
  return el('div', { class: 'signal-row ' + (sig.level || 'info') },
    el('span', { class: chipClass, text: sign + sig.weight }),
    el('div', { class: 'signal-body' },
      el('div', { class: 'signal-label', text: sig.label }),
      sig.explanation ? el('div', { class: 'signal-expl', text: sig.explanation }) : null
    )
  );
}

function renderStaticTools() {
  const wrap = document.getElementById('static-tools');
  wrap.replaceChildren();
  STATIC_TOOLS.forEach(t => {
    const a = extLink(t.url, t.name + " ↗");
    a.title = t.desc;
    wrap.appendChild(a);
  });
}

/* ────────────────────────────────────────────────────────────── */
/* Actions UI                                                      */
/* ────────────────────────────────────────────────────────────── */

/**
 * Câble un accordéon sidebar (même mécanique que TenantPulse).
 * Le bouton [btnId] bascule la classe .open sur le body [bodyId]
 * et fait pivoter la flèche [arrowId].
 */
function setupCollapsible(btnId, arrowId, bodyId) {
  var btn   = document.getElementById(btnId);
  var arrow = document.getElementById(arrowId);
  var body  = document.getElementById(bodyId);
  if (!btn || !body) return;
  btn.addEventListener('click', function () {
    var isOpen = body.classList.toggle('open');
    if (arrow) arrow.classList.toggle('open', isOpen);
  });
}

function renderEmptyState() {
  const result = document.getElementById('result');
  if (!result) return;
  result.replaceChildren(
    el('div', { class: 'result-empty' },
      el('div', { class: 'result-empty-icon', text: '✉︎' }),
      el('div', { class: 'result-empty-title', text: 'Aucune analyse en cours' }),
      el('div', { class: 'result-empty-hint',
        text: 'Collez des en-têtes email dans le panneau de gauche puis cliquez sur Analyser.' })
    )
  );
}

function resetAll() {
  document.getElementById("header").value = "";
  renderEmptyState();
  lastReports = { client: "", tech: "" };
}

function copyReport(type) {
  const text = lastReports[type];
  if (!text) { alert("Lancez d'abord une analyse."); return; }
  navigator.clipboard.writeText(text).then(
    () => alert("Copié dans le presse-papiers."),
    () => alert("Copie impossible : sélectionnez manuellement le texte du rapport.")
  );
}

function loadSample() {
  document.getElementById("header").value = `Return-Path: <bounce@marketing-news.example.com>
Received: from mail-out12.protection.outlook.com (mail-out12.protection.outlook.com [40.92.10.15])
  by mx.company.fr with ESMTPS id abc123; Mon, 25 May 2026 10:22:11 +0200
Authentication-Results: mx.company.fr;
  spf=fail (sender IP is 203.0.113.55) smtp.mailfrom=marketing-news.example.com;
  dkim=fail reason="signature verification failed";
  dmarc=fail action=reject header.from=secure-login-verify.example.com;
  compauth=fail reason=001
From: "Microsoft 365 Security" <alert@secure-login-verify.example.com>
Reply-To: support@bit.ly/abc123
Return-Path: <bounce@marketing-news.example.com>
Subject: =?utf-8?Q?Action_required=3A_verify_your_account?=
Message-ID: <phish-001@secure-login-verify.example.com>
Date: Mon, 25 May 2026 08:15:00 +0000
To: victim@company.fr
X-Forefront-Antispam-Report: CIP:203.0.113.55;CTRY:RU;SCL:7;CAT:PHSH;SFV:SPM;PTR:unknown;H:evil-smtp.example.com;HELO:evil-smtp.example.com
Content-Type: text/html
https://secure-login-verify.example.com/signin?id=token
https://bit.ly/abc123`;
  analyse();
}

function importEml(ev) {
  const f = ev.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    const raw = r.result;
    const sep = raw.search(/\r?\n\r?\n/);
    document.getElementById("header").value = sep > 0 ? raw.slice(0, sep) : raw;
    analyse();
  };
  r.readAsText(f);
  ev.target.value = "";
}

/* ────────────────────────────────────────────────────────────── */
/* Analyse principale                                              */
/* ────────────────────────────────────────────────────────────── */

function analyse() {
  const h = document.getElementById("header").value;
  if (!h.trim()) { alert("Collez des en-têtes email."); return; }

  const from = clean(decodeMime(getValue(/^From:\s*(.*)$/im, h)));
  const returnPath = clean(decodeMime(getValue(/^Return-Path:\s*(.*)$/im, h)));
  const replyTo = clean(decodeMime(getValue(/^Reply-To:\s*(.*)$/im, h)));
  const subject = clean(decodeMime(getValue(/^Subject:\s*(.*)$/im, h)));
  const messageId = clean(getValue(/^Message-ID:\s*(.*)$/im, h));
  const date = clean(getValue(/^Date:\s*(.*)$/im, h));
  const to = clean(decodeMime(getValue(/^To:\s*(.*)$/im, h)));
  const xMailer = clean(getValue(/^X-Mailer:\s*(.*)$/im, h));
  const listUnsub = clean(getValue(/^List-Unsubscribe:\s*(.*)$/im, h));

  const authBlocks = parseAuthResults(h);
  const primaryAuth = authBlocks[authBlocks.length - 1] || authBlocks[0];
  const ms = parseForefront(h);
  const receivedHops = parseReceived(h);
  const urls = extractUrls(h);
  const allIps = [...new Set(receivedHops.flatMap(x => x.ips))];
  const publicIps = allIps.filter(ip => !isPrivateIP(ip));
  const originIP = ms.CIP !== "Non trouvé" ? ms.CIP : (publicIps[0] || allIps[0] || "inconnu");

  const fromEmail = extractEmail(from);
  const fromDomain = extractDomain(from);
  const rpDomain = extractDomain(returnPath);
  const replyDomain = extractDomain(replyTo);
  const displayName = extractDisplayName(from);
  const urlAnalysis = analyseUrls(urls, fromDomain);

  /* ─────────────────────────────────────────────────────────── */
  /* Modèle de scoring multi-axes pondéré                        */
  /*                                                             */
  /* Chaque signal détecté est rangé sur un axe (auth / identity */
  /* / content / routing) avec un poids. Le sous-score d'un axe  */
  /* = 100 + Σ poids des signaux de cet axe (clamp 0-100).       */
  /* Le score global = moyenne pondérée des 4 sous-scores.       */
  /* ─────────────────────────────────────────────────────────── */
  const signals = []; // { label, axis, weight, level, explanation }
  const alerts = [];

  const spf = primaryAuth.spf;
  const dkim = primaryAuth.dkim;
  const dmarc = primaryAuth.dmarc;
  const compauth = primaryAuth.compauth;
  const arc = primaryAuth.arc;

  /* ── Axe AUTH : SPF / DKIM / DMARC / CompAuth / ARC ── */
  if (spf === "fail") signals.push({ label: "SPF FAIL", axis: 'auth', weight: -32, level: 'danger',
    explanation: "Le serveur d'envoi n'est pas autorisé par le domaine expéditeur (SPF)." });
  else if (spf === "softfail") signals.push({ label: "SPF SOFTFAIL", axis: 'auth', weight: -12, level: 'warn',
    explanation: "SPF en échec partiel : peut être un forwarding légitime ou une usurpation." });
  else if (spf === "pass") signals.push({ label: "SPF pass", axis: 'auth', weight: +3, level: 'info',
    explanation: "Le serveur d'envoi est autorisé par le domaine." });

  if (dkim === "fail") signals.push({ label: "DKIM FAIL", axis: 'auth', weight: -22, level: 'danger',
    explanation: "Signature DKIM invalide ou absente : intégrité non garantie." });
  else if (dkim === "pass") signals.push({ label: "DKIM pass", axis: 'auth', weight: +4, level: 'info',
    explanation: "Signature DKIM valide." });

  if (dmarc === "fail") signals.push({ label: "DMARC FAIL", axis: 'auth', weight: -28, level: 'danger',
    explanation: "Politique DMARC non respectée : risque élevé d'usurpation du domaine." });
  else if (dmarc === "pass") signals.push({ label: "DMARC pass", axis: 'auth', weight: +5, level: 'info',
    explanation: "Alignement DMARC validé." });

  if (compauth === "fail") signals.push({ label: "CompAuth FAIL (Microsoft)", axis: 'auth', weight: -18, level: 'danger',
    explanation: "Authentification composite Microsoft échouée (alignement From / DKIM)." });

  if (arc === "pass") signals.push({ label: "ARC chain valide", axis: 'auth', weight: +3, level: 'info',
    explanation: "Chaîne ARC préservée à travers les intermédiaires." });
  else if (arc === "fail") signals.push({ label: "ARC FAIL", axis: 'auth', weight: -8, level: 'warn',
    explanation: "Chaîne ARC rompue : l'authentification d'origine n'a pas survécu au routage." });

  // Conflit entre plusieurs blocs Authentication-Results (injection possible)
  const conflict = authResultsConflict(authBlocks);
  if (conflict) signals.push({
    label: "Conflit entre blocs Authentication-Results",
    axis: 'auth', weight: -20, level: 'danger',
    explanation: `Plusieurs résultats ${conflict.toUpperCase()} contradictoires : un en-tête a pu être injecté en amont.`
  });

  // Microsoft SCL / CAT
  const sclNum = parseInt(ms.SCL, 10);
  if (!isNaN(sclNum)) {
    if (sclNum >= 7) signals.push({ label: `SCL élevé (${ms.SCL})`, axis: 'auth', weight: -22, level: 'danger',
      explanation: "Microsoft EOP attribue un score anti-spam élevé." });
    else if (sclNum >= 5) signals.push({ label: `SCL modéré (${ms.SCL})`, axis: 'auth', weight: -10, level: 'warn',
      explanation: "Score anti-spam Microsoft modéré." });
  }
  const catType = interpretCAT(ms.CAT);
  if (/phish/i.test(catType)) signals.push({ label: "Catégorie Phishing (Microsoft)", axis: 'auth', weight: -35, level: 'danger',
    explanation: "Microsoft EOP a classé ce message comme phishing." });
  if (/malware/i.test(catType)) signals.push({ label: "Catégorie Malware (Microsoft)", axis: 'auth', weight: -45, level: 'danger',
    explanation: "Microsoft EOP a classé ce message comme malware." });

  /* ── Axe IDENTITY : From / Reply-To / Return-Path / displayName ── */
  if (replyTo && replyTo !== "Non trouvé" && replyDomain !== fromDomain && replyDomain !== "inconnu") {
    signals.push({ label: "Reply-To ≠ From", axis: 'identity', weight: -22, level: 'danger',
      explanation: `Les réponses iraient vers « ${replyDomain} » au lieu de « ${fromDomain} ».` });
    alerts.push({ level: "danger", text: "Reply-To suspect : les réponses peuvent être détournées." });
  }
  if (returnPath && returnPath !== "Non trouvé" && rpDomain !== fromDomain && rpDomain !== "inconnu") {
    signals.push({ label: "Return-Path ≠ From", axis: 'identity', weight: -12, level: 'warn',
      explanation: "L'envelope sender (rebonds) ne correspond pas à l'expéditeur affiché." });
  }
  // Display name spoofing — version étendue
  const dnDeception = displayNameDeception(displayName, fromDomain);
  if (dnDeception) {
    if (dnDeception.brand && !dnDeception.aligned) {
      signals.push({ label: "Display name imite une marque", axis: 'identity', weight: -22, level: 'danger',
        explanation: `Le nom affiché « ${displayName} » évoque « ${dnDeception.brand} » mais le domaine réel est « ${fromDomain} ».` });
      alerts.push({ level: "warn", text: "Usurpation possible via le nom d'affichage (display name spoofing)." });
    }
    if (dnDeception.homoglyph) {
      signals.push({ label: "Homoglyphes dans le display name", axis: 'identity', weight: -25, level: 'danger',
        explanation: "Le nom affiché mélange Latin et caractères visuellement similaires (cyrillique/grec)." });
    }
  }
  // Homoglyphe / Punycode dans le domaine From lui-même = catastrophique
  if (hasHomoglyph(fromDomain)) signals.push({ label: "Homoglyphe dans le domaine From", axis: 'identity', weight: -35, level: 'danger',
    explanation: "Le domaine expéditeur lui-même mélange des alphabets : usurpation quasi certaine." });
  if (hasPunycode(fromDomain)) signals.push({ label: "Domaine From en Punycode (IDN)", axis: 'identity', weight: -20, level: 'warn',
    explanation: "Le domaine expéditeur est un IDN (xn--), à vérifier visuellement." });
  // Message-ID désaligné
  if (messageId && messageId !== "Non trouvé") {
    const midDomain = (messageId.match(/@([^>]+?)>?$/) || [])[1];
    if (midDomain && fromDomain !== "inconnu" && !midDomain.toLowerCase().endsWith(fromDomain)) {
      signals.push({ label: "Message-ID hors domaine expéditeur", axis: 'identity', weight: -6, level: 'info',
        explanation: `Le Message-ID est généré par « ${midDomain} », pas par « ${fromDomain} ».` });
    }
  }

  /* ── Axe CONTENT : sujet + URLs ── */
  analyseSubject(subject).forEach(s => signals.push(s));
  urlAnalysis.signals.forEach(s => signals.push(s));

  /* ── Axe ROUTING : hops, TLS, cohérence temporelle, géolocalisation ── */
  if (receivedHops.length >= 2 && receivedHops.every(h => h.tls)) {
    signals.push({ label: "TLS sur tous les hops", axis: 'routing', weight: +6, level: 'info',
      explanation: "Tous les relais SMTP ont chiffré la transmission." });
  } else if (receivedHops.length >= 2 && receivedHops.some(h => !h.tls)) {
    signals.push({ label: "Hop(s) sans TLS", axis: 'routing', weight: -5, level: 'warn',
      explanation: "Au moins un relais a transmis le message sans chiffrement." });
  }
  if (receivedHops.length > 8) {
    signals.push({ label: "Chaîne SMTP exceptionnellement longue", axis: 'routing', weight: -8, level: 'warn',
      explanation: `${receivedHops.length} hops : peut indiquer un routage tortueux destiné à brouiller la piste.` });
  }
  // Cohérence Date header vs Received
  const dt = temporalDelta(date, receivedHops);
  if (dt !== null && Math.abs(dt) > 24) {
    signals.push({ label: "Incohérence temporelle Date/Received", axis: 'routing', weight: -10, level: 'warn',
      explanation: `Écart de ${Math.round(dt)}h entre l'en-tête Date et le dernier relais.` });
  }
  // Géolocalisation : pays Forefront ≠ FR/EU dans contexte FR
  if (ms.CTRY && ms.CTRY !== "Non trouvé" && !/^(FR|BE|CH|LU|MC|EU|DE|ES|IT|NL|GB|US|IE|CA)$/i.test(ms.CTRY)) {
    signals.push({ label: `Origine géographique : ${ms.CTRY}`, axis: 'routing', weight: -8, level: 'warn',
      explanation: `Le message provient d'une zone géographique inhabituelle (${ms.CTRY}) pour un contexte FR.` });
  }

  /* ─── Calcul des sous-scores par axe ─── */
  function axisScore(axis) {
    return Math.max(0, Math.min(100, 100 + signals
      .filter(s => s.axis === axis)
      .reduce((acc, s) => acc + s.weight, 0)));
  }
  const subscores = {
    auth:     axisScore('auth'),
    identity: axisScore('identity'),
    content:  axisScore('content'),
    routing:  axisScore('routing'),
  };
  // Pondération : auth 35%, identity 25%, content 30%, routing 10%
  const weights = { auth: 0.35, identity: 0.25, content: 0.30, routing: 0.10 };
  const score = Math.round(
    subscores.auth * weights.auth +
    subscores.identity * weights.identity +
    subscores.content * weights.content +
    subscores.routing * weights.routing
  );

  let verdict = "Légitime", color = "good";
  if (score < 70) { verdict = "Suspect"; color = "medium"; }
  if (score < 40) { verdict = "Probablement malveillant"; color = "bad"; }

  // Confiance dans la détection elle-même : nombre de signaux discriminants
  const discriminantSignals = signals.filter(s => Math.abs(s.weight) >= 10).length;
  let confidence = "moyenne";
  if (discriminantSignals >= 4) confidence = "élevée";
  else if (discriminantSignals <= 1) confidence = "faible";

  // Liste d'anomalies "rétro-compat" pour les rapports texte
  const anomalies = signals.filter(s => s.weight < 0).map(s => s.label);
  const explanations = [...new Set(signals.filter(s => s.weight < 0).map(s => s.explanation))];

  /* Rapports textes (pour copie presse-papiers) */
  const client = `Bonjour,

Suite à l'analyse technique de votre message :

Objet : ${subject}
Date : ${date}
Expéditeur : ${from}
${replyTo !== "Non trouvé" ? "Reply-To : " + replyTo + "\n" : ""}
Score de confiance : ${score}/100, ${verdict} (fiabilité détection : ${confidence})

Détail par axe :
- Authentification : ${subscores.auth}/100
- Identité         : ${subscores.identity}/100
- Contenu          : ${subscores.content}/100
- Routage          : ${subscores.routing}/100

Synthèse :
- Authentification (SPF/DKIM/DMARC) : ${spf} / ${dkim} / ${dmarc}
${ms.SCL !== "Non trouvé" ? "- Filtrage Microsoft (SCL " + ms.SCL + ") : " + interpretSCL(ms.SCL) + "\n" : ""}
${urls.length ? "- Liens détectés : " + urls.length + "\n" : ""}

${anomalies.length ? "Points d'attention :\n- " + anomalies.join("\n- ") + "\n" : "Aucun indicateur majeur détecté.\n"}

Recommandation : ${score < 40 ? "Ne pas cliquer sur les liens, ne pas répondre, signaler au SOC et supprimer." : score < 70 ? "Vérifier l'expéditeur par un autre canal avant toute action." : "Comportement cohérent avec un envoi légitime, vigilance habituelle."}

Cordialement`;

  const tech = `=== RAPPORT TECHNIQUE ===
Date analyse : ${new Date().toISOString()}

--- Identité ---
From: ${from}
Return-Path: ${returnPath}
Reply-To: ${replyTo}
Message-ID: ${messageId}
Subject: ${subject}
Date header: ${date}
To: ${to}
Domaine From: ${fromDomain}
X-Mailer: ${xMailer}
List-Unsubscribe: ${listUnsub}

--- Authentification (${primaryAuth.host}) ---
SPF: ${spf} | DKIM: ${dkim} | DMARC: ${dmarc} | CompAuth: ${compauth}

--- Microsoft Forefront ---
SCL: ${ms.SCL} (${interpretSCL(ms.SCL)})
CAT: ${ms.CAT} (${catType})
SFV: ${ms.SFV}
CIP: ${ms.CIP} | CTRY: ${ms.CTRY} | PTR: ${ms.PTR}
HELO/H: ${ms.H} | LANG: ${ms.LANG} | DIR: ${ms.DIR}

--- Réseau ---
IP origine (estimée): ${originIP}
IPs dans Received: ${allIps.join(", ")}

--- URLs (${urls.length}) ---
${urls.map(u => "- " + u).join("\n") || "Aucune"}
Domaines: ${urlAnalysis.domains.join(", ")}

--- Sous-scores (modèle 4 axes pondéré) ---
Authentification (35%): ${subscores.auth}/100
Identité         (25%): ${subscores.identity}/100
Contenu          (30%): ${subscores.content}/100
Routage          (10%): ${subscores.routing}/100

--- Signaux discriminants ---
${signals.length ? signals.map(s => `${s.weight >= 0 ? '+' : ''}${s.weight}  [${s.axis}]  ${s.label}`).join("\n") : "Aucun"}

--- Anomalies (rétro-compat) ---
${anomalies.map(a => "- " + a).join("\n") || "Aucune"}

Score global: ${score}/100 | Verdict: ${verdict} | Fiabilité détection: ${confidence}
`;

  lastReports = { client, tech };

  /* Rendu DOM (CSP-safe, pas d'innerHTML) */
  const result = document.getElementById("result");
  result.replaceChildren();

  /* 1. Carte score — réutilise le hero "Aurora" de TenantPulse (tenant-hero) */
  const barFill = el('div', { class: 'bar-fill ' + color });
  barFill.style.width = score + '%';
  const scoreCard = el('div', { class: 'tenant-hero score-hero' },
    el('div', { class: 'score-header' },
      el('div', { class: 'score-main' },
        el('h2', { text: 'Score de confiance' }),
        el('div', { class: 'bar' }, barFill),
        el('p', { class: 'confidence-line', text: `Fiabilité de la détection : ${confidence} (${discriminantSignals} signaux discriminants)` })
      ),
      el('div', { class: 'score-num' },
        String(score),
        el('span', { class: 'score-num-suffix', text: '/100' })
      ),
      el('span', { class: 'badge ' + color + '-bg', text: verdict })
    ),
    /* Sous-scores par axe */
    el('div', { class: 'axis-grid' },
      makeAxisChip('Authentification', subscores.auth, '35 %', 'SPF / DKIM / DMARC / EOP'),
      makeAxisChip('Identité', subscores.identity, '25 %', 'From / Reply-To / display name'),
      makeAxisChip('Contenu', subscores.content, '30 %', 'Sujet / URLs / homoglyphes'),
      makeAxisChip('Routage', subscores.routing, '10 %', 'Hops / TLS / géolocalisation')
    ),
    ...alerts.map(a => el('div', { class: 'alert alert-' + (a.level === 'danger' ? 'danger' : a.level === 'warn' ? 'warn' : 'info'), text: a.text }))
  );
  result.appendChild(scoreCard);

  /* 2. Construction des blocs (détachés) + disposition selon profil */
  const twoCol   = el('div', { class: 'results-2col' });
  const leftCol  = el('div', { class: 'results-col' });
  const rightCol = el('div', { class: 'results-col' });
  const blockMap = {};

  /* ── Block : Message ── */
  const messageDetails = el('details', { class: 'card-details' });
  messageDetails.appendChild(el('summary', { text: 'Message' }));
  const messageBody = el('div', { class: 'card-details-body' },
    row("Objet", subject),
    row("Date", date),
    row("De", from),
    row("À", to),
    replyTo !== "Non trouvé" ? row("Reply-To", replyTo) : null,
    row("Return-Path", returnPath),
    row("Message-ID", messageId),
    row("Domaine", fromDomain)
  );
  const messageTools = el('div', { class: 'tools-grid' }, ...toolLinks("domain", fromDomain));
  if (fromEmail) toolLinks("email", fromEmail).forEach(n => messageTools.appendChild(n));
  messageBody.appendChild(messageTools);
  messageDetails.appendChild(messageBody);
  blockMap.message = messageDetails;

  /* ── Block : Chaîne SMTP ── */
  const smtpDetails = el('details', { class: 'card-details' });
  smtpDetails.appendChild(el('summary', { text: 'Chaîne SMTP (Received)' }));
  const smtpBody = el('div', { class: 'card-details-body' });
  smtpBody.appendChild(el('p', { class: 'note', text: "Du hop 1 (origine) au dernier (votre infrastructure). Vérifiez la cohérence des noms, TLS et IP publiques." }));
  if (!receivedHops.length) {
    smtpBody.appendChild(el('p', { class: 'note', text: 'Aucun en-tête Received trouvé.' }));
  } else {
    receivedHops.forEach(hop => {
      const hopDiv = el('div', { class: 'hop' },
        el('span', { class: 'hop-num', text: 'Hop ' + hop.index }),
        hop.tls ? el('span', { class: 'hop-tls', text: '• TLS' }) : null,
        el('br'),
        el('strong', { text: 'From: ' }),
        clean(hop.helo),
        ' → ',
        el('strong', { text: 'By: ' }),
        clean(hop.by),
        el('br'),
        el('strong', { text: 'IP(s): ' }),
        hop.ips.join(", ") || "—"
      );
      if (hop.ips.length) {
        const ipTools = el('div', { class: 'tools-grid' });
        hop.ips.forEach(ip => toolLinks("ip", ip).forEach(n => ipTools.appendChild(n)));
        hopDiv.appendChild(ipTools);
      }
      hopDiv.appendChild(el('br'));
      hopDiv.appendChild(el('strong', { text: 'Date: ' }));
      hopDiv.appendChild(document.createTextNode(clean(hop.date)));
      smtpBody.appendChild(hopDiv);
    });
  }
  if (originIP !== "inconnu") {
    smtpBody.appendChild(el('h3', { text: "IP d'origine : investigation" }));
    smtpBody.appendChild(el('div', { class: 'tools-grid' }, ...toolLinks("ip", originIP)));
  }
  smtpDetails.appendChild(smtpBody);
  blockMap.smtp = smtpDetails;

  /* ── Block : URLs détectées ── */
  const urlDetails = el('details', { class: 'card-details' });
  urlDetails.appendChild(el('summary', { text: `URLs détectées (${urls.length})` }));
  const urlBody = el('div', { class: 'card-details-body' });
  if (!urls.length) {
    urlBody.appendChild(el('p', { class: 'note', text: 'Aucune URL dans les en-têtes.' }));
  } else {
    urls.forEach(u => {
      urlBody.appendChild(el('p', { class: 'url-line', text: u }));
      urlBody.appendChild(el('div', { class: 'tools-grid' }, ...toolLinks("url", u)));
    });
  }
  const domainsLine = el('p', { class: 'note' },
    el('strong', { text: 'Domaines : ' }),
    urlAnalysis.domains.join(", ") || "—"
  );
  urlBody.appendChild(domainsLine);
  urlAnalysis.domains.forEach(d => {
    if (d !== "invalide") {
      urlBody.appendChild(el('div', { class: 'tools-grid' }, ...toolLinks("domain", d)));
    }
  });
  urlDetails.appendChild(urlBody);
  blockMap.urls = urlDetails;

  /* ── Block : Rapports texte ── */
  const reportsDetails = el('details', { class: 'card-details' });
  reportsDetails.appendChild(el('summary', { text: 'Rapports texte' }));
  const reportsBody = el('div', { class: 'card-details-body' });
  reportsBody.appendChild(el('h3', { text: 'Rapport client' }));
  reportsBody.appendChild(el('textarea', { class: 'report-textarea', id: 'clientReport' }));
  reportsBody.appendChild(el('h3', { text: 'Rapport technique' }));
  reportsBody.appendChild(el('textarea', { class: 'report-textarea', id: 'techReport' }));
  reportsDetails.appendChild(reportsBody);
  blockMap.reports = reportsDetails;

  /* ── Block : Authentification ── */
  const authDetails = el('details', { class: 'card-details' });
  authDetails.appendChild(el('summary', { text: 'Authentification' }));
  const authBody = el('div', { class: 'card-details-body' });
  authBlocks.forEach((b, i) => {
    authBody.appendChild(el('h3', { text: `Bloc ${i + 1} : ${b.host}` }));
    authBody.appendChild(row("SPF", b.spf, b.spf));
    authBody.appendChild(row("DKIM", b.dkim, b.dkim));
    authBody.appendChild(row("DMARC", b.dmarc, b.dmarc));
    authBody.appendChild(row("CompAuth", b.compauth, b.compauth));
    authBody.appendChild(row("ARC", b.arc, b.arc));
  });
  authBody.appendChild(el('p', { class: 'note', text: "CompAuth = authentification composite Microsoft (alignement 5322.From). ARC préserve l'auth en forwarding." }));
  authDetails.appendChild(authBody);
  blockMap.auth = authDetails;

  /* ── Block : Microsoft / EOP ── */
  const msDetails = el('details', { class: 'card-details' });
  msDetails.appendChild(el('summary', { text: 'Microsoft / EOP' }));
  const msBody = el('div', { class: 'card-details-body' },
    row("SCL", ms.SCL + " : " + interpretSCL(ms.SCL)),
    row("CAT", ms.CAT + " : " + catType),
    row("SFV", ms.SFV),
    row("CIP", ms.CIP),
    row("Pays", ms.CTRY),
    row("PTR", ms.PTR),
    row("HELO", ms.H),
    extLink("https://mha.azurewebsites.net/", "Microsoft Header Analyzer ↗")
  );
  msDetails.appendChild(msBody);
  blockMap.ms = msDetails;

  /* ── Block : Signaux détectés ── */
  const anoDetails = el('details', { class: 'card-details' });
  anoDetails.appendChild(el('summary', { text: `Signaux détectés (${signals.length})` }));
  const anoBody = el('div', { class: 'card-details-body' });
  const sortedSignals = [...signals].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  const negatives = sortedSignals.filter(s => s.weight < 0);
  const positives = sortedSignals.filter(s => s.weight > 0);
  if (!negatives.length && !positives.length) {
    anoBody.appendChild(el('div', { class: 'alert alert-info', text: 'Aucun signal discriminant détecté.' }));
  }
  if (negatives.length) {
    anoBody.appendChild(el('h3', { text: `Signaux négatifs (${negatives.length})` }));
    negatives.forEach(s => anoBody.appendChild(makeSignalRow(s)));
  }
  if (positives.length) {
    anoBody.appendChild(el('h3', { text: `Signaux positifs (${positives.length})` }));
    positives.forEach(s => anoBody.appendChild(makeSignalRow(s)));
  }
  anoBody.appendChild(el('h3', { text: 'Seconde opinion (outils externes)' }));
  anoBody.appendChild(el('div', { class: 'tools-grid' },
    extLink("https://toolbox.googleapps.com/apps/messageheader/", "Google Header Tool ↗"),
    extLink("https://www.gaijin.at/en/tools/e-mail-header-analyzer", "Gaijin Headers ↗"),
    extLink("https://phishtool.com/", "PhishTool ↗")
  ));
  anoBody.appendChild(el('p', { class: 'note', text: 'Collez le même header dans ces outils pour une seconde opinion (traitement côté serveur).' }));
  anoDetails.appendChild(anoBody);
  blockMap.signals = anoDetails;

  /* ── Disposition selon le profil (ordre + visibilité + ouverture par défaut) ── */
  const mlProfile    = loadMlProfile();
  const hiddenSet    = new Set(mlProfile.hidden || []);
  const defaultOpen  = new Set(mlProfile.defaultOpen || []);
  const leftOrder    = mlProfile.left  || ML_BLOCKS_DEFAULT.left;
  const rightOrder   = mlProfile.right || ML_BLOCKS_DEFAULT.right;

  /* Pré-ouvre les <details> marqués comme défaut-ouverts dans le profil */
  Object.keys(blockMap).forEach(key => {
    if (defaultOpen.has(key) && blockMap[key].tagName === 'DETAILS') {
      blockMap[key].setAttribute('open', '');
    }
  });

  leftOrder.forEach(key => {
    if (!hiddenSet.has(key) && blockMap[key]) leftCol.appendChild(blockMap[key]);
  });
  rightOrder.forEach(key => {
    if (!hiddenSet.has(key) && blockMap[key]) rightCol.appendChild(blockMap[key]);
  });

  twoCol.appendChild(leftCol);
  twoCol.appendChild(rightCol);
  result.appendChild(twoCol);

  /* Textarea : assign via .value (PAS innerHTML) → 0 XSS */
  const clientTA = document.getElementById('clientReport');
  const techTA   = document.getElementById('techReport');
  if (clientTA) clientTA.value = client;
  if (techTA)   techTA.value   = tech;
}

/* ────────────────────────────────────────────────────────────── */
/* Event binding (au DOMContentLoaded)                            */
/* ────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  renderStaticTools();
  renderEmptyState();

  /* Boutons de la toolbar */
  document.getElementById('btnAnalyse').addEventListener('click', analyse);
  document.getElementById('btnReset').addEventListener('click', resetAll);
  document.getElementById('btnSample').addEventListener('click', loadSample);
  document.getElementById('btnCopyClient').addEventListener('click', () => copyReport('client'));
  document.getElementById('btnCopyTech').addEventListener('click', () => copyReport('tech'));
  document.getElementById('emlFile').addEventListener('change', importEml);

  /* Raccourci clavier Ctrl+Entrée (ou Cmd+Entrée sur Mac) */
  document.getElementById('header').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      analyse();
    }
  });

  /* Accordéons sidebar (Boîte à outils + Glossaire) */
  setupCollapsible('btnToolsToggle',   'toolsArrow',    'toolsBody');
  setupCollapsible('btnGlossaryToggle','glossaryArrow', 'glossaryBody');
});
