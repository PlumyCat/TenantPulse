/* ──────────────────────────────────────────────────────────────
   PsForge — Module Process internes
   Appels /api/process et /api/process-image (même origine SWA).
   CSP-compliant : connect-src 'self', img-src 'self'.
   DOM exclusivement via createElement — jamais innerHTML réseau.
   ────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     ÉTAT
     ═══════════════════════════════════════════════════════════ */
  let procViewActive   = false;
  let procSubView      = 'list';
  let allProcs         = [];
  let currentProc      = null;
  let cmdPickerOpen    = false;

  /* ═══════════════════════════════════════════════════════════
     UTILITAIRES API
     ═══════════════════════════════════════════════════════════ */
  async function apiFetch(url, opts) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
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

  /* ═══════════════════════════════════════════════════════════
     RENDU MARKDOWN
     Safe : tout le texte via textContent / createTextNode.
     Images : uniquement les URLs /api/process-image (même origine).
     Blocs image et code : collapsibles (bouton Masquer/Afficher).
     ═══════════════════════════════════════════════════════════ */
  function renderInline(text, parent) {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
    for (const part of parts) {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        const s = document.createElement('strong');
        s.textContent = part.slice(2, -2);
        parent.appendChild(s);
      } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        const em = document.createElement('em');
        em.textContent = part.slice(1, -1);
        parent.appendChild(em);
      } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        const code = document.createElement('code');
        code.textContent = part.slice(1, -1);
        parent.appendChild(code);
      } else {
        parent.appendChild(document.createTextNode(part));
      }
    }
  }

  function makeCollapseBtn(labelShow, labelHide) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pf-proc-collapse-btn';
    btn.dataset.action = 'collapse-block';
    btn.dataset.labelShow = labelShow;
    btn.dataset.labelHide = labelHide;
    btn.textContent = labelHide;
    return btn;
  }

  function renderMarkdown(text, container) {
    container.replaceChildren();
    if (!text) return;
    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.trim() === '') { i++; continue; }

      // En-têtes
      const hm = line.match(/^(#{1,3}) (.+)/);
      if (hm) {
        const el = document.createElement('h' + hm[1].length);
        el.textContent = hm[2];
        container.appendChild(el);
        i++; continue;
      }

      // Image — seules les URLs /api/process-image sont autorisées
      const imgM = line.match(/^!\[(.*?)\]\((\/api\/process-image\?[^)]+)\)\s*$/);
      if (imgM) {
        const wrap = document.createElement('div');
        wrap.className = 'pf-proc-collapse-wrap';

        const head = document.createElement('div');
        head.className = 'pf-proc-block-head';
        const lbl = document.createElement('span');
        lbl.className = 'pf-proc-block-lbl';
        lbl.textContent = '🖼 ' + (imgM[1] || 'Image');
        head.appendChild(lbl);
        head.appendChild(makeCollapseBtn('Afficher', 'Masquer'));
        wrap.appendChild(head);

        const fig = document.createElement('figure');
        fig.className = 'pf-proc-figure pf-proc-block-body';
        const img = document.createElement('img');
        img.src = imgM[2];
        img.alt = imgM[1];
        img.className = 'pf-proc-img';
        fig.appendChild(img);
        if (imgM[1]) {
          const cap = document.createElement('figcaption');
          cap.textContent = imgM[1];
          fig.appendChild(cap);
        }
        wrap.appendChild(fig);
        container.appendChild(wrap);
        i++; continue;
      }

      // Liste non ordonnée
      if (line.match(/^[-*] /)) {
        const ul = document.createElement('ul');
        while (i < lines.length && lines[i].match(/^[-*] /)) {
          const li = document.createElement('li');
          renderInline(lines[i].slice(2), li);
          ul.appendChild(li);
          i++;
        }
        container.appendChild(ul);
        continue;
      }

      // Bloc de code (```)
      if (line.startsWith('```')) {
        const lang = line.slice(3).trim() || 'code';
        const wrap = document.createElement('div');
        wrap.className = 'pf-proc-collapse-wrap pf-proc-pre-wrap';

        const head = document.createElement('div');
        head.className = 'pf-proc-block-head';
        const lbl = document.createElement('span');
        lbl.className = 'pf-proc-block-lbl';
        lbl.textContent = '</> ' + lang;
        head.appendChild(lbl);
        head.appendChild(makeCollapseBtn('Afficher', 'Masquer'));
        wrap.appendChild(head);

        const pre  = document.createElement('pre');
        pre.className = 'pf-proc-block-body';
        const code = document.createElement('code');
        i++;
        const buf = [];
        while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++; }
        code.textContent = buf.join('\n');
        pre.appendChild(code);
        wrap.appendChild(pre);
        container.appendChild(wrap);
        i++; continue;
      }

      // Séparateur ---
      if (line.match(/^---+$/)) {
        container.appendChild(document.createElement('hr'));
        i++; continue;
      }

      // Paragraphe
      const p = document.createElement('p');
      renderInline(line, p);
      container.appendChild(p);
      i++;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     NAVIGATION ENTRE SOUS-VUES
     ═══════════════════════════════════════════════════════════ */
  function showSub(name) {
    procSubView = name;
    document.getElementById('pfProcListView').hidden        = (name !== 'list');
    document.getElementById('pfProcDetailView').hidden      = (name !== 'detail');
    document.getElementById('pfProcEditorView').hidden      = (name !== 'editor');
    document.getElementById('pfProcListToolbar').hidden     = (name !== 'list');
    document.getElementById('pfProcDetailToolbar').hidden   = (name !== 'detail');
    document.getElementById('pfProcEditorToolbar').hidden   = (name !== 'editor');
  }

  /* ═══════════════════════════════════════════════════════════
     LISTE
     ═══════════════════════════════════════════════════════════ */
  async function loadList() {
    const loading = document.getElementById('pfProcLoading');
    if (loading) loading.hidden = false;
    const { ok, data } = await apiFetch('/api/process');
    if (!ok) {
      allProcs = [];
      showListError(data.error || 'Erreur lors du chargement');
    } else {
      allProcs = (data.items || []).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      renderCards('');
    }
    if (loading) loading.hidden = true;
  }

  function showListError(msg) {
    const cards = document.getElementById('pfProcCards');
    cards.replaceChildren();
    const err = document.createElement('div');
    err.className = 'pf-proc-empty';
    err.textContent = msg;
    cards.appendChild(err);
  }

  function renderCards(filter) {
    const cards   = document.getElementById('pfProcCards');
    const loading = document.getElementById('pfProcLoading');
    cards.replaceChildren();
    if (loading) { loading.hidden = true; cards.appendChild(loading); }

    const q     = filter.trim().toLowerCase();
    const items = q
      ? allProcs.filter(p =>
          p.titre.toLowerCase().includes(q) ||
          (p.categorie || '').toLowerCase().includes(q) ||
          (p.descriptionCourte || '').toLowerCase().includes(q))
      : allProcs;

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'pf-proc-empty';
      empty.textContent = q
        ? 'Aucune procédure correspondante.'
        : "Aucune procédure. Cliquez sur « + Nouvelle procédure » pour commencer.";
      cards.appendChild(empty);
      return;
    }

    for (const proc of items) {
      const card = document.createElement('div');
      card.className = 'pf-proc-card';
      card.dataset.id = proc.id;

      const header = document.createElement('div');
      header.className = 'pf-proc-card-header';
      const titre = document.createElement('span');
      titre.className = 'pf-proc-card-titre';
      titre.textContent = proc.titre;
      header.appendChild(titre);
      if (proc.categorie) {
        const cat = document.createElement('span');
        cat.className = 'pf-proc-card-cat';
        cat.textContent = proc.categorie;
        header.appendChild(cat);
      }
      card.appendChild(header);

      if (proc.descriptionCourte) {
        const desc = document.createElement('p');
        desc.className = 'pf-proc-card-desc';
        desc.textContent = proc.descriptionCourte;
        card.appendChild(desc);
      }

      const footer = document.createElement('div');
      footer.className = 'pf-proc-card-footer';
      footer.textContent = proc.updatedAt
        ? 'Modifié le ' + new Date(proc.updatedAt).toLocaleDateString('fr-FR')
        : '';
      card.appendChild(footer);
      cards.appendChild(card);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     DÉTAIL
     ═══════════════════════════════════════════════════════════ */
  async function openDetail(id) {
    const titleEl = document.getElementById('pfProcDetailTitle');
    if (titleEl) titleEl.textContent = '…';
    showSub('detail');

    const { ok, data } = await apiFetch('/api/process?id=' + encodeURIComponent(id));
    if (!ok) { showSub('list'); return; }
    currentProc = data;

    if (titleEl) titleEl.textContent = data.titre;

    const meta = document.getElementById('pfProcMeta');
    meta.replaceChildren();
    if (data.categorie) {
      const cat = document.createElement('span');
      cat.className = 'pf-proc-card-cat';
      cat.textContent = data.categorie;
      meta.appendChild(cat);
    }
    if (data.updatedAt) {
      const upd = document.createElement('span');
      upd.className = 'pf-proc-meta-date';
      upd.textContent = 'Modifié le ' + new Date(data.updatedAt).toLocaleDateString('fr-FR');
      meta.appendChild(upd);
    }

    renderMarkdown(data.contentMarkdown || '', document.getElementById('pfProcContent'));
  }

  /* ═══════════════════════════════════════════════════════════
     ÉDITEUR
     ═══════════════════════════════════════════════════════════ */
  function openEditor(proc) {
    currentProc = proc || null;
    const titleEl = document.getElementById('pfProcEditorTitle');
    if (titleEl) titleEl.textContent = proc ? 'Modifier la procédure' : 'Nouvelle procédure';

    document.getElementById('pfProcTitre').value     = proc ? proc.titre                  : '';
    document.getElementById('pfProcCategorie').value = proc ? (proc.categorie || '')       : '';
    document.getElementById('pfProcDesc').value      = proc ? (proc.descriptionCourte || '') : '';
    document.getElementById('pfProcMd').value        = proc ? (proc.contentMarkdown || '')  : '';
    document.getElementById('pfProcImgStatus').textContent = '';
    document.getElementById('pfProcSaveStatus').textContent = '';

    closeCmdPicker();
    updateImgStrip();
    showSub('editor');
    document.getElementById('pfProcTitre').focus();
  }

  async function saveProc() {
    const titre  = document.getElementById('pfProcTitre').value.trim();
    const status = document.getElementById('pfProcSaveStatus');

    if (!titre) {
      status.textContent = '⚠ Le titre est obligatoire.';
      status.className = 'pf-proc-save-status pf-proc-status--error';
      document.getElementById('pfProcTitre').focus();
      return;
    }

    status.textContent = 'Enregistrement…';
    status.className = 'pf-proc-save-status';

    const body = {
      titre,
      categorie:         document.getElementById('pfProcCategorie').value.trim(),
      descriptionCourte: document.getElementById('pfProcDesc').value.trim(),
      contentMarkdown:   document.getElementById('pfProcMd').value
    };
    if (currentProc && currentProc.id) body.id = currentProc.id;

    const { ok, data } = await apiFetch('/api/process', { method: 'POST', body: JSON.stringify(body) });

    if (!ok) {
      status.textContent = '✗ ' + (data.error || "Erreur lors de l'enregistrement.");
      status.className = 'pf-proc-save-status pf-proc-status--error';
      return;
    }

    currentProc = Object.assign({}, body, { id: data.id });
    await loadListSilent();
    await openDetail(data.id);
  }

  async function loadListSilent() {
    const { ok, data } = await apiFetch('/api/process');
    if (ok) allProcs = (data.items || []).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  /* ═══════════════════════════════════════════════════════════
     SUPPRESSION
     ═══════════════════════════════════════════════════════════ */
  async function deleteProc() {
    if (!currentProc || !currentProc.id) return;
    if (!confirm('Supprimer la procédure « ' + currentProc.titre + ' » ? Cette action est irréversible.')) return;

    const { ok, data } = await apiFetch('/api/process?id=' + encodeURIComponent(currentProc.id), { method: 'DELETE' });
    if (!ok) { alert('Erreur : ' + (data.error || 'suppression impossible.')); return; }

    currentProc = null;
    await loadList();
    showSub('list');
  }

  /* ═══════════════════════════════════════════════════════════
     BANDE DE PRÉVISUALISATION DES IMAGES
     ═══════════════════════════════════════════════════════════ */
  const IMG_RE = /!\[([^\]]*)\]\((\/api\/process-image\?[^)]+)\)/g;

  function truncateName(name, max) {
    if (name.length <= max) return name;
    return name.slice(0, max - 1) + '…';
  }

  function updateImgStrip() {
    const ta    = document.getElementById('pfProcMd');
    const strip = document.getElementById('pfProcImgStrip');
    const chips = document.getElementById('pfProcImgChips');
    if (!ta || !strip || !chips) return;

    const text    = ta.value;
    const matches = [];
    let m;
    IMG_RE.lastIndex = 0;
    while ((m = IMG_RE.exec(text)) !== null) {
      matches.push({ alt: m[1], url: m[2], full: m[0] });
    }

    chips.replaceChildren();
    strip.hidden = matches.length === 0;

    for (const img of matches) {
      // Extrait le nom de fichier depuis ?name=xxx
      const nameParam = new URLSearchParams(img.url.split('?')[1] || '').get('name') || img.alt || 'image';
      const chip = document.createElement('div');
      chip.className = 'pf-proc-img-chip';

      const thumb = document.createElement('img');
      thumb.src = img.url;
      thumb.alt = img.alt;
      thumb.className = 'pf-proc-img-chip-thumb';
      chip.appendChild(thumb);

      const name = document.createElement('span');
      name.className = 'pf-proc-img-chip-name';
      name.textContent = truncateName(nameParam, 22);
      name.title = nameParam;
      chip.appendChild(name);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'pf-proc-img-chip-del';
      del.textContent = '×';
      del.title = 'Retirer cette image du contenu';
      del.dataset.action = 'remove-img';
      del.dataset.imgFull = img.full;
      chip.appendChild(del);

      chips.appendChild(chip);
    }
  }

  function removeImgFromMarkdown(fullMatch) {
    const ta = document.getElementById('pfProcMd');
    if (!ta) return;
    // Supprime la ligne contenant le snippet (et les éventuelles lignes vides autour)
    ta.value = ta.value
      .split('\n')
      .filter(line => !line.includes(fullMatch))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
    updateImgStrip();
  }

  /* ═══════════════════════════════════════════════════════════
     UPLOAD IMAGE
     ═══════════════════════════════════════════════════════════ */
  function handleImgUpload(file) {
    const status = document.getElementById('pfProcImgStatus');

    if (!currentProc || !currentProc.id) {
      status.textContent = "⚠ Enregistrez d'abord la procédure avant d'ajouter des images.";
      status.className = 'pf-proc-img-status pf-proc-status--error';
      return;
    }
    if (!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type)) {
      status.textContent = '⚠ Format non supporté (png, jpg, gif, webp).';
      status.className = 'pf-proc-img-status pf-proc-status--error';
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      status.textContent = '⚠ Image trop volumineuse (3 Mo max).';
      status.className = 'pf-proc-img-status pf-proc-status--error';
      return;
    }

    status.textContent = 'Envoi…';
    status.className = 'pf-proc-img-status';

    const reader = new FileReader();
    reader.onload = async function (e) {
      const dataBase64 = e.target.result.split(',')[1];
      const { ok, data } = await apiFetch('/api/process-image', {
        method: 'POST',
        body: JSON.stringify({ processId: currentProc.id, contentType: file.type, dataBase64 })
      });
      if (!ok) {
        status.textContent = '✗ ' + (data.error || 'Erreur upload.');
        status.className = 'pf-proc-img-status pf-proc-status--error';
        return;
      }
      const ta    = document.getElementById('pfProcMd');
      const alt   = file.name.replace(/\.[^.]+$/, '');
      const snippet = '\n![' + alt + '](' + data.url + ')\n';
      const start = ta.selectionStart;
      const end   = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + snippet + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + snippet.length;
      ta.focus();
      status.textContent = '✓ Image insérée.';
      status.className = 'pf-proc-img-status pf-proc-status--ok';
      updateImgStrip();
    };
    reader.readAsDataURL(file);
  }

  /* ═══════════════════════════════════════════════════════════
     INSERTION DANS LE TEXTAREA
     ═══════════════════════════════════════════════════════════ */
  function insertAtCursor(ta, text) {
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    ta.selectionStart = ta.selectionEnd = start + text.length;
    ta.focus();
    updateImgStrip();
  }

  /* ═══════════════════════════════════════════════════════════
     PICKER DE COMMANDES PSFORGE
     ═══════════════════════════════════════════════════════════ */
  function openCmdPicker() {
    const picker = document.getElementById('pfProcCmdPicker');
    if (!picker) return;
    picker.hidden = false;
    cmdPickerOpen = true;
    renderCmdPickerList('');
    const inp = document.getElementById('pfProcCmdPickerInput');
    if (inp) { inp.value = ''; inp.focus(); }
  }

  function closeCmdPicker() {
    const picker = document.getElementById('pfProcCmdPicker');
    if (picker) picker.hidden = true;
    cmdPickerOpen = false;
  }

  function renderCmdPickerList(filter) {
    const list = document.getElementById('pfProcCmdPickerList');
    if (!list) return;
    list.replaceChildren();

    const commands = typeof window.pfGetCommandList === 'function' ? window.pfGetCommandList() : [];
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? commands.filter(c => c.cmd.toLowerCase().includes(q) || (c.g || '').toLowerCase().includes(q))
      : commands;
    const shown = filtered.slice(0, 40);

    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'pf-proc-cmd-picker-empty';
      empty.textContent = 'Aucune commande trouvée.';
      list.appendChild(empty);
      return;
    }

    for (const c of shown) {
      const item = document.createElement('div');
      item.className = 'pf-proc-cmd-picker-item';
      item.dataset.action = 'insert-cmd';
      item.dataset.cmd = c.cmd;

      const grp = document.createElement('span');
      grp.className = 'pf-proc-cmd-picker-grp';
      grp.textContent = c.g || '';
      item.appendChild(grp);

      const cmd = document.createElement('code');
      cmd.className = 'pf-proc-cmd-picker-cmd';
      cmd.textContent = c.cmd;
      item.appendChild(cmd);

      list.appendChild(item);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     AFFICHAGE / MASQUAGE DE LA VUE PRINCIPALE
     ═══════════════════════════════════════════════════════════ */
  function showProcessView() {
    document.getElementById('pfCmdView').hidden     = true;
    document.getElementById('pfScriptView').hidden  = true;
    document.getElementById('pfManagerView').hidden = true;
    document.getElementById('pfProcessView').hidden = false;
    document.getElementById('pfProcToggle').classList.add('active');
    procViewActive = true;
    showSub('list');
    loadList();
  }

  function hideProcessView() {
    document.getElementById('pfProcessView').hidden = true;
    document.getElementById('pfCmdView').hidden     = false;
    document.getElementById('pfProcToggle').classList.remove('active');
    procViewActive = false;
  }

  window.pfProcToggleView = function () {
    procViewActive ? hideProcessView() : showProcessView();
  };

  /* ═══════════════════════════════════════════════════════════
     ÉVÉNEMENTS
     ═══════════════════════════════════════════════════════════ */
  document.addEventListener('click', function (e) {
    if (!procViewActive) return;

    // Card → détail
    const card = e.target.closest('.pf-proc-card');
    if (card && card.dataset.id) { openDetail(card.dataset.id); return; }

    // Boutons toolbar
    if (e.target.closest('#pfProcNew'))           { openEditor(null); return; }
    if (e.target.closest('#pfProcBackToList'))     { showSub('list'); currentProc = null; return; }
    if (e.target.closest('#pfProcEdit') && currentProc) { openEditor(currentProc); return; }
    if (e.target.closest('#pfProcDelete'))         { deleteProc(); return; }
    if (e.target.closest('#pfProcSave'))           { saveProc(); return; }
    if (e.target.closest('#pfProcBackFromEditor')) {
      closeCmdPicker();
      if (currentProc && currentProc.id) openDetail(currentProc.id);
      else showSub('list');
      return;
    }

    // Upload image
    if (e.target.closest('#pfProcImgBtn')) {
      document.getElementById('pfProcImgFile').click();
      return;
    }

    // Boutons d'insertion
    const insertBtn = e.target.closest('[data-insert]');
    if (insertBtn) {
      const ta  = document.getElementById('pfProcMd');
      const act = insertBtn.dataset.insert;
      if (act === 'script')     { insertAtCursor(ta, '\n```powershell\n\n```\n'); return; }
      if (act === 'section')    { insertAtCursor(ta, '\n## Nouvelle section\n\n'); return; }
      if (act === 'sep')        { insertAtCursor(ta, '\n---\n\n'); return; }
      if (act === 'cmd-toggle') { cmdPickerOpen ? closeCmdPicker() : openCmdPicker(); return; }
    }

    // Picker : clic sur une commande
    const cmdItem = e.target.closest('[data-action="insert-cmd"]');
    if (cmdItem) {
      const ta  = document.getElementById('pfProcMd');
      insertAtCursor(ta, '\n```powershell\n' + cmdItem.dataset.cmd + '\n```\n');
      closeCmdPicker();
      return;
    }

    // Supprimer image depuis la bande de prévisualisation
    const delBtn = e.target.closest('[data-action="remove-img"]');
    if (delBtn) {
      removeImgFromMarkdown(delBtn.dataset.imgFull);
      return;
    }

    // Collapse/Expand bloc image ou code dans le détail
    const collapseBtn = e.target.closest('[data-action="collapse-block"]');
    if (collapseBtn) {
      const wrap    = collapseBtn.closest('.pf-proc-collapse-wrap');
      const body    = wrap && wrap.querySelector('.pf-proc-block-body');
      if (!wrap || !body) return;
      const collapsed = body.hidden;
      body.hidden = !collapsed;
      collapseBtn.textContent = collapsed
        ? collapseBtn.dataset.labelHide
        : collapseBtn.dataset.labelShow;
      return;
    }

    // Fermer le picker si clic ailleurs
    if (cmdPickerOpen && !e.target.closest('#pfProcCmdPicker') && !e.target.closest('[data-insert="cmd-toggle"]')) {
      closeCmdPicker();
    }
  });

  document.addEventListener('input', function (e) {
    if (!procViewActive) return;
    if (e.target.id === 'pfProcSearch') {
      renderCards(e.target.value);
      return;
    }
    if (e.target.id === 'pfProcMd') {
      updateImgStrip();
      return;
    }
    if (e.target.id === 'pfProcCmdPickerInput') {
      renderCmdPickerList(e.target.value);
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'pfProcImgFile') {
      const f = e.target.files && e.target.files[0];
      if (f) handleImgUpload(f);
      e.target.value = '';
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && cmdPickerOpen) { closeCmdPicker(); }
  });

})();
