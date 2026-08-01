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
  const MAP_KEY = 'tp_d365_map_v1';

  const EST_PRINCIPALE = window.top === window;

  /* Interrupteur de la popup. Le script reste injecté dans les onglets déjà ouverts
     même après le retrait de la permission : sans ce drapeau, le panneau y survivrait
     jusqu'au prochain rechargement. Surveillé par chrome.storage.onChanged, qui reste
     accessible à un script de contenu déjà en place. */
  let integrationActive = true;

  function appliquerActivation(valeur) {
    const actif = valeur !== false;
    if (actif === integrationActive) return;
    integrationActive = actif;
    if (actif) return;   // réactivation : le prochain contexte relancera l'affichage
    currentKey = null;
    dernierClient = null;
    cache.clear();
    try { tpPanneau.detruire(); } catch {}
  }

  try {
    chrome.storage.local.get(D365_ACTIF_KEY, (res) => {
      if (!chrome.runtime.lastError && res) appliquerActivation(res[D365_ACTIF_KEY]);
    });
    chrome.storage.onChanged.addListener((changements, zone) => {
      if (zone !== 'local' || !changements[D365_ACTIF_KEY]) return;
      appliquerActivation(changements[D365_ACTIF_KEY].newValue);
    });
  } catch {}

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
  let dernierClient = null;   // { accountId, cle } du dernier enregistrement traité

  const log = (...args) => { try { console.info('[TenantPulse]', ...args); } catch {} };

  /* Affichage. La frame qui héberge Xrm n'est pas forcément la frame principale : une
     session Omnicanal a la sienne. Le panneau, lui, ne peut vivre qu'en haut — les
     frames de session relaient donc leur état par le service worker, qui le renvoie à
     la frame 0 du même onglet. */
  /* Identifiant de frame, tiré au sort à l'injection. Il accompagne chaque état pour
     que le panneau sache qui parle : une frame qui quitte sa fiche ne doit effacer que
     SON affichage, pas celui qu'une autre frame vient de produire. */
  const EMETTEUR = Math.random().toString(36).slice(2);

  function afficher(etat) {
    const charge = { ...(etat || { statut: 'inactif' }), emetteur: EMETTEUR };
    if (EST_PRINCIPALE) { tpPanneau.rendre(charge); return; }
    try {
      chrome.runtime.sendMessage({ type: 'tp-d365-etat', etat: charge }, () => void chrome.runtime.lastError);
    } catch {}
  }

  /* Deux messages transitent par le service worker, faute de lien direct entre frames :
       tp-d365-etat   — frame de session → frame principale : état à afficher ;
       tp-d365-manuel — frame principale → toutes les frames : domaine corrigé, que
                        seule la frame propriétaire de l'enregistrement traite. */
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg) return false;
      if (msg.type === 'tp-d365-etat' && EST_PRINCIPALE) tpPanneau.rendre(msg.etat);
      if (msg.type === 'tp-d365-manuel') traiterSaisieManuelle(msg.saisi, msg.cle);
      return false;
    });
  } catch {}

  if (EST_PRINCIPALE) {
    /* La saisie repart vers le service worker, qui la diffuse à toutes les frames de
       l'onglet — y compris celle-ci. Un seul chemin, donc un seul traitement possible. */
    tpPanneau.configurer({
      surDomaineManuel: (saisi, cle) => {
        try {
          chrome.runtime.sendMessage({ type: 'tp-d365-manuel', saisi, cle }, () => void chrome.runtime.lastError);
        } catch {}
      },
    });
  }

  // ── Domaines corrigés à la main, mémorisés par compte ──
  /* Le champ « site web » d'un compte est souvent vide ou faux. Une correction saisie
     dans le panneau vaut pour toutes les fiches du même client, et prime sur ce que
     dit Dataverse — c'est l'utilisateur qui a raison. Stockage strictement local. */
  function lireCorrections() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(MAP_KEY, res => {
          if (chrome.runtime.lastError) { resolve({}); return; }
          resolve((res && res[MAP_KEY]) || {});
        });
      } catch { resolve({}); }
    });
  }

  async function enregistrerCorrection(cle, domaine) {
    const map = await lireCorrections();
    map[cle] = domaine;
    try { chrome.storage.local.set({ [MAP_KEY]: map }); } catch {}
  }

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

  /* Incident : le client peut être un compte ou un contact, et l'un comme l'autre porte
     une adresse — la case « Courrier » de la fiche, soit emailaddress1.

     L'ADRESSE PASSE AVANT LE SITE WEB. Un tenant Microsoft 365 se rattache au domaine de
     messagerie ; le site web d'un compte est souvent une vitrine hébergée ailleurs,
     parfois un domaine commercial sans rapport avec le tenant. Le site web ne sert donc
     plus que de repli. */
  async function readFromIncident(id) {
    const data = await odata(
      `incidents(${id})?$select=incidentid`
      + `&$expand=customerid_account($select=accountid,websiteurl,emailaddress1),`
      + `customerid_contact($select=emailaddress1),`
      + `primarycontactid($select=emailaddress1)`
    );
    if (!data) return null;
    const account = data.customerid_account || null;
    const contact = data.primarycontactid || data.customerid_contact || null;
    return {
      accountId: account ? account.accountid : null,
      ...(pickDomain([
        { value: domainFromEmail(contact && contact.emailaddress1), source: 'courrier du contact' },
        { value: domainFromEmail(account && account.emailaddress1), source: 'courrier du compte' },
        { value: domainFromUrl(account && account.websiteurl),      source: 'site web du compte' },
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
        { value: domainFromEmail(data.emailaddress1), source: 'courrier du compte' },
        { value: domainFromUrl(data.websiteurl),      source: 'site web du compte' },
      ]) || { domain: null, source: null }),
    };
  }

  const READERS = { incident: readFromIncident, account: readFromAccount };

  // ── Enchaînement : enregistrement → domaine → Tenant ID ──

  /* Domaine → Tenant ID. Isolé parce qu'une correction manuelle rejoue exactement
     cette moitié, sans repasser par Dataverse. */
  async function resoudreDomaine(cle, domaine, source) {
    afficher({ statut: 'recherche', domaine, source, message: 'Résolution du Tenant ID…' });

    const ms = await lookupByDomain(domaine);            // tp-client.js → service worker
    const etat = ms
      ? { statut: 'resolu', cle, domaine, source, tenantId: ms.tenantId, confiance: computeConfidence(ms) }
      : { statut: 'sans-tenant', cle, domaine, source };

    /* Nom de tenant SharePoint, déduit du CNAME DKIM : sans lui, la tuile SharePoint
       reste grisée. Une seule requête DNS, et seulement si un tenant a été trouvé. */
    if (ms) {
      const sp = await lookupSpTenant(domaine);
      if (sp) etat.spTenant = sp;
    }

    cache.set(cle, etat);
    noter(ms ? 'Tenant ID résolu' : 'domaine trouvé, aucun tenant');
    log('contexte résolu', etat);
    afficher(etat);
  }

  async function resolve(record) {
    const key = record.entityName + ':' + record.entityId;
    if (key === currentKey) return;
    currentKey = key;

    if (cache.has(key)) { afficher(cache.get(key)); return; }

    const reader = READERS[record.entityName];
    noter('enregistrement détecté : ' + record.entityName);
    if (!reader) return;                              // entité hors périmètre : silence
    if (!GUID_ONLY_RE.test(record.entityId)) return;  // tp-core.js

    // Verrou d'appartenance : rien n'est émis sans attestation valide.
    const auth = authState(await readAuthFromMirror());   // tp-client.js
    if (!auth.ok) {
      noter('verrouillé (' + auth.raison + ')');
      log('verrouillé —', MESSAGES_AUTH[auth.raison]);
      afficher({ statut: 'verrouille', cle: key, message: MESSAGES_AUTH[auth.raison] });
      return;
    }

    afficher({ statut: 'recherche', cle: key, message: 'Lecture de la fiche client…' });

    const client = await reader(record.entityId);
    if (!client) {
      noter('lecture Dataverse refusée ou vide');
      log('lecture Dataverse sans résultat pour', key);
      dernierClient = { cle: key, accountId: null };
      afficher({ statut: 'sans-domaine', cle: key, message: "Fiche client illisible (droits insuffisants ou compte absent)." });
      return;
    }

    /* Une correction manuelle prime sur Dataverse : si l'utilisateur a déjà rectifié
       le domaine de ce compte, c'est lui qui a raison, pas le champ « site web ». */
    dernierClient = { cle: key, accountId: client.accountId || null };
    const corrections = await lireCorrections();
    const corrige = corrections[cleCorrection()];
    if (corrige) { await resoudreDomaine(key, corrige, 'saisi à la main'); return; }

    if (!client.domain) {
      noter('aucun domaine exploitable sur la fiche');
      const etat = { statut: 'sans-domaine', cle: key };
      cache.set(key, etat);
      log('contexte non résolu', etat);
      afficher(etat);
      return;
    }

    await resoudreDomaine(key, client.domain, client.source);
  }

  /* Ce que l'utilisateur tape dans le panneau n'est pas un domaine propre : il colle
     l'URL du site du client, ou une adresse e-mail prise dans le ticket. Les deux
     doivent marcher — « https://www.exemple.fr/contact » comme « jean@exemple.fr ». */
  function normaliserSaisie(valeur) {
    const brut = String(valeur || '').trim();
    if (!brut) return null;
    if (brut.includes('@')) {
      const parMail = domainFromEmail(brut);
      if (parMail) return parMail;
    }
    return domainFromUrl(brut);
  }

  /* Clé de mémorisation d'une correction : le compte quand il est connu — la correction
     vaut alors pour tous ses incidents — sinon l'enregistrement seul. */
  function cleCorrection() {
    if (!dernierClient) return null;
    return dernierClient.accountId ? 'account:' + dernierClient.accountId : dernierClient.cle;
  }

  /* Domaine corrigé dans le panneau : on mémorise, on purge le cache de la fiche
     courante, et on rejoue la seule résolution du tenant.

     La diffusion touche toutes les frames de l'onglet : seule celle qui détient
     l'enregistrement concerné réagit, les autres se taisent. */
  async function traiterSaisieManuelle(saisi, cle) {
    if (!dernierClient) return;
    if (cle && dernierClient.cle !== cle) return;

    const domaine = normaliserSaisie(saisi);
    if (!domaine) return;
    if (isMsaPersonalDomain(domaine)) {
      afficher({ statut: 'sans-tenant', cle: dernierClient.cle, domaine, source: 'saisi à la main' });
      return;
    }

    const cleMemo = cleCorrection();
    if (cleMemo) await enregistrerCorrection(cleMemo, domaine);
    cache.delete(dernierClient.cle);
    await resoudreDomaine(dernierClient.cle, domaine, 'saisi à la main');
  }

  /* Seuls les messages émis par ctx-main.js dans CETTE frame sont écoutés, et seules
     les frames visibles sont retenues : une session Omnicanal en arrière-plan décrit
     un enregistrement qui n'est pas celui que l'utilisateur regarde. */
  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const data = ev.data;
    if (!data || data.source !== CHANNEL) return;
    if (!integrationActive) return;   // interrupteur sur arrêt : plus rien n'est calculé
    if (!data.visible) return;

    /* Plus d'enregistrement affiché — vue de liste, tableau de bord, fiche fermée :
       le panneau n'a plus de sujet et disparaît. Sans ça il resterait à l'écran avec
       le tenant de la fiche précédente. */
    if (!data.record) {
      if (currentKey === null) return;
      currentKey = null;
      dernierClient = null;
      afficher(null);
      return;
    }
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
