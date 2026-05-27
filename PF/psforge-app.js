/* ──────────────────────────────────────────────────────────────
   PsForge — logique applicative
   CSP-compliant : script-src 'self', aucun inline handler
   ────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  /* ════════════════════════════════════════════════════════════
     DONNÉES — LISTE DE COMMANDES
     s = section  /  g = groupe  /  cmd = template
     ════════════════════════════════════════════════════════════ */

  const PF_COMMANDS = [
    // ── SYSTÈME WINDOWS ─────────────────────────────────────
    { s: 'Système Windows', g: 'Intégrité système',         cmd: 'sfc /scannow' },
    { s: 'Système Windows', g: 'Intégrité système',         cmd: 'DISM /Online /Cleanup-Image /RestoreHealth' },
    { s: 'Système Windows', g: 'Intégrité système',         cmd: 'DISM /Online /Cleanup-Image /CheckHealth' },
    { s: 'Système Windows', g: 'Intégrité système',         cmd: 'DISM /Online /Cleanup-Image /ScanHealth' },
    { s: 'Système Windows', g: 'Intégrité système',         cmd: 'DISM /Online /Cleanup-Image /StartComponentCleanup' },
    { s: 'Système Windows', g: 'Intégrité système',         cmd: 'sfc /verifyonly' },

    { s: 'Système Windows', g: 'Réseau',                    cmd: 'ipconfig /all' },
    { s: 'Système Windows', g: 'Réseau',                    cmd: 'ipconfig /flushdns' },
    { s: 'Système Windows', g: 'Réseau',                    cmd: 'ipconfig /release' },
    { s: 'Système Windows', g: 'Réseau',                    cmd: 'ipconfig /renew' },
    { s: 'Système Windows', g: 'Réseau',                    cmd: 'netsh winsock reset' },
    { s: 'Système Windows', g: 'Réseau',                    cmd: 'netsh int ip reset' },
    { s: 'Système Windows', g: 'Réseau',                    cmd: 'netsh winhttp reset proxy' },
    { s: 'Système Windows', g: 'Réseau',                    cmd: 'Test-NetConnection <host> -Port <port>' },
    { s: 'Système Windows', g: 'Réseau',                    cmd: 'Resolve-DnsName <domaine>' },
    { s: 'Système Windows', g: 'Réseau',                    cmd: 'nslookup <domaine>' },
    { s: 'Système Windows', g: 'Réseau',                    cmd: 'tracert <host>' },
    { s: 'Système Windows', g: 'Réseau',                    cmd: 'ping <host> -t' },

    { s: 'Système Windows', g: 'Services & Processus',      cmd: 'Get-Service <nom>' },
    { s: 'Système Windows', g: 'Services & Processus',      cmd: 'Restart-Service <nom> -Force' },
    { s: 'Système Windows', g: 'Services & Processus',      cmd: 'Stop-Process -Name <nom> -Force' },
    { s: 'Système Windows', g: 'Services & Processus',      cmd: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 20' },
    { s: 'Système Windows', g: 'Services & Processus',      cmd: 'tasklist /svc' },

    { s: 'Système Windows', g: 'Nettoyage & Espace disque', cmd: 'cleanmgr /sagerun:1' },
    { s: 'Système Windows', g: 'Nettoyage & Espace disque', cmd: 'Get-PSDrive -PSProvider FileSystem' },
    { s: 'Système Windows', g: 'Nettoyage & Espace disque', cmd: 'Remove-Item $env:TEMP\\* -Recurse -Force -ErrorAction SilentlyContinue' },
    { s: 'Système Windows', g: 'Nettoyage & Espace disque', cmd: 'Remove-Item C:\\Windows\\Temp\\* -Recurse -Force -ErrorAction SilentlyContinue' },
    { s: 'Système Windows', g: 'Nettoyage & Espace disque', cmd: 'Clear-RecycleBin -Force' },

    { s: 'Système Windows', g: 'Sécurité locale',           cmd: 'gpupdate /force' },
    { s: 'Système Windows', g: 'Sécurité locale',           cmd: 'gpresult /r' },
    { s: 'Système Windows', g: 'Sécurité locale',           cmd: 'gpresult /h C:\\Temp\\gpo-report.html /f' },
    { s: 'Système Windows', g: 'Sécurité locale',           cmd: 'net localgroup administrators' },
    { s: 'Système Windows', g: 'Sécurité locale',           cmd: 'whoami /groups' },
    { s: 'Système Windows', g: 'Sécurité locale',           cmd: 'auditpol /get /category:*' },

    { s: 'Système Windows', g: 'Windows Update',            cmd: 'Get-WindowsUpdateLog' },
    { s: 'Système Windows', g: 'Windows Update',            cmd: 'UsoClient StartScan' },
    { s: 'Système Windows', g: 'Windows Update',            cmd: 'UsoClient StartDownload' },
    { s: 'Système Windows', g: 'Windows Update',            cmd: 'UsoClient StartInstall' },
    { s: 'Système Windows', g: 'Windows Update',            cmd: 'Get-HotFix | Sort-Object InstalledOn -Descending' },

    // ── MICROSOFT 365 / AZURE AD ────────────────────────────
    { s: 'Microsoft 365', g: 'Utilisateur',                 cmd: 'Get-MgUser -UserId <upn>' },
    { s: 'Microsoft 365', g: 'Utilisateur',                 cmd: 'Update-MgUser -UserId <upn> -AccountEnabled $false' },
    { s: 'Microsoft 365', g: 'Utilisateur',                 cmd: 'Update-MgUser -UserId <upn> -AccountEnabled $true' },
    { s: 'Microsoft 365', g: 'Utilisateur',                 cmd: 'Get-MgAuditLogSignIn -Filter "userPrincipalName eq \'<upn>\'" -Top 20' },
    { s: 'Microsoft 365', g: 'Utilisateur',                 cmd: 'Restore-MgDirectoryDeletedItem -DirectoryObjectId <objectid>' },

    { s: 'Microsoft 365', g: 'Exchange Online',             cmd: 'Connect-ExchangeOnline -UserPrincipalName <upn>' },
    { s: 'Microsoft 365', g: 'Exchange Online',             cmd: 'Get-MailboxStatistics -Identity <upn>' },
    { s: 'Microsoft 365', g: 'Exchange Online',             cmd: 'Get-MailboxPermission -Identity <upn>' },
    { s: 'Microsoft 365', g: 'Exchange Online',             cmd: 'Add-MailboxPermission -Identity <upn> -User <upn> -AccessRights FullAccess' },
    { s: 'Microsoft 365', g: 'Exchange Online',             cmd: 'Remove-MailboxPermission -Identity <upn> -User <upn> -AccessRights FullAccess' },
    { s: 'Microsoft 365', g: 'Exchange Online',             cmd: 'Get-Mailbox <upn> | fl RetentionHoldEnabled, ElcProcessingDisabled' },
    { s: 'Microsoft 365', g: 'Exchange Online',             cmd: 'Set-Mailbox <upn> -ElcProcessingDisabled $false' },
    { s: 'Microsoft 365', g: 'Exchange Online',             cmd: 'Start-ManagedFolderAssistant -Identity <upn>' },
    { s: 'Microsoft 365', g: 'Exchange Online',             cmd: 'Get-MailboxStatistics -Archive -Identity <upn> | Select-Object TotalItemSize' },
    { s: 'Microsoft 365', g: 'Exchange Online',             cmd: 'Get-MessageTrace -SenderAddress <upn> -StartDate <date> -EndDate <date>' },
    { s: 'Microsoft 365', g: 'Exchange Online',             cmd: 'Get-MessageTrace -RecipientAddress <upn> -StartDate <date> -EndDate <date>' },
    { s: 'Microsoft 365', g: 'Exchange Online',             cmd: 'Get-QuarantineMessage -RecipientAddress <upn>' },
    { s: 'Microsoft 365', g: 'Exchange Online',             cmd: 'Release-QuarantineMessage -Identity <id> -ReleaseToAll' },

    { s: 'Microsoft 365', g: 'MFA / Sécurité',             cmd: 'Get-MgUserAuthenticationMethod -UserId <upn>' },
    { s: 'Microsoft 365', g: 'MFA / Sécurité',             cmd: 'Remove-MgUserAuthenticationMethodMicrosoftAuthenticatorAuthenticationMethod -UserId <upn> -MicrosoftAuthenticatorAuthenticationMethodId <id>' },
    { s: 'Microsoft 365', g: 'MFA / Sécurité',             cmd: 'Get-MgRiskDetection -Filter "userPrincipalName eq \'<upn>\'"' },

    { s: 'Microsoft 365', g: 'Licences',                    cmd: 'Get-MgUserLicenseDetail -UserId <upn>' },
    { s: 'Microsoft 365', g: 'Licences',                    cmd: 'Get-MgSubscribedSku' },
    { s: 'Microsoft 365', g: 'Licences',                    cmd: 'Set-MgUserLicense -UserId <upn> -AddLicenses @{SkuId="<skuid>"} -RemoveLicenses @()' },
    { s: 'Microsoft 365', g: 'Licences',                    cmd: 'Set-MgUserLicense -UserId <upn> -AddLicenses @() -RemoveLicenses @("<skuid>")' },

    { s: 'Microsoft 365', g: 'Groupes',                     cmd: 'Get-MgGroupMember -GroupId <groupid>' },
    { s: 'Microsoft 365', g: 'Groupes',                     cmd: 'New-MgGroupMember -GroupId <groupid> -DirectoryObjectId <objectid>' },
    { s: 'Microsoft 365', g: 'Groupes',                     cmd: 'Remove-MgGroupMemberByRef -GroupId <groupid> -DirectoryObjectId <objectid>' },

    { s: 'Microsoft 365', g: 'Appareils — Intune',          cmd: 'Get-MgUserRegisteredDevice -UserId <upn>' },
    { s: 'Microsoft 365', g: 'Appareils — Intune',          cmd: 'Get-MgDeviceManagementManagedDevice -Filter "userPrincipalName eq \'<upn>\'"' },
    { s: 'Microsoft 365', g: 'Appareils — Intune',          cmd: 'Invoke-MgRetireDeviceManagementManagedDevice -ManagedDeviceId <id>' },

    { s: 'Microsoft 365', g: 'Teams',                       cmd: 'Get-Team -User <upn>' },
    { s: 'Microsoft 365', g: 'Teams',                       cmd: 'Get-TeamUser -GroupId <groupid>' },
    { s: 'Microsoft 365', g: 'Teams',                       cmd: 'Add-TeamUser -GroupId <groupid> -User <upn>' },
    { s: 'Microsoft 365', g: 'Teams',                       cmd: 'Remove-TeamUser -GroupId <groupid> -User <upn>' },
  ];

  /* ════════════════════════════════════════════════════════════
     PERSISTANCE — clés localStorage
     ════════════════════════════════════════════════════════════ */

  const FAV_KEY    = 'psforge_favorites_v1';
  const SAVE_KEY   = 'psforge_saved_v1';
  const BLOCKS_KEY = 'psforge_blocks_v1';

  /* ── Config par défaut des blocs sidebar ── */
  const DEFAULT_BLOCKS = [
    { id: 'upn',      label: 'UPN',        hint: 'ex. john.doe@contoso.com',                           placeholder: 'john.doe@contoso.com'                 },
    { id: 'groupid',  label: 'Groupe ID',  hint: 'GUID du groupe Entra ID',                            placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { id: 'objectid', label: 'Object ID',  hint: "GUID de l'objet ou utilisateur Entra ID",            placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { id: 'skuid',    label: 'SKU ID',     hint: 'GUID de la licence (Get-MgSubscribedSku)',            placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
    { id: 'id',       label: 'ID',         hint: 'Id retourné par une commande précédente',             placeholder: 'id retourné'                          },
    { id: 'nom',      label: 'Nom',        hint: 'ex. Spooler · W32Time · Teams',                      placeholder: 'Spooler'                              },
    { id: 'host',     label: 'Hôte / IP',  hint: 'ex. google.com · 192.168.1.1 · smtp.office365.com',  placeholder: 'google.com'                           },
    { id: 'domaine',  label: 'Domaine',    hint: 'ex. contoso.com · be-cloud.fr',                      placeholder: 'contoso.com'                          },
    { id: 'port',     label: 'Port',       hint: 'ex. 443 · 25 · 587 · 3389',                          placeholder: '443',          inputmode: 'numeric'   },
    { id: 'ip',       label: 'IP',         hint: 'ex. 192.168.1.100 · 10.0.0.1',                       placeholder: '192.168.1.100'                        },
    { id: 'date',     label: 'Date',       hint: 'Format MM/DD/YYYY (Get-MessageTrace)',                placeholder: '05/27/2026'                           },
    { id: 'chemin',   label: 'Chemin',     hint: 'ex. C:\\Temp\\rapport.html · \\\\serveur\\partage',  placeholder: 'C:\\Temp\\'                           },
  ];

  function loadBlocksConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(BLOCKS_KEY));
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch {}
    return DEFAULT_BLOCKS.map(function (b) { return Object.assign({}, b); });
  }
  function saveBlocksConfig(config) {
    try { localStorage.setItem(BLOCKS_KEY, JSON.stringify(config)); } catch {}
  }

  /* ── Favoris ── */
  function loadFavorites() {
    try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); }
    catch { return new Set(); }
  }
  function saveFavorites(set) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...set])); } catch {}
  }
  function toggleFavorite(cmd) {
    const favs = loadFavorites();
    if (favs.has(cmd)) { favs.delete(cmd); } else { favs.add(cmd); }
    saveFavorites(favs);
    renderCommandList(document.getElementById('pfCmdSearch')?.value || '');
  }

  /* ── Mes commandes sauvegardées ── */
  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); }
    catch { return []; }
  }
  function saveCommand(name, cmdText) {
    const saved = loadSaved();
    saved.unshift({ name, cmd: cmdText, ts: Date.now() });
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved.slice(0, 100))); } catch {}
  }
  function deleteSaved(ts) {
    const saved = loadSaved().filter(function (e) { return e.ts !== ts; });
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch {}
    renderCommandList(document.getElementById('pfCmdSearch')?.value || '');
  }

  /* ════════════════════════════════════════════════════════════
     UTILITAIRES
     ════════════════════════════════════════════════════════════ */

  function copyText(text, feedbackEl) {
    navigator.clipboard.writeText(text).then(function () {
      showCopied(feedbackEl);
    }).catch(function () {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showCopied(feedbackEl);
      } catch (e) {}
    });
  }

  function showCopied(el) {
    if (!el) return;
    el.textContent = 'Copié !';
    el.classList.add('pf-copied-flash');
    setTimeout(function () {
      el.textContent = '';
      el.classList.remove('pf-copied-flash');
    }, 950);
  }

  /* ════════════════════════════════════════════════════════════
     ÉTAT — PARAM SÉLECTIONNÉ DANS LE BUILD
     ════════════════════════════════════════════════════════════ */

  let activeParamTag = null;
  let selectedTemplate = null;

  function selectParamTag(span) {
    if (activeParamTag && activeParamTag !== span) {
      activeParamTag.classList.remove('active');
    }
    if (activeParamTag === span) {
      span.classList.remove('active');
      activeParamTag = null;
      return;
    }

    /* Auto-injection si exactement une bulle existe pour ce param */
    const blockId = span.dataset.param;
    if (blockId) {
      const bubbleTexts = document.querySelectorAll('#bubbles-' + blockId + ' .pf-bubble-text');
      if (bubbleTexts.length === 1) {
        span.textContent = bubbleTexts[0].textContent;
        span.classList.add('filled');
        span.classList.remove('active');
        activeParamTag = null;
        return;
      }
    }

    span.classList.add('active');
    activeParamTag = span;
  }

  function injectIntoActive(value) {
    if (!activeParamTag || !document.contains(activeParamTag)) {
      activeParamTag = null;
      return;
    }
    activeParamTag.textContent = value;
    activeParamTag.classList.add('filled');
    activeParamTag.classList.remove('active');
    activeParamTag = null;
  }

  /* ════════════════════════════════════════════════════════════
     COMMAND BUILDER — zone de build éditable
     ════════════════════════════════════════════════════════════ */

  function makeParamTag(paramText, key) {
    const tag = document.createElement('span');
    tag.className = 'pf-param-tag';
    tag.contentEditable = 'false';
    tag.dataset.param = key || paramText.replace(/[<>]/g, '').toLowerCase();
    tag.textContent = paramText;
    tag.addEventListener('mousedown', function (e) { e.preventDefault(); });
    tag.addEventListener('click', function (e) {
      e.stopPropagation();
      selectParamTag(tag);
    });
    return tag;
  }

  /* Surveille la frappe et convertit <mot> en tag interactif */
  function autoConvertParams() {
    const div = document.getElementById('pfCmdBuilt');
    if (!div) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !div.contains(node)) return;

    const text   = node.textContent;
    const offset = range.startOffset;
    const before = text.substring(0, offset);
    const m      = before.match(/<([a-zA-Z]+)>$/);
    if (!m) return;

    const paramText  = m[0];
    const key        = m[1].toLowerCase();
    const startIndex = offset - paramText.length;
    const beforeText = text.substring(0, startIndex);
    const afterText  = text.substring(offset);

    const tag        = makeParamTag(paramText, key);
    const parent     = node.parentNode;
    const beforeNode = beforeText ? document.createTextNode(beforeText) : null;
    const afterNode  = afterText  ? document.createTextNode(afterText)  : null;

    if (beforeNode) parent.insertBefore(beforeNode, node);
    parent.insertBefore(tag, node);
    if (afterNode)  parent.insertBefore(afterNode, node);
    parent.removeChild(node);

    const newRange = document.createRange();
    if (afterNode) { newRange.setStart(afterNode, 0); }
    else           { newRange.setStartAfter(tag); }
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  /* Insère un tag <paramKey> à la position du curseur dans le build */
  function insertParamAtCursor(paramKey) {
    const div = document.getElementById('pfCmdBuilt');
    if (!div) return;

    const hint = div.querySelector('.pf-cmd-hint');
    if (hint) { div.replaceChildren(); selectedTemplate = null; }

    div.focus();

    const sel = window.getSelection();
    let range;
    if (sel && sel.rangeCount > 0 && div.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0);
      range.deleteContents();
    } else {
      range = document.createRange();
      range.selectNodeContents(div);
      range.collapse(false);
    }

    const tag = makeParamTag('<' + paramKey + '>', paramKey);

    /* Auto-injection via chip si exactement une bulle existe */
    const bubbleTexts = document.querySelectorAll('#bubbles-' + paramKey + ' .pf-bubble-text');
    if (bubbleTexts.length === 1) {
      tag.textContent = bubbleTexts[0].textContent;
      tag.classList.add('filled');
    }

    range.insertNode(tag);

    const newRange = document.createRange();
    newRange.setStartAfter(tag);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  function renderBuiltCommand() {
    const div = document.getElementById('pfCmdBuilt');
    if (!div) return;

    activeParamTag = null;
    div.replaceChildren();

    if (!selectedTemplate) {
      const hint = document.createElement('span');
      hint.className = 'pf-cmd-hint';
      hint.textContent = '← Sélectionnez une commande dans la liste';
      div.appendChild(hint);
      return;
    }

    selectedTemplate.split(/(<[a-zA-Z]+>)/).forEach(function (part) {
      const m = part.match(/^<([a-zA-Z]+)>$/);
      if (m) {
        div.appendChild(makeParamTag(part, m[1].toLowerCase()));
      } else if (part) {
        div.appendChild(document.createTextNode(part));
      }
    });

    div.addEventListener('mousedown', function (e) {
      if (!e.target.closest('.pf-param-tag') && activeParamTag) {
        activeParamTag.classList.remove('active');
        activeParamTag = null;
      }
    });
  }

  /* Charge un texte de commande dans le builder en convertissant <param> en tags */
  function loadCommandText(cmdText) {
    const div = document.getElementById('pfCmdBuilt');
    if (!div) return;
    activeParamTag = null;
    selectedTemplate = null;
    div.replaceChildren();
    cmdText.split(/(<[a-zA-Z]+>)/).forEach(function (part) {
      const m = part.match(/^<([a-zA-Z]+)>$/);
      if (m) {
        div.appendChild(makeParamTag(part, m[1].toLowerCase()));
      } else if (part) {
        div.appendChild(document.createTextNode(part));
      }
    });
  }

  function getBuiltText() {
    const div = document.getElementById('pfCmdBuilt');
    if (!div) return '';
    if (div.querySelector('.pf-cmd-hint')) return '';
    return div.textContent;
  }

  /* ════════════════════════════════════════════════════════════
     PARAM CHIPS — barre d'insertion dans la zone de build
     ════════════════════════════════════════════════════════════ */

  function renderParamChips() {
    const bar = document.getElementById('pfParamChipsBar');
    if (!bar) return;
    bar.replaceChildren();

    const lbl = document.createElement('span');
    lbl.className = 'pf-chips-label';
    lbl.textContent = 'Insérer :';
    bar.appendChild(lbl);

    loadBlocksConfig().forEach(function (cfg) {
      const chip = document.createElement('button');
      chip.className = 'pf-param-chip';
      chip.type = 'button';
      chip.title = 'Insérer <' + cfg.id + '> dans la commande';
      chip.textContent = '<' + cfg.id + '>';
      chip.addEventListener('click', function () { insertParamAtCursor(cfg.id); });
      bar.appendChild(chip);
    });
  }

  /* ════════════════════════════════════════════════════════════
     COMMAND LIST — blocs dépliables colonne droite
     ════════════════════════════════════════════════════════════ */

  function buildCmdItemDom(template) {
    const favs = loadFavorites();

    const wrap = document.createElement('div');
    wrap.className = 'pf-cmd-item-wrap';
    if (selectedTemplate === template) wrap.classList.add('selected');

    const btn = document.createElement('button');
    btn.className = 'pf-cmd-item';
    btn.type = 'button';
    btn.title = template;

    template.split(/(<[a-zA-Z]+>)/).forEach(function (part) {
      if (/^<[a-zA-Z]+>$/.test(part)) {
        const span = document.createElement('span');
        span.className = 'pf-cmd-param';
        span.textContent = part;
        btn.appendChild(span);
      } else if (part) {
        btn.appendChild(document.createTextNode(part));
      }
    });

    btn.addEventListener('click', function () {
      document.querySelectorAll('.pf-cmd-item-wrap.selected').forEach(function (el) {
        el.classList.remove('selected');
      });
      wrap.classList.add('selected');
      selectedTemplate = template;
      renderBuiltCommand();
    });

    const star = document.createElement('button');
    star.className = 'pf-cmd-star' + (favs.has(template) ? ' favorited' : '');
    star.type = 'button';
    star.title = favs.has(template) ? 'Retirer des favoris' : 'Ajouter aux favoris';
    star.textContent = favs.has(template) ? '★' : '☆';
    star.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleFavorite(template);
    });

    wrap.appendChild(btn);
    wrap.appendChild(star);
    return wrap;
  }

  function makeCgBlock(labelEl, itemsBuilder, extraClass, collapsed) {
    const block = document.createElement('div');
    block.className = 'pf-cg-block' + (extraClass ? ' ' + extraClass : '');
    if (collapsed) block.classList.add('collapsed');

    const header = document.createElement('div');
    header.className = 'pf-cg-header';
    header.appendChild(labelEl);
    const arrow = document.createElement('span');
    arrow.className = 'pf-cg-arrow';
    arrow.textContent = '▾';
    header.appendChild(arrow);
    header.addEventListener('click', function () { block.classList.toggle('collapsed'); });

    const body = document.createElement('div');
    body.className = 'pf-cg-body';
    itemsBuilder(body);

    block.appendChild(header);
    block.appendChild(body);
    return block;
  }

  function makeSavedBlock(savedList) {
    const labelEl = document.createElement('span');
    labelEl.className = 'pf-cg-label';
    labelEl.appendChild(document.createTextNode('💾 Mes commandes '));
    const cnt = document.createElement('span');
    cnt.className = 'pf-cg-count';
    cnt.textContent = savedList.length;
    labelEl.appendChild(cnt);

    return makeCgBlock(labelEl, function (body) {
      savedList.forEach(function (entry) {
        const wrap = document.createElement('div');
        wrap.className = 'pf-cmd-item-wrap';

        const btn = document.createElement('button');
        btn.className = 'pf-cmd-item';
        btn.type = 'button';
        btn.title = entry.cmd;
        btn.textContent = entry.name || entry.cmd;
        btn.addEventListener('click', function () {
          document.querySelectorAll('.pf-cmd-item-wrap.selected').forEach(function (el) { el.classList.remove('selected'); });
          wrap.classList.add('selected');
          loadCommandText(entry.cmd);
        });

        const del = document.createElement('button');
        del.className = 'pf-saved-del';
        del.type = 'button';
        del.title = 'Supprimer';
        del.textContent = '✕';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          deleteSaved(entry.ts);
        });

        wrap.appendChild(btn);
        wrap.appendChild(del);
        body.appendChild(wrap);
      });
    }, 'pf-cg-block--saved', false);
  }

  function makeFavBlock(visibleFavs, total) {
    const labelEl = document.createElement('span');
    labelEl.className = 'pf-cg-label';
    labelEl.appendChild(document.createTextNode('★ Favoris '));
    const cnt = document.createElement('span');
    cnt.className = 'pf-cg-count';
    cnt.textContent = total;
    labelEl.appendChild(cnt);
    labelEl.style.color = '#f59e0b';

    return makeCgBlock(labelEl, function (body) {
      visibleFavs.forEach(function (cmd) { body.appendChild(buildCmdItemDom(cmd)); });
    }, 'pf-cg-block--fav', false);
  }

  function renderCommandList(filter) {
    const list = document.getElementById('pfCmdList');
    if (!list) return;
    list.replaceChildren();

    const q     = (filter || '').toLowerCase().trim();
    const favs  = loadFavorites();
    const saved = loadSaved();

    const filteredSaved = saved.filter(function (e) {
      return !q || e.name.toLowerCase().indexOf(q) !== -1 || e.cmd.toLowerCase().indexOf(q) !== -1;
    });
    if (filteredSaved.length > 0) list.appendChild(makeSavedBlock(filteredSaved));

    const visibleFavs = [...favs].filter(function (cmd) {
      return !q || cmd.toLowerCase().indexOf(q) !== -1;
    });
    if (favs.size > 0) list.appendChild(makeFavBlock(visibleFavs, favs.size));

    const sectionMap   = {};
    const sectionOrder = [];

    PF_COMMANDS.forEach(function (entry) {
      if (q &&
          entry.cmd.toLowerCase().indexOf(q) === -1 &&
          entry.g.toLowerCase().indexOf(q)   === -1 &&
          entry.s.toLowerCase().indexOf(q)   === -1) return;

      if (!sectionMap[entry.s]) { sectionMap[entry.s] = {}; sectionOrder.push(entry.s); }
      if (!sectionMap[entry.s][entry.g]) sectionMap[entry.s][entry.g] = [];
      sectionMap[entry.s][entry.g].push(entry.cmd);
    });

    if (sectionOrder.length === 0 && saved.length === 0 && favs.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'pf-cmd-empty';
      empty.textContent = 'Aucune commande trouvée.';
      list.appendChild(empty);
      return;
    }

    const sectionsRow = document.createElement('div');
    sectionsRow.className = 'pf-cmd-sections';

    sectionOrder.forEach(function (sName) {
      const col = document.createElement('div');
      col.className = 'pf-sec-col';

      const sLabel = document.createElement('div');
      sLabel.className = 'pf-cg-section';
      sLabel.textContent = sName;
      col.appendChild(sLabel);

      const grid = document.createElement('div');
      grid.className = 'pf-sec-groups';

      const gcol1 = document.createElement('div');
      gcol1.className = 'pf-sec-groups-col';
      const gcol2 = document.createElement('div');
      gcol2.className = 'pf-sec-groups-col';

      Object.keys(sectionMap[sName]).forEach(function (gName, i) {
        const lEl = document.createElement('span');
        lEl.className = 'pf-cg-label';
        lEl.textContent = gName;
        const cmds = sectionMap[sName][gName];
        const block = makeCgBlock(lEl, function (body) {
          cmds.forEach(function (cmd) { body.appendChild(buildCmdItemDom(cmd)); });
        }, '', true);
        (i % 2 === 0 ? gcol1 : gcol2).appendChild(block);
      });

      grid.appendChild(gcol1);
      grid.appendChild(gcol2);

      col.appendChild(grid);
      sectionsRow.appendChild(col);
    });

    list.appendChild(sectionsRow);
  }

  /* ════════════════════════════════════════════════════════════
     SIDEBAR — gestion dynamique des blocs
     ════════════════════════════════════════════════════════════ */

  function createBlockDom(cfg) {
    const block = document.createElement('div');
    block.className = 'pf-block collapsed';
    block.id = 'block-' + cfg.id;
    block.draggable = true;

    /* En-tête */
    const header = document.createElement('div');
    header.className = 'pf-block-header';
    header.dataset.toggle = cfg.id;

    const dragHandle = document.createElement('span');
    dragHandle.className = 'pf-drag-handle';
    dragHandle.textContent = '⠿';

    const labelEl = document.createElement('span');
    labelEl.className = 'pf-block-label';
    labelEl.textContent = cfg.label;

    const badge = document.createElement('span');
    badge.className = 'pf-block-param-badge';
    badge.textContent = '<' + cfg.id + '>';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'pf-block-reset';
    resetBtn.type = 'button';
    resetBtn.dataset.action = 'reset-block';
    resetBtn.dataset.block = cfg.id;
    resetBtn.title = 'Vider ce bloc';
    resetBtn.textContent = '✕';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'pf-block-delete';
    deleteBtn.type = 'button';
    deleteBtn.dataset.action = 'delete-block';
    deleteBtn.dataset.block = cfg.id;
    deleteBtn.title = 'Supprimer ce bloc';
    deleteBtn.textContent = '🗑';

    const arrow = document.createElement('span');
    arrow.className = 'pf-collapse-arrow';
    arrow.textContent = '▾';

    header.appendChild(dragHandle);
    header.appendChild(labelEl);
    header.appendChild(badge);
    header.appendChild(resetBtn);
    header.appendChild(deleteBtn);
    header.appendChild(arrow);

    /* Bulles */
    const bubbles = document.createElement('div');
    bubbles.className = 'pf-bubbles';
    bubbles.id = 'bubbles-' + cfg.id;
    bubbles.setAttribute('aria-live', 'polite');

    /* Corps */
    const body = document.createElement('div');
    body.className = 'pf-block-body';

    if (cfg.hint) {
      const hint = document.createElement('p');
      hint.className = 'pf-block-hint';
      hint.textContent = cfg.hint;
      body.appendChild(hint);
    }

    const inputRow = document.createElement('div');
    inputRow.className = 'pf-input-row';

    const input = document.createElement('input');
    input.className = 'pf-input';
    input.id = 'input-' + cfg.id;
    input.type = 'text';
    input.placeholder = cfg.placeholder || '';
    input.autocomplete = 'off';
    input.spellcheck = false;
    if (cfg.inputmode) input.inputMode = cfg.inputmode;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'pf-btn-icon';
    copyBtn.type = 'button';
    copyBtn.dataset.action = 'copy-input';
    copyBtn.dataset.target = 'input-' + cfg.id;
    copyBtn.title = 'Copier';
    const copyImg = document.createElement('img');
    copyImg.src = '../assets/copy.png';
    copyImg.className = 'icon-adaptive';
    copyImg.alt = 'Copier';
    copyBtn.appendChild(copyImg);

    const validateBtn = document.createElement('button');
    validateBtn.className = 'pf-btn-validate';
    validateBtn.type = 'button';
    validateBtn.dataset.action = 'validate';
    validateBtn.dataset.block = cfg.id;
    validateBtn.textContent = 'Valider';

    inputRow.appendChild(input);
    inputRow.appendChild(copyBtn);
    inputRow.appendChild(validateBtn);
    body.appendChild(inputRow);

    block.appendChild(header);
    block.appendChild(bubbles);
    block.appendChild(body);
    return block;
  }

  function renderSidebar() {
    const list = document.getElementById('pfBlocksList');
    if (!list) return;
    list.replaceChildren();
    loadBlocksConfig().forEach(function (cfg) {
      list.appendChild(createBlockDom(cfg));
    });
    renderParamChips();
  }

  function addBlock(label) {
    const trimmed = (label || '').trim();
    if (!trimmed) return;

    const baseId = trimmed.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 20) || 'bloc';

    const config = loadBlocksConfig();
    let id = baseId;
    let i = 2;
    while (config.some(function (c) { return c.id === id; })) { id = baseId + '-' + (i++); }

    config.push({ id: id, label: trimmed, hint: '', placeholder: trimmed, custom: true });
    saveBlocksConfig(config);
    renderSidebar();
  }

  function deleteBlock(blockId) {
    const config = loadBlocksConfig().filter(function (c) { return c.id !== blockId; });
    saveBlocksConfig(config);
    renderSidebar();
  }

  function resetBlocksConfig() {
    try { localStorage.removeItem(BLOCKS_KEY); } catch {}
    renderSidebar();
  }

  /* ════════════════════════════════════════════════════════════
     BULLES
     ════════════════════════════════════════════════════════════ */

  function createBubble(value, bubblesContainer) {
    const bubble = document.createElement('div');
    bubble.className = 'pf-bubble';
    bubble.title = 'Cliquer pour copier';

    const txt = document.createElement('span');
    txt.className = 'pf-bubble-text';
    txt.textContent = value;

    const feedback = document.createElement('span');
    feedback.className = 'pf-bubble-feedback';
    feedback.setAttribute('aria-live', 'polite');

    bubble.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      copyText(value, feedback);
    });

    const btnArrow = document.createElement('button');
    btnArrow.className = 'pf-bubble-btn-arrow';
    btnArrow.type = 'button';
    btnArrow.title = 'Injecter dans la commande sélectionnée';
    const imgArrow = document.createElement('img');
    imgArrow.src = '../assets/go.png';
    imgArrow.className = 'icon-adaptive';
    imgArrow.alt = '→';
    btnArrow.appendChild(imgArrow);
    btnArrow.addEventListener('click', function () { injectIntoActive(value); });

    const btnDel = document.createElement('button');
    btnDel.className = 'pf-bubble-btn-del';
    btnDel.type = 'button';
    btnDel.title = 'Supprimer';
    btnDel.textContent = '✕';
    btnDel.addEventListener('click', function () {
      bubble.style.transition = 'opacity .12s, transform .12s';
      bubble.style.opacity = '0';
      bubble.style.transform = 'scale(.88)';
      setTimeout(function () { bubble.remove(); }, 130);
    });

    bubble.appendChild(txt);
    bubble.appendChild(feedback);
    bubble.appendChild(btnArrow);
    bubble.appendChild(btnDel);

    bubblesContainer.insertBefore(bubble, bubblesContainer.firstChild);
  }

  /* ════════════════════════════════════════════════════════════
     VALIDATION
     ════════════════════════════════════════════════════════════ */

  function validateBlock(blockId) {
    const input = document.getElementById('input-' + blockId);
    const bubblesContainer = document.getElementById('bubbles-' + blockId);
    if (!input || !bubblesContainer) return;

    const value = input.value.trim();
    if (!value) {
      input.style.transition = 'box-shadow .08s';
      input.style.boxShadow = '0 0 0 3px rgba(220,38,38,.35)';
      setTimeout(function () { input.style.boxShadow = ''; }, 600);
      return;
    }
    createBubble(value, bubblesContainer);
    input.value = '';
    input.focus();
  }

  function copyInputValue(targetId) {
    const input = document.getElementById(targetId);
    if (!input || !input.value.trim()) return;
    copyText(input.value.trim(), null);
  }

  /* ════════════════════════════════════════════════════════════
     RESET
     ════════════════════════════════════════════════════════════ */

  function resetBlock(blockId) {
    const container = document.getElementById('bubbles-' + blockId);
    if (container) container.replaceChildren();
  }

  function resetAll() {
    document.querySelectorAll('.pf-bubbles').forEach(function (c) { c.replaceChildren(); });
  }

  /* ════════════════════════════════════════════════════════════
     DRAG & DROP — réordonnancement blocs sidebar
     ════════════════════════════════════════════════════════════ */

  let dragSrc = null;

  function initDragDrop() {
    const list = document.getElementById('pfBlocksList');
    if (!list) return;

    list.addEventListener('dragstart', function (e) {
      const block = e.target.closest('.pf-block[draggable]');
      if (!block) return;
      if (e.target.closest('input, button, .pf-bubbles')) { e.preventDefault(); return; }
      dragSrc = block;
      block.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', block.id);
    });

    list.addEventListener('dragend', function () {
      if (dragSrc) dragSrc.classList.remove('dragging');
      dragSrc = null;
      list.querySelectorAll('.pf-block').forEach(function (b) {
        b.classList.remove('drag-over-top', 'drag-over-bottom');
      });
    });

    list.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const over = e.target.closest('.pf-block');
      if (!over || over === dragSrc) return;
      list.querySelectorAll('.pf-block').forEach(function (b) {
        b.classList.remove('drag-over-top', 'drag-over-bottom');
      });
      const rect = over.getBoundingClientRect();
      over.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drag-over-top' : 'drag-over-bottom');
    });

    list.addEventListener('dragleave', function (e) {
      const over = e.target.closest('.pf-block');
      if (over) over.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    list.addEventListener('drop', function (e) {
      e.preventDefault();
      const over = e.target.closest('.pf-block');
      if (!over || !dragSrc || over === dragSrc) return;
      const rect = over.getBoundingClientRect();
      list.insertBefore(dragSrc, e.clientY < rect.top + rect.height / 2 ? over : over.nextSibling);
      over.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  }

  /* ════════════════════════════════════════════════════════════
     COLLAPSE — blocs sidebar
     ════════════════════════════════════════════════════════════ */

  function toggleCollapse(blockId) {
    const block = document.getElementById('block-' + blockId);
    if (!block) return;
    block.classList.toggle('collapsed');
  }

  /* ════════════════════════════════════════════════════════════
     DÉLÉGATION D'ÉVÉNEMENTS
     ════════════════════════════════════════════════════════════ */

  function showSaveModal() {
    const cmd = getBuiltText();
    if (!cmd) return;
    const modal   = document.getElementById('pfSaveModal');
    const preview = document.getElementById('pfModalCmdPreview');
    const nameInp = document.getElementById('pfModalName');
    const favChk  = document.getElementById('pfModalFav');
    if (!modal) return;
    if (preview) preview.textContent = cmd;
    if (nameInp) nameInp.value = '';
    if (favChk)  favChk.checked = false;
    modal.hidden = false;
    if (nameInp) nameInp.focus();
  }

  function hideSaveModal() {
    const modal = document.getElementById('pfSaveModal');
    if (modal) modal.hidden = true;
  }

  function confirmSaveModal() {
    const cmd = getBuiltText();
    if (!cmd) { hideSaveModal(); return; }
    const name  = (document.getElementById('pfModalName')?.value || '').trim() || cmd.substring(0, 40);
    const isFav = document.getElementById('pfModalFav')?.checked;
    saveCommand(name, cmd);
    if (isFav) {
      const favs = loadFavorites();
      favs.add(cmd);
      saveFavorites(favs);
    }
    hideSaveModal();
    renderCommandList(document.getElementById('pfCmdSearch')?.value || '');
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('#pfCmdSave'))    { showSaveModal();    return; }
    if (e.target.closest('#pfModalSave'))  { confirmSaveModal(); return; }
    if (e.target.closest('#pfModalClose') || e.target.closest('#pfModalCancel')) { hideSaveModal(); return; }
    /* Clic sur l'overlay hors de la modale */
    if (e.target.id === 'pfSaveModal')     { hideSaveModal();    return; }

    if (e.target.closest('#pfCmdCopy')) {
      const text = getBuiltText();
      if (!text) return;
      copyText(text, null);
      const btn = document.getElementById('pfCmdCopy');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'Copié !';
        setTimeout(function () { btn.textContent = orig; }, 1000);
      }
      return;
    }

    const btn = e.target.closest('button[data-action]');
    if (btn) {
      const action = btn.dataset.action;
      if (action === 'validate')     validateBlock(btn.dataset.block);
      if (action === 'copy-input')   copyInputValue(btn.dataset.target);
      if (action === 'reset-block')  resetBlock(btn.dataset.block);
      if (action === 'reset-all')    resetAll();
      if (action === 'reset-config') resetBlocksConfig();
      if (action === 'delete-block') deleteBlock(btn.dataset.block);
      if (action === 'add-block') {
        const inp = document.getElementById('pfAddBlockInput');
        if (inp) { addBlock(inp.value); inp.value = ''; inp.focus(); }
      }
      return;
    }

    const header = e.target.closest('.pf-block-header[data-toggle]');
    if (header && !e.target.closest('.pf-drag-handle')) {
      toggleCollapse(header.dataset.toggle);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    const input = e.target.closest('.pf-input');
    if (input) {
      e.preventDefault();
      validateBlock(input.id.replace('input-', ''));
      return;
    }
    if (e.target.id === 'pfAddBlockInput') {
      e.preventDefault();
      addBlock(e.target.value);
      e.target.value = '';
      return;
    }
    if (e.target.id === 'pfModalName') {
      e.preventDefault();
      confirmSaveModal();
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'pfCmdSearch') { renderCommandList(e.target.value); return; }
    if (e.target.id === 'pfCmdBuilt')  { autoConvertParams(); }
  });

  /* ════════════════════════════════════════════════════════════
     INIT
     ════════════════════════════════════════════════════════════ */
  renderSidebar();
  renderCommandList();
  initDragDrop();

})();
