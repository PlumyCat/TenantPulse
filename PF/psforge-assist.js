/* ──────────────────────────────────────────────────────────────
   PsForge — Module Assistant (diagnostic IA)
   Appelle /api/diagnose et /api/feedback (même origine SWA).
   CSP-compliant : connect-src 'self'. DOM exclusivement via createElement.

   Principe : l'assistant RÉCUPÈRE une procédure connue, il n'invente pas.
   Cinq états d'affichage : repos · chargement · trouvé · aucune · erreur.
   ────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     ÉTAT
     ═══════════════════════════════════════════════════════════ */
  let assistViewActive = false;
  let assistRole       = 'user';
  let assistRoleLoaded = false;
  let lastDiagnosticId = null;   // pour le feedback
  let lastTicket       = '';     // texte du ticket (affiché en bulle utilisateur)
  let inFlight         = false;  // un diagnostic est en cours

  const LOGO_SRC = '../assets/PSB.png';

  const HIER = { user: 0, tech: 1, moderator: 2, manager: 3, admin: 4 };
  function assistHasRole(required) {
    return (HIER[assistRole] ?? 0) >= (HIER[required] ?? 0);
  }

  /* ═══════════════════════════════════════════════════════════
     UTILITAIRES
     ═══════════════════════════════════════════════════════════ */
  // Diagnostic = 2 appels LLM + 1 recherche → laisser un délai généreux.
  async function apiFetch(url, opts, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 60000);
    try {
      const res  = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal }, opts));
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: e.name === 'AbortError' ? 'Délai dépassé.' : 'Erreur réseau.' } };
    } finally {
      clearTimeout(timer);
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // Ajuste la hauteur du textarea à son contenu (composer extensible style Claude).
  function autoGrow(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
  }

  // Bascule la vue en mode « discussion » : l'accueil disparaît, le fil prend la
  // place, le composer reste ancré en bas (la mise en page change au 1er message).
  function setChatting() {
    const v = document.getElementById('pfAssistView');
    if (v) v.classList.add('is-chatting');
  }
  function scrollAssistToBottom() {
    const sc = document.querySelector('.pf-assist-scroll');
    if (sc) sc.scrollTop = sc.scrollHeight;
  }

  // Bulle « utilisateur » : reprend le texte du ticket (look chat, aligné à droite).
  function appendUserMessage(root, text) {
    if (!text) return;
    const wrap = el('div', 'pf-assist-user');
    wrap.appendChild(el('div', 'pf-assist-user-bubble', text));
    root.appendChild(wrap);
  }

  // Message « assistant » signé du logo PsForge ; retourne le corps où écrire.
  function appendAssistantMessage(root) {
    const msg = el('div', 'pf-assist-msg');
    const avatar = el('div', 'pf-assist-msg-avatar');
    const img = document.createElement('img');
    img.src = LOGO_SRC;
    img.alt = 'PsForge';
    avatar.appendChild(img);
    const body = el('div', 'pf-assist-msg-body');
    msg.appendChild(avatar);
    msg.appendChild(body);
    root.appendChild(msg);
    return body;
  }

  // Rendu inline minimal (gras, italique, code) — texte via textContent uniquement.
  function renderInline(text, parent) {
    const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/);
    for (const part of parts) {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        parent.appendChild(el('strong', null, part.slice(2, -2)));
      } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        parent.appendChild(el('code', null, part.slice(1, -1)));
      } else if (part) {
        parent.appendChild(document.createTextNode(part));
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     RÔLE & PERMISSIONS (GET /api/me)
     Diagnostic réservé au rôle tech minimum.
     ═══════════════════════════════════════════════════════════ */
  async function loadAssistRole() {
    if (assistRoleLoaded) { applyAssistPermissions(); return; }
    const { ok, data } = await apiFetch('/api/me', null, 10000);
    if (ok && data && data.role) assistRole = data.role;
    assistRoleLoaded = true;
    applyAssistPermissions();
  }

  function applyAssistPermissions() {
    const ticket  = document.getElementById('pfAssistTicket');
    const analyze = document.getElementById('pfAssistAnalyze');
    const hint    = document.getElementById('pfAssistHint');
    const allowed = assistHasRole('tech');
    if (ticket)  ticket.disabled  = !allowed;
    if (analyze) analyze.disabled = !allowed;
    if (hint) {
      hint.textContent = allowed
        ? ''
        : 'Réservé au rôle technicien ou supérieur.';
      hint.className = 'pf-assist-hint' + (allowed ? '' : ' pf-assist-hint--warn');
    }
  }

  /* ═══════════════════════════════════════════════════════════
     AFFICHAGE / MASQUAGE DE LA VUE
     ═══════════════════════════════════════════════════════════ */
  function showAssistView() {
    document.getElementById('pfCmdView').hidden     = true;
    document.getElementById('pfScriptView').hidden  = true;
    document.getElementById('pfManagerView').hidden = true;
    const proc = document.getElementById('pfProcessView');
    if (proc) proc.hidden = true;
    document.getElementById('pfAssistView').hidden  = false;
    document.getElementById('pfAssistToggle').classList.add('active');
    assistViewActive = true;
    loadAssistRole();
    const ticket = document.getElementById('pfAssistTicket');
    if (ticket && !ticket.disabled) ticket.focus();
  }

  function hideAssistView() {
    document.getElementById('pfAssistView').hidden = true;
    document.getElementById('pfCmdView').hidden    = false;
    document.getElementById('pfAssistToggle').classList.remove('active');
    assistViewActive = false;
  }

  window.pfAssistToggleView = function () {
    assistViewActive ? hideAssistView() : showAssistView();
  };
  window.pfHideAssistView = function () {
    if (assistViewActive) hideAssistView();
  };

  /* ═══════════════════════════════════════════════════════════
     ÉTATS D'AFFICHAGE
     ═══════════════════════════════════════════════════════════ */
  function clearResult() {
    document.getElementById('pfAssistResult').replaceChildren();
  }

  function setLoading() {
    const root = document.getElementById('pfAssistResult');
    setChatting();
    setChatting();
    root.replaceChildren();
    appendUserMessage(root, lastTicket);
    const body = appendAssistantMessage(root);
    const card = el('div', 'pf-assist-loading');
    card.appendChild(el('span', 'pf-assist-spinner'));
    const txt = el('div', 'pf-assist-loading-txt');
    txt.appendChild(el('strong', null, 'Analyse en cours…'));
    txt.appendChild(el('span', 'pf-assist-loading-sub', 'Compréhension du ticket puis recherche d’une procédure connue.'));
    card.appendChild(txt);
    body.appendChild(card);
    scrollAssistToBottom();
  }

  /* ── Récapitulatif d'analyse (catégorie + entités cliquables) ─────────────── */
  function appendAnalysis(root, analysis) {
    if (!analysis) return;
    const box = el('details', 'pf-assist-analysis');
    box.open = true;   // entités visibles par défaut (« remontent » à l'écran)
    const sum = el('summary', 'pf-assist-analysis-sum', 'Analyse du ticket — entités extraites');
    box.appendChild(sum);

    const body = el('div', 'pf-assist-analysis-body');

    if (analysis.categorie) {
      const row = el('div', 'pf-assist-an-row');
      row.appendChild(el('span', 'pf-assist-an-label', 'Catégorie'));
      const cat = el('span', 'pf-assist-an-cat', analysis.categorie +
        (analysis.sousCategorie ? ' · ' + analysis.sousCategorie : ''));
      row.appendChild(cat);
      body.appendChild(row);
    }

    const ent = analysis.entites || {};
    const groups = [
      ['Utilisateur', ent.utilisateur ? [ent.utilisateur] : []],
      ['IP', ent.ip], ['E-mail', ent.email], ['Domaine', ent.domaine],
      ['Serveur', ent.serveur], ['Identifiant', ent.identifiantTechnique]
    ];
    const chipsRow = el('div', 'pf-assist-chips');
    let hasChips = false;
    for (const [label, values] of groups) {
      if (!Array.isArray(values)) continue;
      for (const v of values) {
        if (!v) continue;
        hasChips = true;
        const chip = el('button', 'pf-assist-chip');
        chip.type = 'button';
        chip.dataset.action = 'inject-entity';
        chip.dataset.value = String(v);
        chip.title = 'Injecter « ' + v + ' » dans le champ sélectionné du constructeur';
        chip.appendChild(el('span', 'pf-assist-chip-k', label));
        chip.appendChild(el('span', 'pf-assist-chip-v', String(v)));
        chipsRow.appendChild(chip);
      }
    }
    if (hasChips) body.appendChild(chipsRow);

    box.appendChild(body);
    root.appendChild(box);
  }

  /* ── Boucle de feedback (✅/❌) ─────────────────────────────────────────────── */
  function appendFeedback(root, procedureId) {
    if (!procedureId) return;
    const row = el('div', 'pf-assist-feedback');
    row.appendChild(el('span', 'pf-assist-feedback-q', 'Cette procédure a-t-elle résolu l’incident ?'));
    const yes = el('button', 'pf-assist-fb-btn pf-assist-fb-ok', '👍 Oui');
    yes.type = 'button'; yes.dataset.action = 'feedback'; yes.dataset.verdict = 'ok';
    yes.dataset.proc = procedureId;
    const no = el('button', 'pf-assist-fb-btn pf-assist-fb-bad', '👎 Non');
    no.type = 'button'; no.dataset.action = 'feedback'; no.dataset.verdict = 'mauvais';
    no.dataset.proc = procedureId;
    row.appendChild(yes);
    row.appendChild(no);
    root.appendChild(row);
  }

  /* ── État « trouvé » / « ambigu » ─────────────────────────────────────────── */
  function renderTrouve(analysis, res) {
    const root = document.getElementById('pfAssistResult');
    setChatting();
    root.replaceChildren();
    appendUserMessage(root, lastTicket);
    const body = appendAssistantMessage(root);

    const card = el('div', 'pf-assist-card pf-assist-card--found');

    // En-tête : statut + confiance
    const head = el('div', 'pf-assist-card-head');
    const badge = el('span', 'pf-assist-status pf-assist-status--' + (res.statut === 'ambigu' ? 'ambigu' : 'found'));
    badge.textContent = res.statut === 'ambigu' ? 'Plusieurs pistes' : 'Procédure trouvée';
    head.appendChild(badge);
    if (typeof res.confiance === 'number') {
      head.appendChild(el('span', 'pf-assist-confiance', 'Confiance ' + Math.round(res.confiance * 100) + ' %'));
    }
    card.appendChild(head);

    if (res.titre) card.appendChild(el('h3', 'pf-assist-card-titre', res.titre));
    if (res.resume) {
      const p = el('p', 'pf-assist-resume');
      renderInline(res.resume, p);
      card.appendChild(p);
    }

    // Étapes (reprises fidèlement de la procédure).
    // Rendu RICHE via le moteur des Procédures : titres, blocs de code (avec
    // bouton Copier), jetons <param>. On reconstitue le markdown (les étapes
    // sont les lignes de la procédure) puis on le rend dans .pf-proc-content.
    if (Array.isArray(res.etapes) && res.etapes.length) {
      card.appendChild(el('div', 'pf-assist-sec-label', 'Étapes'));
      if (typeof window.pfRenderProcMarkdown === 'function') {
        const proc = el('div', 'pf-proc-content pf-assist-proc');
        window.pfRenderProcMarkdown(res.etapes.join('\n'), proc);
        card.appendChild(proc);
      } else {
        // Repli : liste numérotée simple (rendu inline gras/code).
        const ol = el('ol', 'pf-assist-steps');
        for (const step of res.etapes) {
          const li = el('li');
          renderInline(step, li);
          ol.appendChild(li);
        }
        card.appendChild(ol);
      }
    }

    // Ouvrir la procédure complète (rendu riche de la vue Procédures)
    if (res.procedureId) {
      const open = el('button', 'pf-btn-validate pf-assist-open', 'Ouvrir la procédure complète →');
      open.type = 'button';
      open.dataset.action = 'open-proc';
      open.dataset.proc = res.procedureId;
      card.appendChild(open);
    }

    // Informations manquantes
    if (Array.isArray(res.informationsManquantes) && res.informationsManquantes.length) {
      const note = el('div', 'pf-assist-missing');
      note.appendChild(el('span', 'pf-assist-missing-label', 'À préciser'));
      const ul = el('ul', 'pf-assist-missing-list');
      for (const m of res.informationsManquantes) ul.appendChild(el('li', null, m));
      note.appendChild(ul);
      card.appendChild(note);
    }

    // Alternatives
    if (Array.isArray(res.alternatives) && res.alternatives.length) {
      const alt = el('div', 'pf-assist-alts');
      alt.appendChild(el('span', 'pf-assist-alts-label', 'Autres pistes'));
      for (const a of res.alternatives) {
        if (!a || !a.procedureId) continue;
        const item = el('button', 'pf-assist-alt');
        item.type = 'button';
        item.dataset.action = 'open-proc';
        item.dataset.proc = a.procedureId;
        item.appendChild(el('span', 'pf-assist-alt-titre', a.titre || 'Procédure'));
        if (typeof a.confiance === 'number') {
          item.appendChild(el('span', 'pf-assist-alt-conf', Math.round(a.confiance * 100) + ' %'));
        }
        alt.appendChild(item);
      }
      card.appendChild(alt);
    }

    appendFeedback(card, res.procedureId);
    body.appendChild(card);
    appendAnalysis(body, analysis);
  }

  /* ── État « aucune » (affichage à part entière) ───────────────────────────── */
  function renderAucune(analysis, res) {
    const root = document.getElementById('pfAssistResult');
    setChatting();
    root.replaceChildren();
    appendUserMessage(root, lastTicket);
    const body = appendAssistantMessage(root);

    const card = el('div', 'pf-assist-card pf-assist-card--none');
    const head = el('div', 'pf-assist-card-head');
    head.appendChild(el('span', 'pf-assist-status pf-assist-status--none', 'Aucune procédure exacte'));
    card.appendChild(head);

    const p = el('p', 'pf-assist-resume');
    renderInline((res && res.resume) || 'Aucune procédure connue ne correspond précisément à cet incident.', p);
    card.appendChild(p);

    if (res && Array.isArray(res.informationsManquantes) && res.informationsManquantes.length) {
      const note = el('div', 'pf-assist-missing');
      note.appendChild(el('span', 'pf-assist-missing-label', 'Préciser pourrait aider'));
      const ul = el('ul', 'pf-assist-missing-list');
      for (const m of res.informationsManquantes) ul.appendChild(el('li', null, m));
      note.appendChild(ul);
      card.appendChild(note);
    }

    if (assistHasRole('tech')) {
      card.appendChild(el('p', 'pf-assist-none-hint',
        'Si cette situation est connue, créez la procédure depuis l’onglet « Procédures » pour la rendre trouvable.'));
    }

    body.appendChild(card);
    appendAnalysis(body, analysis);
  }

  /* ── État « erreur » ──────────────────────────────────────────────────────── */
  function renderErreur(message, status) {
    const root = document.getElementById('pfAssistResult');
    setChatting();
    root.replaceChildren();
    appendUserMessage(root, lastTicket);
    const body = appendAssistantMessage(root);
    const card = el('div', 'pf-assist-card pf-assist-card--error');
    card.appendChild(el('span', 'pf-assist-status pf-assist-status--error', 'Erreur'));
    let msg = message || 'Une erreur est survenue.';
    if (status === 503) msg = 'Service IA non configuré côté serveur. Réessayez plus tard.';
    if (status === 403) msg = 'Accès refusé — rôle technicien requis.';
    card.appendChild(el('p', 'pf-assist-resume', msg));
    if (status !== 503 && status !== 403) {
      const retry = el('button', 'pf-btn-validate', 'Réessayer');
      retry.type = 'button';
      retry.dataset.action = 'assist-retry';
      card.appendChild(retry);
    }
    body.appendChild(card);
    scrollAssistToBottom();
  }

  /* ═══════════════════════════════════════════════════════════
     DIAGNOSTIC
     ═══════════════════════════════════════════════════════════ */
  async function runDiagnostic() {
    if (inFlight) return;
    const ticketEl = document.getElementById('pfAssistTicket');
    const ticket = (ticketEl && ticketEl.value || '').trim();
    lastTicket = ticket;

    if (!assistHasRole('tech')) { renderErreur(null, 403); return; }
    if (!ticket) {
      const hint = document.getElementById('pfAssistHint');
      if (hint) { hint.textContent = 'Décrivez d’abord l’incident.'; hint.className = 'pf-assist-hint pf-assist-hint--warn'; }
      if (ticketEl) ticketEl.focus();
      return;
    }

    inFlight = true;
    lastDiagnosticId = null;
    // Vide la saisie après envoi (le ticket reste visible en bulle utilisateur).
    if (ticketEl) { ticketEl.value = ''; autoGrow(ticketEl); }
    const analyzeBtn = document.getElementById('pfAssistAnalyze');
    if (analyzeBtn) analyzeBtn.disabled = true;
    setLoading();

    const { ok, status, data } = await apiFetch('/api/diagnose', {
      method: 'POST',
      body: JSON.stringify({ ticket })
    });

    inFlight = false;
    if (analyzeBtn) analyzeBtn.disabled = false;

    if (!ok) { renderErreur(data && data.error, status); return; }

    lastDiagnosticId = data.diagnosticId || null;
    const res = data.resultat || {};
    if (res.statut === 'aucune' || !res.procedureId && res.statut !== 'trouve' && res.statut !== 'ambigu') {
      renderAucune(data.analysis, res);
    } else {
      renderTrouve(data.analysis, res);
    }
    scrollAssistToBottom();
  }

  /* ═══════════════════════════════════════════════════════════
     FEEDBACK (✅/❌)
     ═══════════════════════════════════════════════════════════ */
  async function sendFeedback(verdict, procedureId, btn) {
    if (!lastDiagnosticId || !procedureId) return;
    const row = btn.closest('.pf-assist-feedback');
    // Désactive les deux boutons pendant l'envoi.
    if (row) row.querySelectorAll('button').forEach(b => { b.disabled = true; });

    const { ok } = await apiFetch('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ diagnosticId: lastDiagnosticId, procedureId, verdict })
    }, 15000);

    if (row) {
      row.replaceChildren();
      row.appendChild(el('span', 'pf-assist-feedback-thanks',
        ok ? '✓ Merci, retour enregistré.' : '⚠ Retour non enregistré.'));
    }
  }

  /* ═══════════════════════════════════════════════════════════
     ÉVÉNEMENTS
     ═══════════════════════════════════════════════════════════ */
  document.addEventListener('click', function (e) {
    if (!assistViewActive) return;

    if (e.target.closest('#pfAssistAnalyze')) { runDiagnostic(); return; }
    if (e.target.closest('[data-action="assist-retry"]')) { runDiagnostic(); return; }

    // Ouvrir une procédure (principale ou alternative) dans la vue Procédures.
    const openBtn = e.target.closest('[data-action="open-proc"]');
    if (openBtn && openBtn.dataset.proc) {
      hideAssistView();
      if (typeof window.pfOpenProcedure === 'function') window.pfOpenProcedure(openBtn.dataset.proc);
      return;
    }

    // Injecter une entité dans le jeton paramètre actif du constructeur.
    const chip = e.target.closest('[data-action="inject-entity"]');
    if (chip && chip.dataset.value) {
      if (typeof window.pfInjectIntoActive === 'function') window.pfInjectIntoActive(chip.dataset.value);
      return;
    }

    // Feedback ✅/❌
    const fb = e.target.closest('[data-action="feedback"]');
    if (fb) { sendFeedback(fb.dataset.verdict, fb.dataset.proc, fb); return; }
  });

  document.addEventListener('input', function (e) {
    if (!assistViewActive) return;
    if (e.target.id === 'pfAssistTicket') {
      autoGrow(e.target);
      const hint = document.getElementById('pfAssistHint');
      if (hint && hint.classList.contains('pf-assist-hint--warn')) {
        hint.textContent = ''; hint.className = 'pf-assist-hint';
      }
    }
  });

  // Entrée → envoyer ; Maj+Entrée → nouvelle ligne (comportement chat).
  document.addEventListener('keydown', function (e) {
    if (!assistViewActive) return;
    if (e.target.id === 'pfAssistTicket' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runDiagnostic();
    }
  });

})();
