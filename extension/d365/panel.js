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
  if (window.top !== window) return { rendre() {}, configurer() {} };


  /* Titres possibles de la section d'ancrage. La langue de l'interface suit celle de
     l'utilisateur, et le libellé peut changer d'une mise à jour à l'autre — d'où une
     liste, et un repli en tiroir si aucun ne correspond. */
  const TITRES_ANCRE = ['Santé du client', 'Customer health', 'Customer Health'];
  const ANCRE_TENTATIVES = 12;
  const ANCRE_DELAI_MS = 1500;

  let hote = null, ombre = null, cadre = null, corps = null, chevron = null, piedBouton = null;
  /* Fiche actuellement affichée : changer de fiche remet le panneau replié. */
  let cleAffichee = null;
  let ancre = null, decoupeEl = null, observateur = null, rafId = null;
  let replie = false, modeTiroir = false;
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

  /* La section n'existe pas au chargement : elle arrive avec le rendu du formulaire.
     On réessaie quelques fois, puis on se rabat sur le tiroir. */
  function attacher() {
    if (ancre && ancre.isConnected) return;
    ancre = trouverAncre();

    if (!ancre) {
      if (++tentatives <= ANCRE_TENTATIVES) {
        setTimeout(attacher, ANCRE_DELAI_MS);
        if (!modeTiroir) basculerTiroir(true);   // visible en attendant mieux
        return;
      }
      basculerTiroir(true);
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

  function basculerTiroir(actif) {
    modeTiroir = actif;
    if (actif && observateur) { try { observateur.disconnect(); } catch {} }
    positionner();
  }

  function planifier() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => { rafId = null; positionner(); });
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
    if (!etatCourant) { hote.style.display = 'none'; return; }

    if (modeTiroir || !ancre || !ancre.isConnected) {
      if (!modeTiroir && ancre && !ancre.isConnected) { ancre = null; tentatives = 0; attacher(); return; }
      hote.style.display = 'block';
      hote.style.top = '96px';
      hote.style.right = '16px';
      hote.style.left = 'auto';
      hote.style.width = '320px';
      hote.style.height = replie ? 'auto' : 'min(420px, 60vh)';
      return;
    }

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

    const tete = creerEl('div', 'tp-head');
    /* Logo TP : le glyphe noir, comme dans la popup en thème clair. Le panneau ne suit
       pas le thème système (voir panel.css) — Omnicanal est toujours blanc. */
    const logo = creerEl('img', 'tp-logo');
    try { logo.src = chrome.runtime.getURL('assets/DarkTP.png'); } catch {}
    logo.alt = '';
    tete.appendChild(logo);
    tete.appendChild(creerEl('span', 'tp-titre', 'TenantPulse'));

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

  function classeConfiance(v) {
    if (v >= 80) return 'high';
    if (v >= 50) return 'medium';
    return 'low';
  }

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
     avec le logo Microsoft, puis GUID + bouton de copie + pastille de confiance SUR LA
     MÊME LIGNE, puis le domaine. Une disposition maison donnait un hero qui ne
     ressemblait pas à celui de l'application. */
  function bloqueHero(etat) {
    const hero = creerEl('div', 'tenant-hero' + (etat.tenantId ? '' : ' no-tenant'));

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

    const conf = etat.confiance || 0;
    const libelleConf = conf >= 80 ? 'Confiance élevée' : conf >= 50 ? 'Confiance moyenne' : 'Confiance faible';

    const guid = creerEl('div', 'hero-guid');
    guid.appendChild(creerEl('span', null, etat.tenantId));
    const bouton = creerEl('button', 'hero-copy-btn', 'Copier');
    bouton.type = 'button';
    bouton.addEventListener('click', () => copier(etat.tenantId, bouton));
    guid.appendChild(bouton);
    guid.appendChild(creerEl('span', 'confidence-badge ' + classeConfiance(conf), conf + ' % — ' + libelleConf));
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
    if (nouvelleFiche) { cleAffichee = etat.cle; appliquerRepli(true); }

    dessiner();
    positionner();
  }

  return { rendre, configurer };
})();
