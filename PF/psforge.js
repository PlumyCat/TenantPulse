/* ──────────────────────────────────────────────────────────────
   PsForge — Commandes PowerShell IT MW
   Script externe (CSP-compliant : script-src 'self')

   Conformité :
   - Aucun appel réseau externe
   - Aucun localStorage / cookie / stockage persistant
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
   Stratégie triple :
   1. Accès DOM direct au parent + MutationObserver (même origine HTTP/S)
      + polling de secours toutes les 200 ms (Edge/file:// : le MutationObserver
      cross-frame ne se déclenche pas toujours).
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

        /* Polling de secours : Edge ne déclenche pas toujours le MutationObserver
           cross-frame en contexte file://. Le timer se détruit si l'accès est révoqué. */
        var _prev = t;
        var _poll = setInterval(function () {
          try {
            var cur = parentHtml.getAttribute('data-theme') || 'light';
            if (cur !== _prev) { _prev = cur; applyTheme(cur); }
          } catch (e) { clearInterval(_poll); }
        }, 200);
      } catch (e) { /* accès bloqué — on se rabat sur postMessage */ }

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
      });
    } else {
      /* ── Standalone (ouverture directe) ── */
      var mql = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mql.matches ? 'dark' : 'light');
      mql.addEventListener('change', function (e) { applyTheme(e.matches ? 'dark' : 'light'); });
    }
  } catch (e) { /* fallback silencieux */ }
})();
