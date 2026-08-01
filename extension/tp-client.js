/* ──────────────────────────────────────────────────────────────────────────────
   tp-client.js — plomberie commune aux contextes « clients » de l'extension :
   la popup et les scripts de contenu. Deux choses, qu'ils ont tous deux besoin de
   faire à l'identique :

     • évaluer l'attestation d'appartenance avant d'autoriser quoi que ce soit ;
     • demander une résolution au service worker (aucun de ces contextes n'émet
       de fetch lui-même — voir l'en-tête de tp-net.js).

   ── Attestation d'appartenance ──
   L'extension ne cherche rien sans preuve que l'utilisateur appartient à
   l'organisation. Cette preuve vient de sync.js, qui appelle /api/me sur l'origine de
   l'application — requête vérifiée par le serveur, derrière l'authentification Entra.
   Quelqu'un d'extérieur ne peut pas ouvrir l'application, n'obtient donc aucune
   attestation, et se retrouve avec une extension inerte.

   Portée de ce garde-fou, sans illusion : il empêche l'usage opportuniste et rend une
   copie égarée inutile. Il n'arrête pas quelqu'un qui modifierait le code — mais cette
   personne n'obtiendrait alors que ce que des endpoints publics donnent déjà à tous,
   les données de l'organisation restant derrière l'API authentifiée.
   ────────────────────────────────────────────────────────────────────────────── */

const MIRROR_KEY = 'tp_mirror_v1';

/* Interrupteur du panneau Dynamics, partagé entre la popup et le script de contenu.

   Retirer la permission ne suffit pas : désenregistrer un script de contenu empêche
   les FUTURES injections, mais n'arrête pas celui qui s'exécute déjà dans un onglet
   ouvert — le panneau resterait affiché jusqu'au prochain rechargement. Ce drapeau est
   le signal d'extinction, et il passe par chrome.storage plutôt que par un message :
   c'est le seul canal qui fonctionne encore une fois la permission retirée. */
const D365_ACTIF_KEY = 'tp_d365_actif_v1';

/* Durée de validité de l'attestation produite par sync.js à partir de /api/me. Passé
   ce délai, il faut rouvrir l'application — donc repasser par l'authentification
   Entra — pour réactiver l'extension. */
const AUTH_MAX_AGE_MS = 7 * 24 * 3600 * 1000; // 7 jours

/* `auth` est l'objet { authenticatedAt, role, blocked } publié par sync.js dans le
   miroir, ou null s'il n'a jamais été produit. */
function authState(auth) {
  if (!auth || !auth.authenticatedAt) return { ok: false, raison: 'absente' };
  if (auth.blocked) return { ok: false, raison: 'bloque' };
  const t = Date.parse(auth.authenticatedAt);
  if (!Number.isFinite(t)) return { ok: false, raison: 'absente' };
  if (Date.now() - t > AUTH_MAX_AGE_MS) return { ok: false, raison: 'perimee', depuis: t };
  return { ok: true, role: auth.role || 'user' };
}

const MESSAGES_AUTH = {
  absente: "Extension verrouillée : ouvrez TenantPulse et connectez-vous une fois pour l'activer.",
  perimee: "Accès expiré : rouvrez TenantPulse pour vous réauthentifier et réactiver l'extension.",
  bloque:  "Votre compte est bloqué dans TenantPulse. Contactez l'équipe support.",
};

/* Attestation seule, lue dans le miroir. La popup, elle, lit le miroir complet
   (profil et historique) et appelle authState() sur ce qu'elle a déjà en main. */
function readAuthFromMirror() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(MIRROR_KEY, res => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        const snap = res && res[MIRROR_KEY];
        resolve(snap && snap.auth ? snap.auth : null);
      });
    } catch { resolve(null); }
  });
}

/* ── Pont vers le service worker ──
   Un échec (réseau, worker indisponible, message perdu) rend null, exactement comme
   le faisait un fetch en échec quand ces appels vivaient dans la popup. */
function askLookup(kind, value) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type: 'tp-lookup', kind, value }, res => {
        // lastError doit être lu, sinon Chromium journalise une erreur non traitée.
        if (chrome.runtime.lastError || !res || !res.ok) { resolve(null); return; }
        resolve(res.data);
      });
    } catch { resolve(null); }
  });
}

const lookupByDomain = domain   => askLookup('domain', domain);
const lookupById     = tenantId => askLookup('id', tenantId);
const lookupSpTenant = domain   => askLookup('spTenant', domain);
