/* ──────────────────────────────────────────────────────────────────────────────
   d365/ctx.js — du contexte Dynamics au Tenant ID (monde isolé).

   Reçoit de ctx-main.js l'enregistrement affiché, en déduit le domaine du client,
   puis demande la résolution du Tenant ID au service worker. Étape sans interface :
   le résultat part dans la console, le temps de vérifier que la bonne valeur remonte
   avant de dessiner le panneau.

   Trois garde-fous, dans cet ordre :
     1. l'origine doit être exactement celle configurée (le manifest cible un joker
        « *.dynamics.com », qui couvre toutes les organisations du monde) ;
     2. l'attestation d'appartenance doit être valide, sinon aucune requête n'est émise ;
     3. la lecture Dataverse se fait avec les droits de l'utilisateur — l'API refuse
        ce qu'il n'a pas le droit de voir, aucune personnalisation n'est requise.

   Rien ne sort du navigateur, hormis le domaine envoyé aux endpoints publics déjà
   interrogés par la popup. Les noms de comptes et les adresses e-mail servent au
   calcul et ne sont ni stockés, ni journalisés, ni transmis.
   ────────────────────────────────────────────────────────────────────────────── */
(function () {
  /* Garde-fou d'origine : hors de l'instance configurée, ce script ne fait rien.
     TP_D365_ORIGIN vient de d365-origin.js, généré hors dépôt par build.mjs. */
  if (typeof TP_D365_ORIGIN !== 'string' || !TP_D365_ORIGIN || location.origin !== TP_D365_ORIGIN) return;

  const CHANNEL = 'tp-d365-ctx';
  const API = '/api/data/v9.2/';
  const DIAG_KEY = 'tp_d365_diag_v1';

  /* Signe de vie lu par la popup. Diagnostiquer par la console est peu fiable ici :
     Omnicanal en produit des centaines de lignes, la page vit dans des iframes, et
     DevTools ouvert après le chargement rate le démarrage. On ne consigne qu'un
     horodatage et un statut — jamais un domaine, un identifiant ni un nom. */
  function noter(statut) {
    try { chrome.storage.local.set({ [DIAG_KEY]: { at: new Date().toISOString(), statut } }); } catch {}
  }

  /* Résolutions déjà faites, par enregistrement : rouvrir un onglet de session ne
     redéclenche ni lecture Dataverse ni appel réseau. */
  const cache = new Map();
  let currentKey = null;

  const log = (...args) => { try { console.info('[TenantPulse]', ...args); } catch {} };

  // ── Lecture Dataverse (OData v4, même origine, droits de l'utilisateur) ──
  async function odata(path) {
    try {
      const r = await fetch(location.origin + API + path, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
      });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  /* Domaine tiré d'une URL de site web saisie par un humain : le champ contient aussi
     bien « https://exemple.fr/ » que « www.exemple.fr » ou « exemple.fr ». */
  function domainFromUrl(value) {
    if (!value) return null;
    let raw = String(value).trim();
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    let host;
    try { host = new URL(raw).hostname; } catch { return null; }
    host = host.replace(/^www\./i, '').toLowerCase();
    return host.includes('.') ? host : null;
  }

  function domainFromEmail(value) {
    if (!value || !String(value).includes('@')) return null;
    const d = extractDomain(String(value));   // tp-core.js
    return d && d.includes('.') ? d : null;
  }

  /* Domaine du client, par ordre de fiabilité décroissante. Un domaine de compte
     personnel Microsoft n'a pas de tenant à interroger : il est écarté. */
  function pickDomain(candidates) {
    for (const { value, source } of candidates) {
      if (!value) continue;
      if (isMsaPersonalDomain(value)) continue;  // tp-core.js
      return { domain: value, source };
    }
    return null;
  }

  /* Incident : le client peut être un compte ou un contact ; on privilégie le site web
     du compte, puis le domaine de l'adresse du contact principal. */
  async function readFromIncident(id) {
    const data = await odata(
      `incidents(${id})?$select=incidentid`
      + `&$expand=customerid_account($select=accountid,websiteurl,emailaddress1),`
      + `primarycontactid($select=emailaddress1)`
    );
    if (!data) return null;
    const account = data.customerid_account || null;
    const contact = data.primarycontactid || null;
    return {
      accountId: account ? account.accountid : null,
      ...(pickDomain([
        { value: domainFromUrl(account && account.websiteurl),      source: 'site web du compte' },
        { value: domainFromEmail(contact && contact.emailaddress1), source: 'e-mail du contact' },
        { value: domainFromEmail(account && account.emailaddress1), source: 'e-mail du compte' },
      ]) || { domain: null, source: null }),
    };
  }

  /* Fiche compte ouverte directement (hors incident) : même logique, sans contact. */
  async function readFromAccount(id) {
    const data = await odata(`accounts(${id})?$select=accountid,websiteurl,emailaddress1`);
    if (!data) return null;
    return {
      accountId: data.accountid || null,
      ...(pickDomain([
        { value: domainFromUrl(data.websiteurl),      source: 'site web du compte' },
        { value: domainFromEmail(data.emailaddress1), source: 'e-mail du compte' },
      ]) || { domain: null, source: null }),
    };
  }

  const READERS = { incident: readFromIncident, account: readFromAccount };

  // ── Enchaînement : enregistrement → domaine → Tenant ID ──
  async function resolve(record) {
    const key = record.entityName + ':' + record.entityId;
    if (key === currentKey) return;
    currentKey = key;

    if (cache.has(key)) { log('contexte (déjà résolu)', cache.get(key)); return; }

    const reader = READERS[record.entityName];
    noter('enregistrement détecté : ' + record.entityName);
    if (!reader) return;                              // entité hors périmètre : silence
    if (!GUID_ONLY_RE.test(record.entityId)) return;  // tp-core.js

    // Verrou d'appartenance : rien n'est émis sans attestation valide.
    const auth = authState(await readAuthFromMirror());   // tp-client.js
    if (!auth.ok) { noter('verrouillé (' + auth.raison + ')'); log('verrouillé —', MESSAGES_AUTH[auth.raison]); return; }

    const client = await reader(record.entityId);
    if (!client) { noter('lecture Dataverse refusée ou vide'); log('lecture Dataverse sans résultat pour', key); return; }
    if (!client.domain) {
      noter('aucun domaine exploitable sur la fiche');
      const res = { entite: key, domaine: null, motif: 'aucun site web ni adresse exploitable' };
      cache.set(key, res);
      log('contexte non résolu', res);
      return;
    }

    const ms = await lookupByDomain(client.domain);       // tp-client.js → service worker
    const res = {
      entite: key,
      domaine: client.domain,
      source: client.source,
      tenantId: ms ? ms.tenantId : null,
      confiance: ms ? computeConfidence(ms) : 0,         // tp-core.js
    };
    cache.set(key, res);
    noter(ms ? 'Tenant ID résolu' : 'domaine trouvé, aucun tenant');
    log('contexte résolu', res);
  }

  /* Seuls les messages émis par ctx-main.js dans CETTE frame sont écoutés, et seules
     les frames visibles sont retenues : une session Omnicanal en arrière-plan décrit
     un enregistrement qui n'est pas celui que l'utilisateur regarde. */
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const data = ev.data;
    if (!data || data.source !== CHANNEL) return;
    if (!data.visible || !data.record) return;
    resolve(data.record);
  });

  /* Marqueur DOM, même principe que sync.js sur l'application : il rend l'injection
     vérifiable d'un coup d'œil dans l'inspecteur, sans dépendre de la console. */
  try { document.documentElement.setAttribute('data-tp-d365', '1'); } catch {}

  /* Journal et signe de vie réservés à la frame principale. Une page Dynamics en
     compte des dizaines : sans cette réserve, le démarrage écrit autant de lignes
     identiques, et la dernière frame injectée écrase le statut d'une résolution
     déjà réussie ailleurs. Les frames de session, elles, ne parlent que lorsqu'elles
     ont quelque chose à dire — un enregistrement détecté. */
  if (window.top === window) {
    noter('script injecté, en attente du contexte');
    log('contexte Dynamics actif (frame principale)');
  }
})();
