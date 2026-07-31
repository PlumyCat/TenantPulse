/* ──────────────────────────────────────────────────────────────────────────────
   d365/ctx-main.js — détection de l'enregistrement affiché, côté page.

   Injecté en monde « MAIN », c'est-à-dire dans le contexte JavaScript de Dynamics
   lui-même : c'est la seule façon d'atteindre les API client officielles (Xrm,
   Microsoft.Apm). Un script de contenu ordinaire vit dans un monde isolé qui partage
   le DOM mais pas les objets de la page — il n'y verrait jamais Xrm.

   Ce script ne lit RIEN d'autre que l'identité de l'enregistrement au premier plan,
   n'écrit rien dans la page, et n'émet aucune requête. Il publie un message que le
   monde isolé (d365/ctx.js) récupère dans la même fenêtre, et qui est la seule voie
   de sortie. Toute la suite — vérification d'origine, attestation, réseau — se passe
   côté isolé.

   Omnicanal ouvre chaque session dans une iframe distincte, d'où l'injection dans
   toutes les frames : chacune décrit son propre enregistrement et signale si elle est
   visible (une session en arrière-plan est masquée, son viewport mesure 0).

   Aucune déclaration au niveau global : le monde MAIN est le scope de la page, un
   « const » y entrerait en collision à la moindre ré-injection.
   ────────────────────────────────────────────────────────────────────────────── */
(function () {
  const CHANNEL = 'tp-d365-ctx';
  const POLL_MS = 1000;

  let last = null;
  let timer = null;

  /* Enregistrement affiché dans CETTE frame, via l'API client documentée.
     Hors d'une fiche (tableau de bord, vue, liste), il n'y a rien à décrire. */
  function readRecord() {
    try {
      const xrm = window.Xrm;
      if (!xrm || !xrm.Utility || typeof xrm.Utility.getPageContext !== 'function') return null;
      const input = (xrm.Utility.getPageContext() || {}).input;
      if (!input || input.pageType !== 'entityrecord') return null;
      if (!input.entityName || !input.entityId) return null;
      return {
        entityName: String(input.entityName),
        entityId: String(input.entityId).replace(/[{}]/g, '').toLowerCase(),
      };
    } catch { return null; }
  }

  /* Une session Omnicanal en arrière-plan est masquée : son viewport mesure 0.
     C'est ce qui permet au monde isolé de ne retenir que la frame réellement à
     l'écran, sans avoir à interroger le gestionnaire de sessions. */
  function isVisible() {
    return window.innerWidth > 0 && window.innerHeight > 0;
  }

  function publish() {
    let payload;
    try {
      payload = { source: CHANNEL, record: readRecord(), visible: isVisible() };
    } catch { return; }
    const serialized = JSON.stringify(payload);
    if (serialized === last) return;
    last = serialized;
    try { window.postMessage(payload, location.origin); } catch {}
  }

  /* Événements de session Omnicanal quand ils existent : la bascule d'onglet est
     alors signalée immédiatement, sans attendre le prochain sondage. */
  function subscribe() {
    try {
      const apm = window.Microsoft && window.Microsoft.Apm;
      if (!apm) return;
      if (typeof apm.addOnAfterSessionSwitch === 'function') apm.addOnAfterSessionSwitch(publish);
      if (typeof apm.addOnAfterTabNavigate === 'function')   apm.addOnAfterTabNavigate(publish);
    } catch {}
  }

  /* Sondage conservé même quand les événements ci-dessus sont disponibles : ouvrir un
     autre enregistrement DANS un onglet de session déjà ouvert ne déclenche ni bascule
     de session ni navigation d'onglet. Le coût est une lecture d'objet en mémoire —
     aucun accès au DOM, donc rien qui puisse peser sur le rendu d'Omnicanal — et il
     s'arrête dès que l'onglet du navigateur passe en arrière-plan. */
  function syncPolling() {
    if (document.visibilityState === 'visible') {
      if (timer === null) timer = setInterval(publish, POLL_MS);
    } else if (timer !== null) {
      clearInterval(timer); timer = null;
    }
  }

  subscribe();
  publish();
  syncPolling();
  document.addEventListener('visibilitychange', syncPolling);
})();
