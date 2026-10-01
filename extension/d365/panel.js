/* ──────────────────────────────────────────────────────────────────────────────
   d365/panel.js — le panneau lui-même (monde isolé, frame principale seulement).

   Il se superpose à la section « Santé du client » plutôt que de la remplacer : le
   contrôle est rendu et re-rendu par le framework de Dynamics, tout nœud inséré dans
   son arbre finirait écrasé au premier cycle. Le panneau vit donc dans un élément
   attaché à <body>, en position fixe, calé sur le rectangle de la section — et
   repliable, ce qui redonne la section visible en dessous.

   Shadow DOM : isolation totale des styles, dans les deux sens. Le positionnement est
   écrit en JavaScript sur l'hôte (CSSOM, hors de portée de la CSP de la page), et
   recalculé par ResizeObserver + défilement, throttlés en requestAnimationFrame —
   jamais par un MutationObserver, qui sur le DOM d'Omnicanal coûterait des milliers
   de rappels par minute.

   Si la section reste introuvable, le panneau bascule en tiroir ancré à droite : mieux
   vaut un placement approximatif qu'un panneau absent parce qu'une mise à jour de
   Dynamics a renommé un conteneur.
   ────────────────────────────────────────────────────────────────────────────── */

const tpPanneau = (function () {
  /* Une page Dynamics compte des dizaines d'iframes : un panneau par frame serait
     absurde. Les frames de session relaient leur état à la frame principale. */
  if (window.top !== window) return { rendre() {}, configurer() {}, activer() {} };


  /* Titres possibles de la section d'ancrage. La langue de l'interface suit celle de
     l'utilisateur, et le libellé peut changer d'une mise à jour à l'autre — d'où une
     liste, et un repli en tiroir si aucun ne correspond. */
  const TITRES_ANCRE = ['Santé du client', 'Customer health', 'Customer Health'];
  const ANCRE_TENTATIVES = 12;
  const ANCRE_DELAI_MS = 1500;

  let hote = null, ombre = null, cadre = null, corps = null, tete = null, chevron = null, piedBouton = null;
  let boutonReplacer = null;
  /* Fiche actuellement affichée : changer de fiche remet le panneau replié. */
  let cleAffichee = null;
  let ancre = null, decoupeEl = null, observateur = null, rafId = null;
  let replie = false, modeTiroir = false;
  /* Chaîne de tentatives d'ancrage en cours. Mémorisée pour pouvoir l'annuler : sans
     cela, relancer une recherche pendant qu'une autre court ferait tourner deux chaînes
     en parallèle, chacune avec son propre compteur. */
  let minuteurAncrage = null;
  /* Position choisie à la main, en pixels ({top,left}) — null tant que l'utilisateur
     n'a rien déplacé. */
  let positionTiroir = null;
  /* Panneau détaché à la main : l'ancre est ignorée, le panneau reste où il a été posé.
     Distinct de `modeTiroir`, qui est un REPLI automatique quand la section « Santé du
     client » reste introuvable. Les deux mènent au même positionnement flottant, mais
     seul celui-ci résulte d'un choix — et lui seul survit à un ancrage redevenu
     possible. */
  let libre = false;
  let glisse = null;
  /* Interrupteur de la popup : masque le panneau sans rien démonter, pour que le
     rallumer le fasse réapparaître à l'instant, là où il était. */
  let eteint = false;
  let etatCourant = null;
  let tentatives = 0;
  let rappels = { surDomaineManuel: null };
  let raccourciOuvert = null;
  /* Profil de tuiles recopié de l'application par sync.js. Absent, normalizeProfile
     rend le profil par défaut — toutes les tuiles, dans l'ordre d'origine. */
  let profilMiroir = null;

  const creerEl = (tag, cls, texte) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (texte !== undefined) n.textContent = texte;
    return n;
  };

  // ── Ancrage ──────────────────────────────────────────────────────────────────

  /* Recherche par le texte du titre, puis remontée jusqu'à un conteneur de taille
     plausible. On ne s'accroche à aucun sélecteur propre à Dynamics : un identifiant
     interne survit rarement à une mise à jour, un libellé visible oui. */
  function trouverAncre() {
    for (const titre of TITRES_ANCRE) {
      let noeud = null;
      try {
        const res = document.evaluate(
          `//*[normalize-space(text())=${JSON.stringify(titre)}]`,
          document.body, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        );
        noeud = res.singleNodeValue;
      } catch { /* XPath indisponible : on essaie le titre suivant */ }
      if (!noeud) continue;

      let candidat = noeud;
      for (let i = 0; i < 8 && candidat; i++) {
        const r = candidat.getBoundingClientRect();
        if (r.width >= 220 && r.height >= 200) return elargir(candidat);
        candidat = candidat.parentElement;
      }
    }
    return null;
  }

  /* Le premier conteneur assez grand est souvent la boîte INTERNE de la carte : le
     panneau se retrouve alors en retrait de quelques pixels, visiblement désaligné avec
     les cartes voisines. On remonte donc tant que le parent reste « la même carte, en
     un peu plus large » — sans jamais sauter à la colonne entière, d'où les plafonds. */
  function elargir(depart) {
    let meilleur = depart;
    let p = depart.parentElement;
    for (let i = 0; i < 3 && p && p !== document.body; i++) {
      const rm = meilleur.getBoundingClientRect();
      const rp = p.getBoundingClientRect();
      const memeCarte = (rp.width - rm.width) <= 80 && (rp.height - rm.height) <= 120
        && rp.width >= rm.width && rp.height >= rm.height;
      if (!memeCarte || rp.width > window.innerWidth * 0.5) break;
      meilleur = p;
      p = p.parentElement;
    }
    return meilleur;
  }

  /* Repart d'une feuille blanche : ancre oubliée, compteur remis à zéro, chaîne de
     tentatives précédente annulée.

     C'est ce qui manquait. Une fois les douze tentatives épuisées, plus RIEN ne
     relançait la recherche : le compteur restait au-delà du plafond, et l'unique
     appel à attacher() encore vivant — dans positionner() — était de surcroît
     conditionné à « pas en mode tiroir », donc mort dès que le tiroir s'enclenchait.
     Fermer ses fiches suffisait donc à coller le panneau en haut à droite jusqu'au
     rechargement de la page. On relance désormais à chaque nouvelle fiche. */
  function relancerAncrage() {
    // Détaché à la main : l'ancre ne le concerne plus, y compris sur une nouvelle fiche.
    if (libre) return;
    if (minuteurAncrage !== null) { clearTimeout(minuteurAncrage); minuteurAncrage = null; }
    if (observateur) { try { observateur.disconnect(); } catch {} }
    ancre = null;
    decoupeEl = null;
    tentatives = 0;
    attacher();
  }

  /* La section n'existe pas au chargement : elle arrive avec le rendu du formulaire.
     On réessaie quelques fois, puis on se rabat sur le tiroir. */
  function attacher() {
    minuteurAncrage = null;
    if (ancre && ancre.isConnected) return;
    ancre = trouverAncre();

    if (!ancre) {
      if (!modeTiroir) basculerTiroir(true);   // visible en attendant mieux
      if (++tentatives <= ANCRE_TENTATIVES) minuteurAncrage = setTimeout(attacher, ANCRE_DELAI_MS);
      return;
    }

    basculerTiroir(false);
    decoupeEl = trouverDecoupe(ancre);
    try {
      if (observateur) observateur.disconnect();
      observateur = new ResizeObserver(planifier);
      observateur.observe(ancre);
    } catch { /* sans ResizeObserver, le défilement et le redimensionnement suffisent */ }
    positionner();
  }

  /* Conteneur défilant qui découpe la section. Un élément en position fixe ne se
     laisse rogner par aucun ancêtre : sans ce calcul d'intersection, le panneau
     déborderait sur la barre de commandes dès que le formulaire défile.
     Résolu une fois par ancrage, jamais dans la boucle de positionnement —
     getComputedStyle sur toute une lignée d'ancêtres n'a rien à faire à 60 Hz. */
  function trouverDecoupe(depuis) {
    let p = depuis.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      let st;
      try { st = getComputedStyle(p); } catch { break; }
      const flot = st.overflowY;
      if ((flot === 'auto' || flot === 'scroll') && p.scrollHeight > p.clientHeight + 4) return p;
      p = p.parentElement;
    }
    return null;
  }

  function zoneDecoupe() {
    if (decoupeEl && decoupeEl.isConnected) {
      const r = decoupeEl.getBoundingClientRect();
      return { haut: Math.max(0, r.top), bas: Math.min(window.innerHeight, r.bottom) };
    }
    return { haut: 0, bas: window.innerHeight };
  }

  /* Le panneau flotte — position fixe indépendante de la section — dans deux cas :
     un repli automatique faute d'ancre, ou un détachement volontaire. */
  const estFlottant = () => libre || modeTiroir;

  function basculerTiroir(actif) {
    modeTiroir = actif;
    if (actif && observateur) { try { observateur.disconnect(); } catch {} }
    majAffordances();
    positionner();
  }

  /* Curseur, infobulle et bouton de replacement suivent l'état courant. Regroupés ici
     parce que trois chemins les font changer : le repli automatique, le détachement à
     la main, et le retour à l'ancrage. */
  function majAffordances() {
    if (cadre) cadre.classList.toggle('est-flottant', estFlottant());
    if (tete) {
      tete.title = estFlottant()
        ? 'Glisser pour déplacer · double-clic pour réancrer sur « Santé du client »'
        : 'Glisser pour détacher le panneau et le poser où vous voulez';
    }
    if (boutonReplacer) boutonReplacer.hidden = !estFlottant();
  }

  function planifier() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => { rafId = null; positionner(); });
  }

  /* ── Déplacement à la main ───────────────────────────────────────────────────
     Disponible À TOUT MOMENT, y compris quand le panneau est correctement ancré sur
     « Santé du client » : tirer sur l'en-tête le DÉTACHE et le pose où on veut. Le
     réserver au repli automatique revenait à ne jamais l'offrir — l'ancrage fonctionne,
     donc ce cas ne survient presque plus.

     Le détachement est un choix, il est donc persistant : il survit au changement de
     fiche et au rechargement de la page. Pour revenir à l'ancrage, le bouton ⤢ de
     l'en-tête ou un double-clic dessus. */
  const POS_KEY = 'tp_d365_pos_v1';
  const LARGEUR_TIROIR = 320;

  /* Maintient le panneau atteignable : au moins un bandeau visible à l'écran, jamais
     poussé hors cadre par un déplacement ou un redimensionnement de la fenêtre.
     Largeur en dur plutôt que mesurée : positionner() appelle cette fonction à chaque
     défilement, et un getBoundingClientRect y forcerait un recalcul de mise en page à
     60 Hz pour une valeur qui ne bouge jamais. */
  function borner(left, top) {
    const maxL = Math.max(0, window.innerWidth - LARGEUR_TIROIR);
    const maxT = Math.max(0, window.innerHeight - 40);
    return {
      left: Math.min(Math.max(0, left), maxL),
      top: Math.min(Math.max(0, top), maxT),
    };
  }

  function memoriserPosition() {
    try {
      if (positionTiroir || libre) chrome.storage.local.set({ [POS_KEY]: { ...positionTiroir, libre } });
      else chrome.storage.local.remove(POS_KEY);
    } catch {}
  }

  function chargerPosition() {
    try {
      chrome.storage.local.get(POS_KEY, (res) => {
        if (chrome.runtime.lastError) return;
        const p = res && res[POS_KEY];
        if (!p) return;
        if (Number.isFinite(p.top) && Number.isFinite(p.left)) {
          positionTiroir = { top: p.top, left: p.left };
        }
        libre = p.libre === true;
        majAffordances();
        positionner();
      });
      /* L'interrupteur « Position libre » de la popup écrit dans cette même clé. Le
         basculement s'applique donc aux onglets Dynamics déjà ouverts, sans rechargement :
         un message runtime, lui, n'atteindrait pas les frames de session d'Omnicanal. */
      chrome.storage.onChanged.addListener((changements, zone) => {
        if (zone !== 'local' || !changements[POS_KEY]) return;
        if (glisse) return;   // déplacement en cours : l'écriture vient de nous
        appliquerLibre(changements[POS_KEY].newValue);
      });
    } catch {}
  }

  /* N'agit que sur le BASCULEMENT ancré ↔ libre. Les écritures de simple position — une
     à chaque fin de glissement — déclenchent aussi cet écouteur, y compris dans l'onglet
     qui vient de les produire : les ignorer évite un aller-retour inutile, et surtout
     que la position mémorisée n'écrase celle qu'un autre onglet est en train de régler. */
  function appliquerLibre(valeur) {
    const veutLibre = !!(valeur && valeur.libre);
    if (veutLibre === libre) return;

    if (!veutLibre) { replacerPanneau(false); return; }

    libre = true;
    if (observateur) { try { observateur.disconnect(); } catch {} }
    positionTiroir = (valeur && Number.isFinite(valeur.top) && Number.isFinite(valeur.left))
      ? { top: valeur.top, left: valeur.left }
      : null;
    majAffordances();
    positionner();
  }

  /* Distance à parcourir avant qu'une pression ne devienne un déplacement. Sans ce
     seuil, un simple clic sur le titre détacherait le panneau de sa section — et un
     double-clic, qui sert justement à le réancrer, le détacherait d'abord. */
  const SEUIL_GLISSE = 4;

  function debuterGlisse(e) {
    if (e.button !== 0) return;
    // Le chevron de repli et le bouton de replacement vivent ici : ce ne sont pas des prises.
    if (e.target && e.target.closest && e.target.closest('button')) return;

    const r = hote.getBoundingClientRect();
    /* `actif` reste faux tant que le seuil n'est pas franchi : jusque-là, rien n'a
       bougé, rien n'est détaché, et l'événement reste un clic ordinaire.
       Pas de preventDefault ici — il supprimerait les événements souris de
       compatibilité, donc le clic et le double-clic de l'en-tête. */
    glisse = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, actif: false };
    try { tete.setPointerCapture(e.pointerId); } catch {}
  }

  function suivreGlisse(e) {
    if (!glisse) return;

    if (!glisse.actif) {
      if (Math.abs(e.clientX - glisse.x0) < SEUIL_GLISSE
        && Math.abs(e.clientY - glisse.y0) < SEUIL_GLISSE) return;
      glisse.actif = true;
      /* Tirer sur un panneau ancré le DÉTACHE. L'observateur de taille de la section
         n'a alors plus lieu d'être : il rappellerait positionner() à chaque re-rendu du
         formulaire pour une géométrie que le panneau ne suit plus. */
      if (!libre) {
        libre = true;
        if (observateur) { try { observateur.disconnect(); } catch {} }
        majAffordances();
        /* Le panneau détaché reprend la largeur du tiroir, souvent plus étroite que la
           section qu'il occupait. Une prise saisie près du bord droit se retrouverait
           alors hors du panneau, qui semblerait sauter loin du curseur. */
        glisse.dx = Math.min(glisse.dx, LARGEUR_TIROIR - 24);
      }
      if (cadre) cadre.classList.add('en-glisse');
    }

    positionTiroir = borner(e.clientX - glisse.dx, e.clientY - glisse.dy);
    planifier();
    e.preventDefault();
  }

  function finirGlisse(e) {
    if (!glisse) return;
    const bouge = glisse.actif;
    glisse = null;
    try { tete.releasePointerCapture(e.pointerId); } catch {}
    if (!bouge) return;   // pression sans déplacement : rien à mémoriser
    if (cadre) cadre.classList.remove('en-glisse');
    memoriserPosition();
  }

  /* Retour à l'ancrage : on relance la recherche de section. Si elle reste introuvable,
     relancerAncrage() rebascule en tiroir.

     La position choisie n'est PAS oubliée, seul l'état « détaché » l'est : réactiver le
     mode libre — depuis la popup ou en tirant à nouveau sur l'en-tête — doit remettre le
     panneau là où il avait été posé, pas dans un coin par défaut.

     `memoriser` est faux quand l'ordre vient déjà du stockage (interrupteur de la popup) :
     réécrire ce qu'on vient de lire ne servirait qu'à relancer l'écouteur. */
  function replacerPanneau(memoriser = true) {
    libre = false;
    if (memoriser) memoriserPosition();
    majAffordances();
    relancerAncrage();
  }

  /* Positionnement en CSSOM : la CSP d'une page n'a pas prise sur element.style,
     contrairement à un attribut « style » écrit dans du balisage. */
  function positionner() {
    if (!hote) return;

    /* Sans état à montrer, le panneau reste masqué — quoi qu'il arrive ensuite.
       Ce garde-fou est indispensable : positionner() est rappelé à chaque défilement,
       redimensionnement et tentative d'ancrage, et il rétablissait « display: block »
       juste après un effacement. Hors d'une fiche, le panneau réapparaissait donc
       aussitôt, en tiroir, par-dessus une vue de liste. */
    if (eteint || !etatCourant) { hote.style.display = 'none'; return; }

    /* Flottant — détaché à la main, ou replié faute d'ancre. L'ancre n'est ni consultée
       ni recherchée : c'est ce qui rend le détachement stable d'une fiche à l'autre. */
    if (estFlottant()) {
      hote.style.display = 'block';
      /* Découpe héritée du mode ancré : sans cette remise à zéro, un panneau rogné au
         moment où l'ancre disparaît restait rogné — voire entièrement invisible — une
         fois passé en flottant. */
      hote.style.clipPath = '';
      hote.style.width = LARGEUR_TIROIR + 'px';
      hote.style.height = replie ? 'auto' : 'min(420px, 60vh)';
      if (positionTiroir) {
        const p = borner(positionTiroir.left, positionTiroir.top);
        hote.style.top = Math.round(p.top) + 'px';
        hote.style.left = Math.round(p.left) + 'px';
        hote.style.right = 'auto';
      } else {
        hote.style.top = '96px';
        hote.style.right = '16px';
        hote.style.left = 'auto';
      }
      return;
    }

    /* Ancre disparue alors qu'on la suivait (changement de fiche, re-rendu du
       formulaire) : on repart en recherche. Un seul passage — relancerAncrage() bascule
       aussitôt en tiroir si rien n'est trouvé, et les appels suivants prennent la
       branche ci-dessus sans refaire de XPath. */
    if (!ancre || !ancre.isConnected) { relancerAncrage(); return; }

    const r = ancre.getBoundingClientRect();
    const zone = zoneDecoupe();

    // Section masquée (session en arrière-plan) ou hors du cadre : on s'efface.
    const visible = Math.min(r.bottom, zone.bas) - Math.max(r.top, zone.haut);
    if (r.width < 120 || visible < 24) { hote.style.display = 'none'; return; }

    /* Le panneau garde la taille et la position de la section — il défile avec elle.
       Ce qui dépasse de la zone défilante n'est pas retiré mais MASQUÉ par une découpe :
       redimensionner ferait sauter la mise en page à chaque cran de molette, alors que
       la découpe donne exactement ce qu'on attend d'un panneau ordinaire — il glisse
       sous le bandeau. Un élément en position fixe ne pouvant être rogné par aucun
       ancêtre, la découpe est calculée ici. */
    hote.style.display = 'block';
    hote.style.right = 'auto';
    hote.style.top = Math.round(r.top) + 'px';
    hote.style.left = Math.round(r.left) + 'px';
    hote.style.width = Math.round(r.width) + 'px';
    hote.style.height = replie ? 'auto' : Math.round(r.height) + 'px';

    const hauteurReelle = replie ? hote.getBoundingClientRect().height : r.height;
    const coupeHaut = Math.max(0, zone.haut - r.top);
    const coupeBas = Math.max(0, (r.top + hauteurReelle) - zone.bas);
    hote.style.clipPath = (coupeHaut || coupeBas)
      ? `inset(${Math.round(coupeHaut)}px 0px ${Math.round(coupeBas)}px 0px)`
      : '';
  }

  // ── Construction ─────────────────────────────────────────────────────────────

  async function chargerStyle() {
    let css = '';
    try { css = await (await fetch(chrome.runtime.getURL('d365/panel.css'))).text(); } catch { return; }
    try {
      const feuille = new CSSStyleSheet();
      feuille.replaceSync(css);
      ombre.adoptedStyleSheets = [feuille];
    } catch {
      // Feuilles constructibles indisponibles : un <style> dans l'ombre fait l'affaire.
      const st = creerEl('style');
      st.textContent = css;
      ombre.appendChild(st);
    }
  }

  function creer() {
    hote = creerEl('div');
    hote.setAttribute('data-tp-panneau', '1');
    hote.style.position = 'fixed';
    hote.style.zIndex = '2147483000';
    hote.style.display = 'none';
    document.body.appendChild(hote);

    ombre = hote.attachShadow({ mode: 'open' });
    chargerStyle();

    cadre = creerEl('div', 'tp');

    tete = creerEl('div', 'tp-head');
    /* Prise de déplacement. « pointer* » plutôt que « mouse* » : la capture de pointeur
       garde le suivi même quand le curseur passe au-dessus d'une iframe de Dynamics,
       qui mangerait les mousemove. */
    tete.addEventListener('pointerdown', debuterGlisse);
    tete.addEventListener('pointermove', suivreGlisse);
    tete.addEventListener('pointerup', finirGlisse);
    tete.addEventListener('pointercancel', finirGlisse);
    tete.addEventListener('dblclick', () => { if (estFlottant()) replacerPanneau(); });
    /* Logo TP : le glyphe noir, comme dans la popup en thème clair. Le panneau ne suit
       pas le thème système (voir panel.css) — Omnicanal est toujours blanc. */
    const logo = creerEl('img', 'tp-logo');
    try { logo.src = chrome.runtime.getURL('assets/DarkTP.png'); } catch {}
    logo.alt = '';
    /* Le glissement natif d'une image prendrait la main sur celui du panneau — et comme
       on ne peut plus l'annuler depuis pointerdown (voir debuterGlisse), on le coupe ici. */
    logo.draggable = false;
    tete.appendChild(logo);
    tete.appendChild(creerEl('span', 'tp-titre', 'TenantPulse'));

    /* Retour à l'ancrage. Visible seulement quand le panneau flotte — le double-clic
       fait la même chose, mais rien ne le laisse deviner : sans ce bouton, un panneau
       déplacé par erreur n'a aucune issue apparente. */
    boutonReplacer = creerEl('button', 'tp-bouton-replacer', '⤢');
    boutonReplacer.type = 'button';
    boutonReplacer.hidden = true;
    boutonReplacer.title = 'Réancrer sur « Santé du client »';
    boutonReplacer.setAttribute('aria-label', 'Réancrer le panneau sur la section « Santé du client »');
    // Enveloppé : passer la fonction directement livrerait l'objet Event en `memoriser`.
    boutonReplacer.addEventListener('click', () => replacerPanneau());
    tete.appendChild(boutonReplacer);

    chevron = creerEl('button', 'tp-bouton-replier', '▾');
    chevron.type = 'button';
    chevron.setAttribute('aria-expanded', 'true');
    chevron.setAttribute('aria-label', 'Replier le panneau');
    chevron.addEventListener('click', () => appliquerRepli(!replie));
    tete.appendChild(chevron);

    corps = creerEl('div', 'tp-corps');

    /* Second point de repli, en pied de panneau : une fois déplié, le panneau occupe
       toute la hauteur de la section et son en-tête peut être hors de vue — refermer
       depuis le bas évite d'avoir à remonter. */
    const pied = creerEl('div', 'tp-pied');
    piedBouton = creerEl('button', 'tp-pied-bouton', 'Replier ▴');
    piedBouton.type = 'button';
    piedBouton.addEventListener('click', () => appliquerRepli(true));
    pied.appendChild(piedBouton);

    cadre.appendChild(tete);
    cadre.appendChild(corps);
    cadre.appendChild(pied);
    ombre.appendChild(cadre);

    /* Le panneau naît replié et le redevient à chaque nouvelle fiche : il se superpose
       à « Santé du client », qu'il masquerait en permanence sinon. L'ouvrir est un
       geste volontaire, valable pour la fiche en cours — d'où l'absence de mémorisation
       d'un état déplié d'une fiche à l'autre. */
    appliquerRepli(true);

    try {
      chrome.storage.local.get('tp_mirror_v1', (res) => {
        const miroir = res && res.tp_mirror_v1;
        if (miroir && miroir.profile) { profilMiroir = miroir.profile; dessiner(); }
      });
    } catch {}

    /* Un clic hors du menu de raccourcis le referme, comme dans la popup. Posé sur
       l'ombre : un écouteur sur le document de Dynamics serait à la fois inutile
       (les clics du panneau n'en sortent pas) et intrusif. */
    ombre.addEventListener('click', (e) => {
      if (!raccourciOuvert) return;
      const cible = e.target;
      if (cible.closest && (cible.closest('.hero-shortcut-panel') || cible.closest('.hero-btn-chevron'))) return;
      fermerRaccourcis();
    });

    window.addEventListener('resize', planifier, { passive: true });
    // capture:true — le défilement utile est celui des conteneurs internes de Dynamics,
    // et un événement de défilement ne remonte pas jusqu'à window.
    window.addEventListener('scroll', planifier, { passive: true, capture: true });

    chargerPosition();
    attacher();
  }

  function appliquerRepli(valeur) {
    replie = !!valeur;
    if (cadre) cadre.classList.toggle('est-replie', replie);
    if (chevron) {
      chevron.textContent = replie ? '▸' : '▾';
      chevron.setAttribute('aria-expanded', replie ? 'false' : 'true');
      chevron.setAttribute('aria-label', replie ? 'Déplier le panneau' : 'Replier le panneau');
    }
    positionner();
  }

  // ── Contenu ──────────────────────────────────────────────────────────────────

  /* Domaine analysé et sa provenance, sous le GUID — comme dans la popup. */
  function ligneDomaine(etat) {
    const d = creerEl('div', 'hero-domain');
    d.appendChild(creerEl('span', null, etat.domaine || 'Domaine non résolu'));
    if (etat.source) d.appendChild(creerEl('span', 'hero-source', ' · ' + etat.source));
    return d;
  }

  /* Bloc résultat : le hero de TenantPulse, repris tel quel de la popup. C'est la
     signature visuelle de l'outil — le conteneur, lui, imite une carte Dynamics. */
  /* Structure calquée sur renderResult() de la popup, dans le même ordre : étiquette
     avec le logo Microsoft, puis GUID + bouton de copie SUR LA MÊME LIGNE, puis le
     domaine. Une disposition maison donnait un hero qui ne ressemblait pas à celui de
     l'application. */
  function bloqueHero(etat) {
    const hero = creerEl('div', 'tenant-hero' + (etat.tenantId ? '' : ' no-tenant'));

    /* Filigrane Microsoft : une balise plutôt qu'un ::after, la feuille étant adoptée
       comme CSSStyleSheet construite — ses url() se résoudraient contre Dynamics. */
    const filigrane = creerEl('img', 'hero-filigrane');
    try { filigrane.src = chrome.runtime.getURL('assets/MicrosoftN.png'); } catch {}
    filigrane.alt = '';
    hero.appendChild(filigrane);

    const label = creerEl('div', 'hero-label');
    const logoMs = creerEl('img');
    try { logoMs.src = chrome.runtime.getURL('assets/Microsoft.png'); } catch {}
    logoMs.alt = '';
    label.appendChild(logoMs);
    label.appendChild(creerEl('span', null, etat.tenantId ? 'Microsoft Tenant ID' : 'Microsoft 365'));
    hero.appendChild(label);

    if (!etat.tenantId) {
      hero.appendChild(creerEl('div', 'hero-none', 'Aucun tenant Microsoft 365 détecté pour ce domaine'));
      hero.appendChild(ligneDomaine(etat));
      return hero;
    }

    const guid = creerEl('div', 'hero-guid');
    guid.appendChild(creerEl('span', null, etat.tenantId));
    const bouton = creerEl('button', 'hero-copy-btn', 'Copier');
    bouton.type = 'button';
    bouton.addEventListener('click', () => copier(etat.tenantId, bouton));
    guid.appendChild(bouton);
    hero.appendChild(guid);

    hero.appendChild(ligneDomaine(etat));

    /* Badges de classification, en lecture seule — mêmes données et même rendu que
       dans la popup et dans l'application (tp-badges.js). */
    const zoneTags = creerEl('div', 'hero-tags-badges');
    zoneTags.hidden = true;
    hero.appendChild(zoneTags);
    chargerBadges(etat.tenantId, zoneTags, () => { zoneTags.hidden = false; });

    const tuiles = bloqueTuiles(etat, hero);
    if (tuiles) hero.appendChild(tuiles);
    return hero;
  }

  // ── Tuiles de redirection et raccourcis (portage de popup.js) ────────────────

  function fermerRaccourcis() {
    raccourciOuvert = null;
    const p = ombre && ombre.querySelector('.hero-shortcut-panel');
    if (p) p.remove();
    if (ombre) ombre.querySelectorAll('.hero-btn-chevron').forEach(c => c.setAttribute('aria-expanded', 'false'));
  }

  function ouvrirRaccourcis(btn, chev, ctx, conteneur) {
    const etaitOuvert = raccourciOuvert === btn.key;
    fermerRaccourcis();
    if (etaitOuvert) return;   // re-clic sur le même chevron : simple fermeture

    const panneau = creerEl('div', 'hero-shortcut-panel');
    panneau.setAttribute('role', 'menu');
    panneau.appendChild(creerEl('div', 'hero-shortcut-menu-title', btn.label));

    // Accueil du centre — même cible que le clic sur la tuile.
    let principal = safeRedirectHref(btn.href, ctx.tenantId, ctx.domain);
    if (btn.key === 'sharepoint') {
      principal = ctx.spTenant
        ? resolveShortcutUrl('https://{spTenant}-admin.sharepoint.com/_layouts/15/online/AdminHome.aspx', ctx)
        : null;
    }
    if (principal) panneau.appendChild(lienRaccourci('Accueil', principal, 'hero-shortcut-opt primary'));

    (ADMIN_SHORTCUTS[btn.key] || []).forEach(sc => {
      const url = resolveShortcutUrl(sc.url, ctx);
      if (url) { panneau.appendChild(lienRaccourci(sc.label, url, 'hero-shortcut-opt')); return; }
      const inactif = creerEl('span', 'hero-shortcut-opt disabled', sc.label);
      inactif.title = sc.url.includes('{spTenant}')
        ? "Nom de tenant SharePoint non détecté (CNAME DKIM absent). Ouvrez SharePoint via M365 Admin."
        : sc.url.includes('{domain}')
          ? 'Domaine inconnu pour ce Tenant ID — lien indisponible.'
          : 'Lien indisponible pour ce tenant.';
      panneau.appendChild(inactif);
    });

    conteneur.appendChild(panneau);
    raccourciOuvert = btn.key;
    chev.setAttribute('aria-expanded', 'true');
  }

  function lienRaccourci(texte, href, classe) {
    const a = creerEl('a', classe, texte);
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.setAttribute('role', 'menuitem');
    return a;
  }

  /* Grille des centres d'administration, dans l'ordre du profil synchronisé depuis
     l'application — exactement la même config que la popup (tp-core.js). Un clic
     ouvre un onglet, jamais plusieurs : les postes gérés bloquent les pop-ups. */
  function bloqueTuiles(etat, conteneur) {
    if (!etat.tenantId) return null;
    const profil = normalizeProfile(profilMiroir);
    const actives = orderedRedirectButtons(profil).filter(b => profil[b.key] !== false);
    if (!actives.length) return null;

    const ctx = { tenantId: etat.tenantId, domain: etat.domaine || null, spTenant: etat.spTenant || null };
    const grille = creerEl('div', 'hero-actions');

    actives.forEach(btn => {
      let href = safeRedirectHref(btn.href, ctx.tenantId, ctx.domain);
      let inactif = false;

      if (btn.key === 'sharepoint') {
        const direct = ctx.spTenant
          ? resolveShortcutUrl('https://{spTenant}-admin.sharepoint.com/_layouts/15/online/AdminHome.aspx', ctx)
          : null;
        if (direct) href = direct; else inactif = true;
      }
      if (!href) return;   // cible non fiable : tuile non rendue
      if (!inactif && /[?&]delegatedOrg=(&|$)/.test(href)) inactif = true;

      const cellule = creerEl('div', 'hero-btn-cell');

      const chev = creerEl('button', 'hero-btn-chevron', '▾');
      chev.type = 'button';
      chev.setAttribute('aria-expanded', 'false');
      chev.setAttribute('aria-label', 'Raccourcis ' + btn.label);
      chev.addEventListener('click', (e) => { e.stopPropagation(); ouvrirRaccourcis(btn, chev, ctx, conteneur); });

      const a = creerEl('a', 'hero-partner-btn'
        + (btn.key === 'partnerCenter' ? ' recommended' : '')
        + (inactif ? ' disabled' : ''));
      if (inactif) {
        a.setAttribute('aria-disabled', 'true');
        a.title = btn.key === 'sharepoint'
          ? "Lien direct SharePoint indisponible (nom de tenant non détecté). Ouvrez SharePoint via la tuile M365 Admin."
          : "Domaine inconnu pour ce Tenant ID — ce centre a besoin du domaine.";
        a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); ouvrirRaccourcis(btn, chev, ctx, conteneur); });
      } else {
        a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      }

      const icone = creerEl('img', 'hero-partner-btn-icon' + (btn.key === 'partnerCenter' ? ' hero-icon-invert' : ''));
      // Les icônes sont des ressources de l'extension : chemin absolu chrome-extension://,
      // déclaré dans « web_accessible_resources » pour être chargeable depuis la page.
      try { icone.src = chrome.runtime.getURL(btn.icon); } catch {}
      icone.alt = '';

      const texte = creerEl('div', 'hero-partner-btn-text');
      texte.appendChild(creerEl('span', 'hero-partner-btn-label', btn.label));
      texte.appendChild(creerEl('span', 'hero-partner-btn-sub', btn.sub));
      a.appendChild(icone); a.appendChild(texte);

      cellule.appendChild(a); cellule.appendChild(chev);
      grille.appendChild(cellule);
    });

    return grille;
  }

  async function copier(texte, bouton) {
    let ok = false;
    try { await navigator.clipboard.writeText(texte); ok = true; }
    catch {
      // Repli sans permission « clipboard » : la zone de texte doit vivre dans le
      // document de la page, execCommand ignorant le contenu d'un Shadow DOM.
      try {
        const zone = creerEl('textarea');
        zone.value = texte;
        zone.style.position = 'fixed';
        zone.style.opacity = '0';
        document.body.appendChild(zone);
        zone.select();
        ok = document.execCommand('copy');
        zone.remove();
      } catch {}
    }
    bouton.textContent = ok ? 'Copié' : 'Échec';
    if (ok) bouton.classList.add('copied');
    setTimeout(() => { bouton.textContent = 'Copier'; bouton.classList.remove('copied'); }, 1400);
  }

  /* Saisie manuelle du domaine : le champ « site web » d'un compte est souvent vide,
     et c'est alors la seule source possible. La valeur est mémorisée par compte, donc
     saisie une fois pour toutes. */
  function bloquesSaisie(etat) {
    const bloc = creerEl('div', 'tp-saisie');
    bloc.appendChild(creerEl('div', 'tp-etiquette', 'Domaine du client'));

    const ligne = creerEl('div', 'tp-saisie-ligne');
    const champ = creerEl('input', 'tp-champ');
    champ.type = 'text';
    champ.placeholder = 'exemple.fr';
    champ.spellcheck = false;
    champ.value = etat.domaine || '';
    champ.setAttribute('aria-label', 'Domaine du client');

    const valider = creerEl('button', 'tp-valider', 'Chercher');
    valider.type = 'button';

    const envoyer = () => {
      const v = champ.value.trim();
      if (!v || !rappels.surDomaineManuel) return;
      // La clé accompagne la saisie : la correction ne doit s'appliquer qu'à la fiche
      // affichée, jamais à celle qu'une autre frame garderait en mémoire.
      rappels.surDomaineManuel(v, etat.cle);
    };
    valider.addEventListener('click', envoyer);
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); envoyer(); } });

    ligne.appendChild(champ);
    ligne.appendChild(valider);
    bloc.appendChild(ligne);
    bloc.appendChild(creerEl('div', 'tp-note', 'Mémorisé pour ce client, localement.'));
    return bloc;
  }

  function dessiner() {
    if (!corps) return;
    fermerRaccourcis();
    corps.replaceChildren();
    const etat = etatCourant || {};

    if (etat.statut === 'recherche') {
      const l = creerEl('div', 'tp-attente');
      l.appendChild(creerEl('span', 'tp-rond'));
      l.appendChild(creerEl('span', null, etat.message || 'Résolution en cours…'));
      corps.appendChild(l);
      return;
    }

    if (etat.statut === 'verrouille') {
      corps.appendChild(creerEl('div', 'tp-message alerte', etat.message || 'Extension verrouillée.'));
      return;
    }

    if (etat.statut === 'resolu' && etat.tenantId) {
      corps.appendChild(bloqueHero(etat));
      return;
    }

    if (etat.statut === 'sans-tenant') {
      corps.appendChild(bloqueHero(etat));
      corps.appendChild(bloquesSaisie(etat));
      return;
    }

    // « sans-domaine » ne passe jamais ici : il fait disparaître le panneau (STATUTS_MUETS).
    corps.appendChild(creerEl('div', 'tp-message', etat.message || 'Aucune fiche client à analyser.'));
  }

  // ── Interface publique ───────────────────────────────────────────────────────

  function configurer(r) {
    rappels = { ...rappels, ...(r || {}) };
  }

  /* Le panneau n'existe que pour une fiche. Hors d'un enregistrement — vue de liste,
     tableau de bord, page d'accueil — il s'efface au lieu de rester affiché avec le
     résultat de la fiche précédente.

     L'effacement n'est honoré que s'il vient de la frame qui a produit l'état courant :
     dans Omnicanal, la frame principale peut afficher une liste pendant qu'une session
     ouverte, dans sa propre frame, tient toujours son incident. */
  function effacer(emetteur) {
    if (etatCourant && etatCourant.emetteur && emetteur && etatCourant.emetteur !== emetteur) return;
    etatCourant = null;
    cleAffichee = null;   // rouvrir la même fiche la retrouvera repliée
    if (hote) hote.style.display = 'none';
  }

  /* Statuts qui font disparaître le panneau plutôt que d'afficher quelque chose :
     hors d'une fiche, et fiche sans aucune adresse ni site web exploitable. Rien à
     montrer, donc rien à l'écran — le panneau ne doit pas encombrer le formulaire pour
     dire qu'il n'a rien trouvé. Conséquence assumée : la saisie manuelle d'un domaine
     n'est plus atteignable dans ce cas, seulement quand un domaine a été trouvé mais
     qu'aucun tenant n'y répond. */
  const STATUTS_MUETS = new Set(['inactif', 'sans-domaine']);

  function rendre(etat) {
    if (!etat || STATUTS_MUETS.has(etat.statut)) { effacer(etat && etat.emetteur); return; }

    /* Changement de fiche → repli. Le panneau recouvre « Santé du client » : le laisser
       ouvert d'un ticket à l'autre masquerait cette section en permanence. L'ouvrir
       reste un geste volontaire, valable pour la fiche en cours. */
    const nouvelleFiche = !!etat.cle && etat.cle !== cleAffichee;
    etatCourant = etat;
    if (!hote) creer();
    if (nouvelleFiche) {
      cleAffichee = etat.cle;
      appliquerRepli(true);
      /* Nouvelle fiche = nouveau formulaire, donc nouvelle section « Santé du client ».
         C'est le seul moment où retenter l'ancrage a un sens — et c'est ce qui sort le
         panneau du tiroir où il s'était installé pendant qu'aucune fiche n'était
         ouverte. Sans cette relance, le tiroir était définitif jusqu'au rechargement. */
      relancerAncrage();
    }

    dessiner();
    positionner();
  }

  /* Interrupteur : masquage pur, sans rien démonter.

     Détruire le panneau serait sans retour — plus rien ne le reconstruit tant que la
     fiche ne change pas, et le rallumer ne donnait donc rien tant qu'on restait sur le
     même ticket. Un simple masquage rend l'opération symétrique : arrêt = invisible,
     marche = de nouveau là, immédiatement, à sa place. */
  function activer(actif) {
    eteint = !actif;
    if (eteint) { fermerRaccourcis(); if (hote) hote.style.display = 'none'; return; }
    positionner();   // réaffiche si un état est en place, ne fait rien sinon
  }

  return { rendre, configurer, activer };
})();
