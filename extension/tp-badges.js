/* ──────────────────────────────────────────────────────────────────────────────
   tp-badges.js — badges de classification, partagés par la popup et le panneau
   Dynamics. Mêmes noms de classes que l'application (hero-badge…), pour que les
   règles CSS soient une copie fidèle et que le rendu soit identique partout.

   Deux sources, deux fraîcheurs :

     • l'ANNUAIRE recopié par sync.js (clé tp_tags_v1) — disponible en permanence,
       mais ne porte que les tags VALIDÉS, et date de la dernière ouverture de
       l'application ;

     • le DÉTAIL d'un tenant, relayé à un onglet de l'application par le service
       worker — seule voie vers les demandes EN ATTENTE, et seulement si l'app est
       ouverte quelque part.

   L'affichage part donc de l'annuaire, puis se complète si le détail arrive. Les
   badges sont en LECTURE SEULE : proposer, valider ou retirer un tag reste dans
   l'application. L'extension n'écrit rien.
   ────────────────────────────────────────────────────────────────────────────── */

const TAGS_KEY = 'tp_tags_v1';

/* Repli des libellés quand l'API n'a pas encore été lue (copie de PREDEFINED_TAGS
   dans tenantpulse.js — à garder en phase). */
const TAGS_PREDEFINIS = [
  { key: 'direct', name: 'Direct' },
  { key: 'indirect', name: 'Indirect' },
  { key: 'gdap_actif', name: 'GDAP actif' },
  { key: 'gdap_non', name: 'GDAP : non' },
];

function lireAnnuaireTags() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(TAGS_KEY, res => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve((res && res[TAGS_KEY]) || null);
      });
    } catch { resolve(null); }
  });
}

/* Détail d'un tenant via un onglet de l'application. Rend null si aucune app n'est
   ouverte — l'appelant garde alors les seuls tags validés de l'annuaire. */
function demanderDetailTags(tenantId) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type: 'tp-tags-detail', tenantId }, rep => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(rep || null);
      });
    } catch { resolve(null); }
  });
}

function metaTag(type, definitions) {
  const d = (definitions || []).find(x => x.key === type)
    || TAGS_PREDEFINIS.find(x => x.key === type);
  return { label: d ? d.name : type, color: d && d.color ? d.color : null };
}

/* Âge de l'annuaire, dit sans détour : ces badges peuvent dater. */
function ageTexte(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 90) return "à l'instant";
  if (s < 3600) return 'il y a ' + Math.round(s / 60) + ' min';
  if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
  return 'il y a ' + Math.round(s / 86400) + ' j';
}

/* Construit les badges dans `conteneur` (vidé au préalable).
   `donnees` : { approuves:[{type,approvedAt}], enAttente:[{type,count,percent}],
                 definitions:[{key,name,color}], at:ISO, detaille:bool } */
function rendreBadges(conteneur, donnees) {
  conteneur.replaceChildren();
  if (!donnees) return false;

  const approuves = donnees.approuves || [];
  const enAttente = donnees.enAttente || [];
  if (!approuves.length && !enAttente.length) return false;

  approuves.forEach(t => {
    const meta = metaTag(t.type, donnees.definitions);
    const b = document.createElement('span');
    b.className = 'hero-badge hero-badge-approved';
    b.dataset.type = t.type;
    if (meta.color) b.style.setProperty('--tag-color', meta.color);
    const txt = document.createElement('span');
    txt.textContent = meta.label;
    b.appendChild(txt);
    b.title = 'Tag validé';
    conteneur.appendChild(b);
  });

  enAttente.forEach(p => {
    const meta = metaTag(p.type, donnees.definitions);
    const b = document.createElement('span');
    b.className = 'hero-badge hero-badge-pending';
    b.dataset.type = p.type;
    if (meta.color) b.style.setProperty('--tag-color', meta.color);
    const txt = document.createElement('span');
    txt.textContent = meta.label + (typeof p.percent === 'number' ? ' ' + p.percent + '%' : '');
    b.appendChild(txt);
    b.title = (p.count || 0) + ' demande(s) en attente — validation dans TenantPulse';
    conteneur.appendChild(b);
  });

  /* Sans détail, seuls les tags validés sont connus, et ils datent de la dernière
     ouverture de l'application : on le dit plutôt que de laisser croire au direct. */
  if (!donnees.detaille) {
    const age = ageTexte(donnees.at);
    const note = document.createElement('span');
    note.className = 'hero-badge-note';
    note.textContent = age ? 'validés · ' + age : 'validés';
    note.title = "Demandes en attente non disponibles : ouvrez TenantPulse pour actualiser.";
    conteneur.appendChild(note);
  }
  return true;
}

/* Chaîne complète pour un tenant : annuaire d'abord (immédiat), puis détail si une
   application est ouverte. `onRendu` est appelé à chaque étape ayant produit
   quelque chose, ce qui évite d'attendre le relais pour afficher les tags validés. */
async function chargerBadges(tenantId, conteneur, onRendu) {
  if (!tenantId || !conteneur) return;
  const annuaire = await lireAnnuaireTags();
  const definitions = annuaire ? annuaire.definitions : [];

  const approuvesCache = annuaire && annuaire.parTenant
    ? (annuaire.parTenant[tenantId.toLowerCase()] || [])
    : [];

  if (approuvesCache.length) {
    const rendu = rendreBadges(conteneur, {
      approuves: approuvesCache, enAttente: [], definitions,
      at: annuaire.at, detaille: false,
    });
    if (rendu && onRendu) onRendu();
  }

  const detail = await demanderDetailTags(tenantId);
  if (!detail) return;   // aucune app ouverte : on garde l'annuaire
  const rendu = rendreBadges(conteneur, {
    approuves: detail.approuves, enAttente: detail.enAttente, definitions,
    at: detail.at, detaille: true,
  });
  if (rendu && onRendu) onRendu();
}
