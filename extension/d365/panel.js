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

  const UI_KEY = 'tp_d365_ui_v1';

  /* Titres possibles de la section d'ancrage. La langue de l'interface suit celle de
     l'utilisateur, et le libellé peut changer d'une mise à jour à l'autre — d'où une
     liste, et un repli en tiroir si aucun ne correspond. */
  const TITRES_ANCRE = ['Santé du client', 'Customer health', 'Customer Health'];
  const ANCRE_TENTATIVES = 12;
  const ANCRE_DELAI_MS = 1500;

  let hote = null, ombre = null, cadre = null, corps = null, chevron = null;
  let ancre = null, observateur = null, rafId = null;
  let replie = false, modeTiroir = false;
  let etatCourant = null;
  let tentatives = 0;
  let rappels = { surDomaineManuel: null };

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
        if (r.width >= 220 && r.height >= 200) return candidat;
        candidat = candidat.parentElement;
      }
    }
    return null;
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
    try {
      if (observateur) observateur.disconnect();
      observateur = new ResizeObserver(planifier);
      observateur.observe(ancre);
    } catch { /* sans ResizeObserver, le défilement et le redimensionnement suffisent */ }
    positionner();
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
    // Section masquée (session en arrière-plan, panneau latéral fermé) : on s'efface.
    if (r.width < 120 || r.height < 60) { hote.style.display = 'none'; return; }

    hote.style.display = 'block';
    hote.style.right = 'auto';
    hote.style.top = Math.round(r.top) + 'px';
    hote.style.left = Math.round(r.left) + 'px';
    hote.style.width = Math.round(r.width) + 'px';
    hote.style.height = replie ? 'auto' : Math.round(r.height) + 'px';
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
    tete.appendChild(creerEl('span', 'tp-logo', 'TP'));
    tete.appendChild(creerEl('span', 'tp-titre', 'TenantPulse'));

    chevron = creerEl('button', 'tp-bouton-replier', '▾');
    chevron.type = 'button';
    chevron.setAttribute('aria-expanded', 'true');
    chevron.setAttribute('aria-label', 'Replier le panneau');
    chevron.addEventListener('click', () => appliquerRepli(!replie, true));
    tete.appendChild(chevron);

    corps = creerEl('div', 'tp-corps');

    cadre.appendChild(tete);
    cadre.appendChild(corps);
    ombre.appendChild(cadre);

    /* Repli restauré d'une session à l'autre : replier le panneau est un geste que
       l'utilisateur ne veut pas refaire à chaque ouverture de fiche. */
    try {
      chrome.storage.local.get(UI_KEY, (res) => {
        const ui = res && res[UI_KEY];
        if (ui && ui.replie) appliquerRepli(true, false);
      });
    } catch {}

    window.addEventListener('resize', planifier, { passive: true });
    // capture:true — le défilement utile est celui des conteneurs internes de Dynamics,
    // et un événement de défilement ne remonte pas jusqu'à window.
    window.addEventListener('scroll', planifier, { passive: true, capture: true });

    attacher();
  }

  function appliquerRepli(valeur, memoriser) {
    replie = !!valeur;
    if (cadre) cadre.classList.toggle('est-replie', replie);
    if (chevron) {
      chevron.textContent = replie ? '▸' : '▾';
      chevron.setAttribute('aria-expanded', replie ? 'false' : 'true');
      chevron.setAttribute('aria-label', replie ? 'Déplier le panneau' : 'Replier le panneau');
    }
    positionner();
    if (memoriser) { try { chrome.storage.local.set({ [UI_KEY]: { replie } }); } catch {} }
  }

  // ── Contenu ──────────────────────────────────────────────────────────────────

  function classeConfiance(v) {
    if (v >= 90) return 'haute';
    if (v >= 60) return 'moyenne';
    return 'basse';
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
    setTimeout(() => { bouton.textContent = 'Copier'; }, 1400);
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

    if (etat.domaine) {
      const d = creerEl('div', 'tp-domaine');
      d.appendChild(creerEl('span', null, etat.domaine));
      if (etat.source) d.appendChild(creerEl('span', 'tp-source', '· ' + etat.source));
      corps.appendChild(d);
    }

    if (etat.statut === 'resolu' && etat.tenantId) {
      corps.appendChild(creerEl('div', 'tp-etiquette', 'Microsoft Tenant ID'));
      corps.appendChild(creerEl('div', 'tp-tenant', etat.tenantId));

      const ligne = creerEl('div', 'tp-ligne');
      const bouton = creerEl('button', 'tp-copier', 'Copier');
      bouton.type = 'button';
      bouton.addEventListener('click', () => copier(etat.tenantId, bouton));
      ligne.appendChild(bouton);

      const conf = creerEl('span', 'tp-confiance ' + classeConfiance(etat.confiance || 0),
        (etat.confiance || 0) + ' % de confiance');
      ligne.appendChild(conf);
      corps.appendChild(ligne);
      return;
    }

    if (etat.statut === 'sans-tenant') {
      corps.appendChild(creerEl('div', 'tp-message', 'Aucun tenant Microsoft 365 détecté pour ce domaine.'));
      corps.appendChild(bloquesSaisie(etat));
      return;
    }

    if (etat.statut === 'sans-domaine') {
      corps.appendChild(creerEl('div', 'tp-message',
        etat.message || "Aucun domaine exploitable sur cette fiche (ni site web, ni adresse)."));
      corps.appendChild(bloquesSaisie(etat));
      return;
    }

    corps.appendChild(creerEl('div', 'tp-message', etat.message || 'Aucune fiche client à analyser.'));
  }

  // ── Interface publique ───────────────────────────────────────────────────────

  function configurer(r) {
    rappels = { ...rappels, ...(r || {}) };
  }

  function rendre(etat) {
    etatCourant = etat || null;
    if (!hote) creer();
    dessiner();
    positionner();
  }

  return { rendre, configurer };
})();
