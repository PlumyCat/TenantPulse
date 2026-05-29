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
  const CUSTOM_KEY         = 'psforge_custom_cmds_v1';
  const OVERRIDES_KEY      = 'psforge_overrides_v1';
  const GROUPS_KEY         = 'psforge_custom_groups_v1';
  const GROUP_OVERRIDES_KEY= 'psforge_group_overrides_v1';

  /* Groupes intégrés par section */
  const BUILTIN_GROUPS = {
    windows:      ['Intégrité système','Réseau','Services & Processus','Nettoyage & Espace disque','Sécurité locale','Windows Update'],
    microsoft365: ['Utilisateur','Exchange Online','MFA / Sécurité','Licences','Groupes','Appareils — Intune','Teams'],
  };

  function loadCustomGroups()  { try { return JSON.parse(localStorage.getItem(GROUPS_KEY) || '[]'); } catch { return []; } }
  function saveCustomGroups(a) { try { localStorage.setItem(GROUPS_KEY, JSON.stringify(a)); } catch {} }
  function addCustomGroup(section, name) {
    const list = loadCustomGroups();
    if (list.some(function(g){ return g.section === section && g.name === name; })) return false;
    list.push({ id: Date.now(), name: name, section: section });
    saveCustomGroups(list);
    return true;
  }
  function deleteCustomGroup(id) {
    saveCustomGroups(loadCustomGroups().filter(function(g){ return g.id !== id; }));
  }
  function renameCustomGroup(id, newName) {
    saveCustomGroups(loadCustomGroups().map(function(g){
      return g.id === id ? Object.assign({}, g, { name: newName }) : g;
    }));
  }

  function loadGroupOverrides()       { try { return JSON.parse(localStorage.getItem(GROUP_OVERRIDES_KEY) || '{}'); } catch { return {}; } }
  function saveGroupOverrides(obj)    { try { localStorage.setItem(GROUP_OVERRIDES_KEY, JSON.stringify(obj)); } catch {} }
  function setGroupOverride(orig, n)  { const o = loadGroupOverrides(); o[orig] = n; saveGroupOverrides(o); }
  function clearGroupOverride(orig)   { const o = loadGroupOverrides(); delete o[orig]; saveGroupOverrides(o); }
  function getGroupDisplayName(name)  { return loadGroupOverrides()[name] || name; }

  /* Retourne la liste des groupes disponibles pour une section (mine/windows/microsoft365) */
  function getGroupsForSection(section) {
    const overrides = loadGroupOverrides();
    const builtins  = (BUILTIN_GROUPS[section] || []).map(function(name){
      return { name: name, display: overrides[name] || name, isBuiltin: true };
    });
    const custom = loadCustomGroups()
      .filter(function(g){ return g.section === section; })
      .map(function(g){ return { name: g.name, display: g.name, isBuiltin: false, id: g.id }; });
    return builtins.concat(custom);
  }

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

  /* ── Commandes personnalisées ── */
  function loadCustomCmds() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); }
    catch { return []; }
  }
  function saveCustomCmds(arr) {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(arr)); } catch {}
  }
  function upsertCustomCmd(entry) {
    const arr = loadCustomCmds();
    const idx = arr.findIndex(function (e) { return e.id === entry.id; });
    if (idx !== -1) { arr[idx] = entry; } else { arr.unshift(entry); }
    saveCustomCmds(arr.slice(0, 200));
  }
  function deleteCustomCmd(id) {
    saveCustomCmds(loadCustomCmds().filter(function (e) { return e.id !== id; }));
  }
  function getDescForCmd(cmdText) {
    const ov = getOverride(cmdText);
    if (ov && ov.desc) return ov.desc;
    const found = loadCustomCmds().find(function (e) { return e.cmd === cmdText; });
    return (found && found.desc) ? found.desc : null;
  }

  /* ── Overrides (modification de commandes intégrées) ── */
  function loadOverrides() {
    try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveOverrides(obj) {
    try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(obj)); } catch {}
  }
  function getOverride(originalCmd) {
    return loadOverrides()[originalCmd] || null;
  }
  function setOverride(originalCmd, data) {
    const obj = loadOverrides();
    obj[originalCmd] = data;
    saveOverrides(obj);
  }
  function clearOverride(originalCmd) {
    const obj = loadOverrides();
    delete obj[originalCmd];
    saveOverrides(obj);
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
  let currentCmdDesc  = null;

  function setDescBar(desc) {
    currentCmdDesc = desc || null;
    [
      { bar: 'pfDescBar',       content: 'pfDescContent'       },
      { bar: 'pfScriptDescBar', content: 'pfScriptDescContent' },
    ].forEach(function (ids) {
      const bar     = document.getElementById(ids.bar);
      const content = document.getElementById(ids.content);
      if (!bar) return;
      if (desc) {
        bar.hidden = false;
      } else {
        bar.hidden = true;
        if (content) content.hidden = true;
      }
    });
  }

  function toggleDescContent(contentId) {
    const el = document.getElementById(contentId);
    if (!el) return;
    if (el.hidden) {
      el.textContent = currentCmdDesc || '';
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

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

  /* Surveille la frappe et convertit <mot> en tag interactif (div quelconque) */
  function autoConvertParams(div) {
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

  /* Insère un tag <paramKey> à la position du curseur dans un éditeur donné */
  function insertParamInEditor(editorId, paramKey) {
    const div = document.getElementById(editorId);
    if (!div) return;

    const hint = div.querySelector('.pf-cmd-hint');
    if (hint) { div.replaceChildren(); if (editorId === 'pfCmdBuilt') selectedTemplate = null; }

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

    /* Auto-injection si exactement une bulle existe */
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

  function insertParamAtCursor(paramKey) { insertParamInEditor('pfCmdBuilt', paramKey); }

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

  /* Charge un texte dans le builder.
     Si le texte est multi-ligne → bascule vers le Script Builder. */
  function loadCommandText(cmdText) {
    if (cmdText.indexOf('\n') !== -1) {
      if (!scriptViewActive) showScriptView();
      loadTextIntoEditor('pfScriptEditor', cmdText);
    } else {
      loadTextIntoEditor('pfCmdBuilt', cmdText);
    }
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
     SCRIPT BUILDER — vue éditeur pleine hauteur
     ════════════════════════════════════════════════════════════ */

  let scriptViewActive  = false;
  let savedScriptRange  = null;   /* curseur sauvegardé quand le script editor perd le focus */
  let managerViewActive  = false;
  let managerEditId      = null;  /* null = création, sinon id custom en cours d'édition */
  let managerEditBuiltIn = null;  /* null = custom, sinon cmd originale d'une commande intégrée */
  let managerFilter      = '';    /* filtre interne au panneau gestionnaire */

  /* ── Gestionnaire de commandes ── */

  /* Peuple le champ sous-catégorie selon la section choisie */
  function renderSubcatField(section, preselect) {
    const field   = document.getElementById('pfMgrSubcatField');
    const catsEl  = document.getElementById('pfMgrSubcats');
    const newRow  = document.getElementById('pfMgrNewGroupRow');
    if (!field || !catsEl) return;

    const needsSub = (section === 'windows' || section === 'microsoft365');
    field.hidden = !needsSub;
    if (!needsSub) return;

    newRow.hidden = true;
    catsEl.replaceChildren();

    getGroupsForSection(section).forEach(function(g) {
      const lbl = document.createElement('label');
      lbl.className = 'pf-manager-cat-opt';
      const radio = document.createElement('input');
      radio.type  = 'radio';
      radio.name  = 'pfMgrSubcat';
      radio.value = g.name;
      if (preselect && preselect === g.name) radio.checked = true;
      const span = document.createElement('span');
      span.textContent = g.display + (g.isBuiltin ? '' : ' ✦');
      lbl.appendChild(radio);
      lbl.appendChild(span);
      radio.addEventListener('change', function() { if (newRow) newRow.hidden = true; });
      catsEl.appendChild(lbl);
    });

    /* Option "Nouveau groupe" */
    const newLbl  = document.createElement('label');
    newLbl.className = 'pf-manager-cat-opt pf-manager-cat-opt--new';
    const newRadio = document.createElement('input');
    newRadio.type  = 'radio';
    newRadio.name  = 'pfMgrSubcat';
    newRadio.value = '##new##';
    const newSpan  = document.createElement('span');
    newSpan.textContent = '✚ Nouveau groupe';
    newLbl.appendChild(newRadio);
    newLbl.appendChild(newSpan);
    newRadio.addEventListener('change', function() {
      if (newRow) {
        newRow.hidden = false;
        document.getElementById('pfMgrNewGroupInput')?.focus();
      }
    });
    catsEl.appendChild(newLbl);
  }

  function showManagerView() {
    document.getElementById('pfCmdView').hidden    = true;
    document.getElementById('pfScriptView').hidden = true;
    document.getElementById('pfManagerView').hidden = false;
    document.getElementById('pfSearchBar').classList.add('pf-search-bar--manager');
    document.getElementById('pfManagerToggle').classList.add('active');
    document.getElementById('pfScriptToggle').classList.remove('active');
    managerViewActive = true;
    scriptViewActive  = false;
    managerFilter     = '';
    const mSearch = document.getElementById('pfManagerSearch');
    if (mSearch) mSearch.value = '';
    hideManagerForm();
    renderManagerList();
  }

  function hideManagerView() {
    document.getElementById('pfManagerView').hidden = true;
    document.getElementById('pfCmdView').hidden     = false;
    document.getElementById('pfSearchBar').classList.remove('pf-search-bar--manager');
    document.getElementById('pfManagerToggle').classList.remove('active');
    managerViewActive = false;
    renderCommandList(document.getElementById('pfCmdSearch')?.value || '');
  }

  function showManagerForm(editEntry, builtInOriginalCmd) {
    managerEditId      = editEntry           ? editEntry.id : null;
    managerEditBuiltIn = builtInOriginalCmd  || null;

    let preTitle = '', preCmd = '', preDesc = '', preCat = 'mine';

    if (editEntry) {
      preTitle = editEntry.title    || '';
      preCmd   = editEntry.cmd;
      preDesc  = editEntry.desc     || '';
      preCat   = editEntry.category || 'mine';
    } else if (builtInOriginalCmd) {
      const ov = getOverride(builtInOriginalCmd);
      preTitle = ov ? (ov.title || '') : '';
      preCmd   = ov ? ov.cmd          : builtInOriginalCmd;
      preDesc  = ov ? (ov.desc  || '') : '';
    }

    document.getElementById('pfMgrTitle').value = preTitle;
    document.getElementById('pfMgrCmd').value   = preCmd;
    document.getElementById('pfMgrDesc').value  = preDesc;

    /* Contexte built-in : affiche la commande originale en référence */
    const ctx     = document.getElementById('pfMgrBuiltinCtx');
    const origEl  = document.getElementById('pfMgrBuiltinOrig');
    if (ctx && origEl) {
      ctx.hidden       = !builtInOriginalCmd;
      origEl.textContent = builtInOriginalCmd || '';
    }

    /* Masque la catégorie pour les built-ins (hors de propos) */
    const catField = document.querySelector('.pf-manager-cats')?.closest('.pf-manager-field');
    if (catField) catField.hidden = !!builtInOriginalCmd;

    if (!builtInOriginalCmd) {
      const radio = document.querySelector('input[name="pfMgrCat"][value="' + preCat + '"]');
      if (radio) radio.checked = true;
      renderSubcatField(preCat, editEntry ? editEntry.group : null);
    } else {
      /* Masque aussi le champ sous-catégorie pour les built-ins */
      const subField = document.getElementById('pfMgrSubcatField');
      if (subField) subField.hidden = true;
    }

    document.getElementById('pfManagerForm').hidden = false;
    document.getElementById('pfMgrTitle').focus();
  }

  function hideManagerForm() {
    document.getElementById('pfManagerForm').hidden = true;
    managerEditId = null;
  }

  function submitManagerForm() {
    const cmdVal = document.getElementById('pfMgrCmd').value.trim();
    if (!cmdVal) {
      const inp = document.getElementById('pfMgrCmd');
      inp.style.transition = 'box-shadow .08s';
      inp.style.boxShadow  = '0 0 0 3px rgba(220,38,38,.35)';
      setTimeout(function () { inp.style.boxShadow = ''; }, 600);
      return;
    }

    if (managerEditBuiltIn) {
      setOverride(managerEditBuiltIn, {
        title: document.getElementById('pfMgrTitle').value.trim(),
        cmd:   cmdVal,
        desc:  document.getElementById('pfMgrDesc').value.trim(),
      });
    } else {
      const catEl    = document.querySelector('input[name="pfMgrCat"]:checked');
      const category = catEl ? catEl.value : 'mine';

      /* Validation sous-catégorie obligatoire pour Windows et M365 */
      let group = null;
      if (category === 'windows' || category === 'microsoft365') {
        const subcatEl = document.querySelector('input[name="pfMgrSubcat"]:checked');
        if (!subcatEl) {
          const field = document.getElementById('pfMgrSubcatField');
          if (field) {
            field.style.transition = 'box-shadow .08s';
            field.style.boxShadow  = '0 0 0 2px rgba(220,38,38,.4)';
            setTimeout(function(){ field.style.boxShadow = ''; }, 700);
          }
          return;
        }
        if (subcatEl.value === '##new##') {
          const newName = (document.getElementById('pfMgrNewGroupInput')?.value || '').trim();
          if (!newName) {
            const inp = document.getElementById('pfMgrNewGroupInput');
            if (inp) {
              inp.style.transition = 'box-shadow .08s';
              inp.style.boxShadow  = '0 0 0 3px rgba(220,38,38,.35)';
              setTimeout(function(){ inp.style.boxShadow = ''; }, 600);
              inp.focus();
            }
            return;
          }
          addCustomGroup(category, newName);
          group = newName;
        } else {
          group = subcatEl.value;
        }
      }

      upsertCustomCmd({
        id:       managerEditId || Date.now(),
        title:    document.getElementById('pfMgrTitle').value.trim(),
        cmd:      cmdVal,
        desc:     document.getElementById('pfMgrDesc').value.trim(),
        category: category,
        group:    group,
      });
    }

    hideManagerForm();
    renderManagerList(managerFilter);
    renderCommandList(document.getElementById('pfCmdSearch')?.value || '');
  }

  function buildCustomCmdItemDom(entry) {
    const wrap = document.createElement('div');
    wrap.className = 'pf-cmd-item-wrap';

    const btn = document.createElement('button');
    btn.className = 'pf-cmd-item';
    btn.type      = 'button';
    btn.title     = entry.cmd;

    if (entry.title) {
      btn.textContent = entry.title;
    } else {
      entry.cmd.split(/(<[a-zA-Z]+>)/).forEach(function (part) {
        if (/^<[a-zA-Z]+>$/.test(part)) {
          const sp = document.createElement('span');
          sp.className = 'pf-cmd-param';
          sp.textContent = part;
          btn.appendChild(sp);
        } else if (part) {
          btn.appendChild(document.createTextNode(part));
        }
      });
    }

    btn.addEventListener('click', function () {
      document.querySelectorAll('.pf-cmd-item-wrap.selected').forEach(function (el) { el.classList.remove('selected'); });
      wrap.classList.add('selected');
      selectedTemplate = null;
      loadCommandText(entry.cmd);
      setDescBar(entry.desc || null);
    });

    const badge = document.createElement('span');
    badge.className = 'pf-custom-badge';
    badge.title     = 'Commande personnalisée';
    badge.textContent = '✦';

    const del = document.createElement('button');
    del.className = 'pf-saved-del';
    del.type      = 'button';
    del.title     = 'Supprimer';
    del.textContent = '✕';
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteCustomCmd(entry.id);
      renderCommandList(document.getElementById('pfCmdSearch')?.value || '');
    });

    wrap.appendChild(btn);
    wrap.appendChild(badge);
    wrap.appendChild(del);
    return wrap;
  }

  function renderManagerList(filter) {
    managerFilter = (filter || '').toLowerCase().trim();
    const list    = document.getElementById('pfManagerList');
    if (!list) return;
    list.replaceChildren();

    const q          = managerFilter;
    const all        = loadCustomCmds();
    const overrides  = loadOverrides();
    const hasContent = { custom: false, builtin: false };

    /* ── Section : commandes personnalisées ── */
    const groupOrder  = ['mine', 'windows', 'microsoft365', 'favorites'];
    const groupLabels = { mine: 'Mes commandes', windows: 'Système Windows', microsoft365: 'Microsoft 365', favorites: '★ Favoris' };
    const groups      = { mine: [], windows: [], microsoft365: [], favorites: [] };

    all.forEach(function (e) {
      if (q && (e.title || '').toLowerCase().indexOf(q) === -1 &&
               e.cmd.toLowerCase().indexOf(q)           === -1 &&
               (e.desc || '').toLowerCase().indexOf(q)  === -1) return;
      (groups[e.category || 'mine'] || groups.mine).push(e);
    });

    groupOrder.forEach(function (cat) {
      const items = groups[cat];
      if (!items.length) return;
      hasContent.custom = true;

      const section = document.createElement('div');
      section.className = 'pf-manager-section';

      const heading = document.createElement('div');
      heading.className   = 'pf-manager-section-heading';
      heading.textContent = groupLabels[cat];
      section.appendChild(heading);

      items.forEach(function (entry) {
        section.appendChild(buildManagerCustomRow(entry));
      });
      list.appendChild(section);
    });

    /* ── Section : commandes intégrées ── */
    const sectionMap   = {};
    const sectionOrder = [];

    PF_COMMANDS.forEach(function (entry) {
      if (q && entry.cmd.toLowerCase().indexOf(q) === -1 &&
               entry.g.toLowerCase().indexOf(q)   === -1 &&
               entry.s.toLowerCase().indexOf(q)   === -1 &&
               (overrides[entry.cmd] ? (
                 (overrides[entry.cmd].title || '').toLowerCase().indexOf(q) === -1 &&
                 (overrides[entry.cmd].cmd   || '').toLowerCase().indexOf(q) === -1 &&
                 (overrides[entry.cmd].desc  || '').toLowerCase().indexOf(q) === -1
               ) : true)) return;
      if (!sectionMap[entry.s]) { sectionMap[entry.s] = {}; sectionOrder.push(entry.s); }
      if (!sectionMap[entry.s][entry.g]) sectionMap[entry.s][entry.g] = [];
      sectionMap[entry.s][entry.g].push(entry.cmd);
    });

    sectionOrder.forEach(function (sName) {
      hasContent.builtin = true;
      const groups = sectionMap[sName];
      const totalCount = Object.values(groups).reduce(function (n, a) { return n + a.length; }, 0);

      const section = document.createElement('div');
      section.className = 'pf-manager-builtin-section collapsed'; /* collapsed par défaut */

      const heading = document.createElement('div');
      heading.className = 'pf-manager-builtin-heading';
      heading.addEventListener('click', function () { section.classList.toggle('collapsed'); });

      const titleSpan = document.createElement('span');
      titleSpan.textContent = sName;

      const countBadge = document.createElement('span');
      countBadge.className   = 'pf-manager-builtin-count';
      countBadge.textContent = totalCount;

      const arrow = document.createElement('span');
      arrow.className   = 'pf-manager-builtin-arrow';
      arrow.textContent = '▾';

      heading.appendChild(titleSpan);
      heading.appendChild(countBadge);
      heading.appendChild(arrow);

      const body = document.createElement('div');
      body.className = 'pf-manager-builtin-body';

      Object.keys(groups).forEach(function (gName) {
        const grpHeading = document.createElement('div');
        grpHeading.className   = 'pf-manager-builtin-group-heading';
        grpHeading.textContent = gName;
        body.appendChild(grpHeading);

        groups[gName].forEach(function (originalCmd) {
          body.appendChild(buildManagerBuiltinRow(originalCmd, overrides[originalCmd] || null));
        });
      });

      section.appendChild(heading);
      section.appendChild(body);

      /* Auto-déplie si le filtre fait une correspondance */
      if (q) section.classList.remove('collapsed');

      list.appendChild(section);
    });

    /* ── Section gestion des groupes ── */
    if (!q) {
      ['windows','microsoft365'].forEach(function(section) {
        const sLabel = section === 'windows' ? 'Système Windows' : 'Microsoft 365';
        const groups = getGroupsForSection(section);
        const overrides = loadGroupOverrides();

        const sec = document.createElement('div');
        sec.className = 'pf-manager-groups-section collapsed';

        const hd = document.createElement('div');
        hd.className = 'pf-manager-groups-heading';
        hd.addEventListener('click', function(){ sec.classList.toggle('collapsed'); });
        const hdTitle = document.createElement('span');
        hdTitle.textContent = 'Groupes — ' + sLabel;
        const hdArrow = document.createElement('span');
        hdArrow.className = 'pf-manager-builtin-arrow';
        hdArrow.textContent = '▾';
        const hdSp = document.createElement('span');
        hdSp.style.flex = '1';
        hd.appendChild(hdTitle);
        hd.appendChild(hdSp);
        hd.appendChild(hdArrow);

        const body = document.createElement('div');
        body.className = 'pf-manager-groups-body';

        /* Ligne par groupe */
        groups.forEach(function(g) {
          const row = document.createElement('div');
          row.className = 'pf-manager-group-row';

          const nameSpan = document.createElement('span');
          nameSpan.className = 'pf-manager-group-name' +
            (g.isBuiltin ? ' is-builtin' : '') +
            (!g.isBuiltin ? '' : (overrides[g.name] ? ' is-overridden' : ''));
          nameSpan.textContent = g.display;

          const editRow = document.createElement('div');
          editRow.className = 'pf-manager-group-edit-row';
          editRow.hidden = true;
          const inp = document.createElement('input');
          inp.className = 'pf-manager-group-input';
          inp.type = 'text'; inp.value = g.display; inp.maxLength = 40;
          const saveBtn = document.createElement('button');
          saveBtn.className = 'pf-manager-group-save';
          saveBtn.type = 'button'; saveBtn.textContent = 'OK';
          editRow.appendChild(inp);
          editRow.appendChild(saveBtn);

          const editBtn = document.createElement('button');
          editBtn.className = 'pf-manager-item-edit';
          editBtn.type = 'button'; editBtn.title = 'Renommer'; editBtn.textContent = '✏';
          editBtn.addEventListener('click', function(){
            nameSpan.hidden = true; editRow.hidden = false; editBtn.hidden = true;
            inp.focus(); inp.select();
          });

          function applyRename() {
            const v = inp.value.trim();
            if (!v) return;
            if (g.isBuiltin) {
              if (v === g.name) clearGroupOverride(g.name);
              else setGroupOverride(g.name, v);
            } else {
              renameCustomGroup(g.id, v);
            }
            renderManagerList(managerFilter);
            renderCommandList(document.getElementById('pfCmdSearch')?.value || '');
          }
          saveBtn.addEventListener('click', applyRename);
          inp.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); applyRename(); } });

          const actions = document.createElement('div');
          actions.className = 'pf-manager-item-actions';
          actions.appendChild(editBtn);

          /* Bouton reset override (groupes intégrés renommés) */
          if (g.isBuiltin && overrides[g.name]) {
            const rstBtn = document.createElement('button');
            rstBtn.className = 'pf-manager-item-reset';
            rstBtn.type = 'button'; rstBtn.title = 'Restaurer le nom original'; rstBtn.textContent = '↺';
            rstBtn.addEventListener('click', function(){
              clearGroupOverride(g.name);
              renderManagerList(managerFilter);
              renderCommandList(document.getElementById('pfCmdSearch')?.value || '');
            });
            actions.appendChild(rstBtn);
          }

          /* Bouton supprimer (groupes custom uniquement) */
          if (!g.isBuiltin) {
            const delBtn = document.createElement('button');
            delBtn.className = 'pf-saved-del';
            delBtn.type = 'button'; delBtn.title = 'Supprimer'; delBtn.textContent = '✕';
            delBtn.addEventListener('click', function(){
              deleteCustomGroup(g.id);
              renderManagerList(managerFilter);
            });
            actions.appendChild(delBtn);
          }

          row.appendChild(nameSpan);
          row.appendChild(editRow);
          row.appendChild(actions);
          body.appendChild(row);
        });

        /* Ajouter un groupe */
        const addRow = document.createElement('div');
        addRow.className = 'pf-manager-groups-add';
        const addInp = document.createElement('input');
        addInp.className = 'pf-manager-groups-add-input';
        addInp.type = 'text'; addInp.placeholder = 'Nouveau groupe…'; addInp.maxLength = 40;
        const addBtn = document.createElement('button');
        addBtn.className = 'pf-manager-groups-add-btn';
        addBtn.type = 'button'; addBtn.textContent = '+ Ajouter';
        const doAdd = function(){
          const v = addInp.value.trim();
          if (!v) return;
          addCustomGroup(section, v);
          addInp.value = '';
          renderManagerList(managerFilter);
        };
        addBtn.addEventListener('click', doAdd);
        addInp.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); doAdd(); } });
        addRow.appendChild(addInp);
        addRow.appendChild(addBtn);
        body.appendChild(addRow);

        sec.appendChild(hd);
        sec.appendChild(body);
        list.appendChild(sec);
      });
    }

    /* Message vide si rien du tout */
    if (!hasContent.custom && !hasContent.builtin) {
      const empty = document.createElement('div');
      empty.className   = 'pf-manager-empty';
      empty.textContent = q ? 'Aucune commande ne correspond à "' + filter + '".'
                            : 'Aucune commande personnalisée. Cliquez sur "+ Nouvelle commande" pour commencer.';
      list.appendChild(empty);
    }
  }

  function buildManagerCustomRow(entry) {
    const row = document.createElement('div');
    row.className = 'pf-manager-item';

    const info = document.createElement('div');
    info.className = 'pf-manager-item-info';

    const titleEl = document.createElement('div');
    titleEl.className   = 'pf-manager-item-title';
    titleEl.textContent = entry.title || entry.cmd;
    info.appendChild(titleEl);

    if (entry.title) {
      const cmdEl = document.createElement('div');
      cmdEl.className = 'pf-manager-item-cmd';
      entry.cmd.split(/(<[a-zA-Z]+>)/).forEach(function (part) {
        if (/^<[a-zA-Z]+>$/.test(part)) {
          const sp = document.createElement('span');
          sp.className = 'pf-cmd-param'; sp.textContent = part;
          cmdEl.appendChild(sp);
        } else if (part) { cmdEl.appendChild(document.createTextNode(part)); }
      });
      info.appendChild(cmdEl);
    }
    if (entry.desc) {
      const descEl = document.createElement('div');
      descEl.className = 'pf-manager-item-desc'; descEl.textContent = entry.desc;
      info.appendChild(descEl);
    }

    const actions = document.createElement('div');
    actions.className = 'pf-manager-item-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'pf-manager-item-edit'; editBtn.type = 'button';
    editBtn.title = 'Modifier'; editBtn.textContent = '✏';
    editBtn.addEventListener('click', function () { showManagerForm(entry); });

    const delBtn = document.createElement('button');
    delBtn.className = 'pf-saved-del'; delBtn.type = 'button';
    delBtn.title = 'Supprimer'; delBtn.textContent = '✕';
    delBtn.addEventListener('click', function () {
      deleteCustomCmd(entry.id);
      renderManagerList(managerFilter);
      renderCommandList(document.getElementById('pfCmdSearch')?.value || '');
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    row.appendChild(info);
    row.appendChild(actions);
    return row;
  }

  function buildManagerBuiltinRow(originalCmd, ov) {
    const row = document.createElement('div');
    row.className = 'pf-manager-item pf-manager-item--builtin' + (ov ? ' is-overridden' : '');

    const info = document.createElement('div');
    info.className = 'pf-manager-item-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'pf-manager-item-title';

    if (ov && ov.title) {
      titleEl.textContent = ov.title;
      const sub = document.createElement('div');
      sub.className = 'pf-manager-item-cmd';
      sub.textContent = ov.cmd || originalCmd;
      info.appendChild(titleEl);
      info.appendChild(sub);
    } else if (ov && ov.cmd !== originalCmd) {
      titleEl.textContent = ov.cmd;
      const sub = document.createElement('div');
      sub.className = 'pf-manager-item-cmd';
      sub.style.textDecoration = 'line-through';
      sub.style.opacity = '.45';
      sub.textContent = originalCmd;
      info.appendChild(titleEl);
      info.appendChild(sub);
    } else {
      /* Rendu avec params colorés */
      originalCmd.split(/(<[a-zA-Z]+>)/).forEach(function (part) {
        if (/^<[a-zA-Z]+>$/.test(part)) {
          const sp = document.createElement('span');
          sp.className = 'pf-cmd-param'; sp.textContent = part;
          titleEl.appendChild(sp);
        } else if (part) { titleEl.appendChild(document.createTextNode(part)); }
      });
      info.appendChild(titleEl);
    }

    if (ov && ov.desc) {
      const descEl = document.createElement('div');
      descEl.className = 'pf-manager-item-desc'; descEl.textContent = ov.desc;
      info.appendChild(descEl);
    }

    const actions = document.createElement('div');
    actions.className = 'pf-manager-item-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'pf-manager-item-edit'; editBtn.type = 'button';
    editBtn.title = 'Modifier'; editBtn.textContent = '✏';
    editBtn.addEventListener('click', function () { showManagerForm(null, originalCmd); });
    actions.appendChild(editBtn);

    if (ov) {
      const resetBtn = document.createElement('button');
      resetBtn.className = 'pf-manager-item-reset'; resetBtn.type = 'button';
      resetBtn.title = 'Restaurer la commande originale'; resetBtn.textContent = '↺';
      resetBtn.addEventListener('click', function () {
        clearOverride(originalCmd);
        renderManagerList(managerFilter);
        renderCommandList(document.getElementById('pfCmdSearch')?.value || '');
      });
      actions.appendChild(resetBtn);
    }

    row.appendChild(info);
    row.appendChild(actions);
    return row;
  }

  function renderScriptChips() {
    const bar = document.getElementById('pfScriptChipsBar');
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
      chip.title = 'Insérer <' + cfg.id + '>';
      chip.textContent = '<' + cfg.id + '>';
      chip.addEventListener('click', function () { insertParamInEditor('pfScriptEditor', cfg.id); });
      bar.appendChild(chip);
    });
  }

  function getScriptText() {
    const div = document.getElementById('pfScriptEditor');
    if (!div) return '';
    /* innerText respecte les sauts de ligne visuels créés par les <br> et les <div>
       contrairement à textContent qui les écrase. */
    const text = div.innerText || div.textContent || '';
    /* innerText ajoute un \n final superflu sur Chrome — on le retire */
    return text.replace(/\n$/, '');
  }

  /* Charge un texte multi-ligne (scripts sauvegardés) dans un éditeur contenteditable.
     Chaque \n devient un <br> ; les <param> deviennent des tags interactifs. */
  function loadTextIntoEditor(editorId, text) {
    const div = document.getElementById(editorId);
    if (!div) return;
    activeParamTag  = null;
    if (editorId === 'pfCmdBuilt') selectedTemplate = null;
    div.replaceChildren();
    const lines = text.split('\n');
    lines.forEach(function(line, lineIdx) {
      if (lineIdx > 0) div.appendChild(document.createElement('br'));
      line.split(/(<[a-zA-Z]+>)/).forEach(function(part) {
        const m = part.match(/^<([a-zA-Z]+)>$/);
        if (m) { div.appendChild(makeParamTag(part, m[1].toLowerCase())); }
        else if (part) { div.appendChild(document.createTextNode(part)); }
      });
    });
  }

  /* ── Dropdown recherche (Script Builder) ── */

  function hideScriptSearchDropdown() {
    const dd = document.getElementById('pfScriptSearchDropdown');
    if (dd) dd.hidden = true;
  }

  function renderScriptSearchDropdown(filter) {
    const dd = document.getElementById('pfScriptSearchDropdown');
    if (!dd) return;

    const q = (filter || '').toLowerCase().trim();
    if (!q) { hideScriptSearchDropdown(); return; }

    /* Collecte des correspondances dans PF_COMMANDS + sauvegardées */
    const matches = [];

    loadCustomCmds().forEach(function (entry) {
      if ((entry.title || '').toLowerCase().indexOf(q) !== -1 ||
          entry.cmd.toLowerCase().indexOf(q)            !== -1 ||
          (entry.desc  || '').toLowerCase().indexOf(q)  !== -1) {
        matches.push({ label: entry.title || entry.cmd, cmd: entry.cmd, desc: entry.desc || null });
      }
    });

    loadSaved().forEach(function (entry) {
      if (entry.name.toLowerCase().indexOf(q) !== -1 ||
          entry.cmd.toLowerCase().indexOf(q)  !== -1) {
        matches.push({ label: entry.name || entry.cmd, cmd: entry.cmd });
      }
    });

    PF_COMMANDS.forEach(function (entry) {
      if (entry.cmd.toLowerCase().indexOf(q) !== -1 ||
          entry.g.toLowerCase().indexOf(q)   !== -1 ||
          entry.s.toLowerCase().indexOf(q)   !== -1) {
        matches.push({ label: entry.cmd, cmd: entry.cmd });
      }
    });

    dd.replaceChildren();

    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pf-ssd-empty';
      empty.textContent = 'Aucune commande trouvée.';
      dd.appendChild(empty);
      dd.hidden = false;
      return;
    }

    matches.slice(0, 25).forEach(function (item) {
      const row = document.createElement('div');
      row.className = 'pf-ssd-row';

      /* Texte de la commande avec paramètres colorés */
      const cmdEl = document.createElement('span');
      cmdEl.className = 'pf-ssd-cmd';
      item.label.split(/(<[a-zA-Z]+>)/).forEach(function (part) {
        if (/^<[a-zA-Z]+>$/.test(part)) {
          const sp = document.createElement('span');
          sp.className = 'pf-cmd-param';
          sp.textContent = part;
          cmdEl.appendChild(sp);
        } else if (part) {
          cmdEl.appendChild(document.createTextNode(part));
        }
      });

      /* Boutons d'action */
      const actions = document.createElement('div');
      actions.className = 'pf-ssd-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'pf-ssd-copy';
      copyBtn.type = 'button';
      copyBtn.title = 'Copier la commande';
      copyBtn.textContent = 'Copier';
      copyBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        copyText(item.cmd, null);
        copyBtn.textContent = 'Copié !';
        setTimeout(function () { copyBtn.textContent = 'Copier'; }, 1000);
      });

      const injectBtn = document.createElement('button');
      injectBtn.className = 'pf-ssd-inject';
      injectBtn.type = 'button';
      injectBtn.title = 'Injecter dans le script';
      const injectImg = document.createElement('img');
      injectImg.src = '../assets/go.png';
      injectImg.className = 'icon-adaptive';
      injectImg.alt = '→';
      injectBtn.appendChild(injectImg);
      injectBtn.addEventListener('click', function () {
        insertCommandTextIntoScript(item.cmd);
        setDescBar(item.desc || getDescForCmd(item.cmd));
      });

      actions.appendChild(copyBtn);
      actions.appendChild(injectBtn);
      row.appendChild(cmdEl);
      row.appendChild(actions);
      dd.appendChild(row);
    });

    dd.hidden = false;
  }

  /* Insère un texte de commande (avec tags param) au curseur dans le script editor.
     On utilise savedScriptRange pour retrouver la position exacte du curseur
     même après que l'utilisateur a cliqué sur le bouton d'injection (ce qui fait
     perdre le focus à l'éditeur). */
  function insertCommandTextIntoScript(cmdText) {
    const div = document.getElementById('pfScriptEditor');
    if (!div) return;

    const sel = window.getSelection();
    let range;

    /* Restaurer la position sauvegardée (blur de l'éditeur → avant le clic) */
    if (savedScriptRange && div.contains(savedScriptRange.commonAncestorContainer)) {
      range = savedScriptRange.cloneRange();
      savedScriptRange = null;
    }

    div.focus();

    if (range) {
      /* Réactiver la sélection sauvegardée après focus() */
      sel.removeAllRanges();
      sel.addRange(range);
      range = sel.getRangeAt(0);
    } else if (sel && sel.rangeCount > 0 && div.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(div);
      range.collapse(false);
    }

    range.deleteContents();

    /* Détecter si le curseur est dans une ligne vide créée par Entrée.
       Chrome enveloppe chaque nouvelle ligne dans <div><br></div>.
       Après insertion le <br> fantôme reste et ajoute un saut visuel en trop. */
    const insertContainer = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
    const isEmptyLinePlaceholder =
      insertContainer &&
      insertContainer !== div &&
      insertContainer.childNodes.length === 1 &&
      insertContainer.firstChild.nodeName === 'BR';

    /* DocumentFragment pour une insertion atomique (évite les décalages de range) */
    const frag = document.createDocumentFragment();

    cmdText.split(/(<[a-zA-Z]+>)/).forEach(function (part) {
      const m = part.match(/^<([a-zA-Z]+)>$/);
      if (m) { frag.appendChild(makeParamTag(part, m[1].toLowerCase())); }
      else if (part) { frag.appendChild(document.createTextNode(part)); }
    });

    const lastChild = frag.lastChild; /* sauvegarder avant que insertNode consomme le fragment */
    range.insertNode(frag);

    /* Supprimer le <br> placeholder maintenant que la ligne n'est plus vide */
    if (isEmptyLinePlaceholder && insertContainer.lastChild.nodeName === 'BR') {
      insertContainer.removeChild(insertContainer.lastChild);
    }

    if (lastChild) {
      const newRange = document.createRange();
      newRange.setStartAfter(lastChild);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }

    hideScriptSearchDropdown();
  }

  function showScriptView() {
    document.getElementById('pfCmdView').hidden    = true;
    document.getElementById('pfScriptView').hidden = false;
    document.getElementById('pfSearchBar').classList.add('pf-search-bar--script');
    document.getElementById('pfScriptToggle').classList.add('active');
    scriptViewActive = true;
    renderScriptChips();
    /* Si la barre de recherche contient déjà du texte, afficher le dropdown */
    const searchInput = document.getElementById('pfCmdSearch');
    if (searchInput && searchInput.value.trim()) {
      renderScriptSearchDropdown(searchInput.value);
    }
    document.getElementById('pfScriptEditor')?.focus();
  }

  function hideScriptView() {
    document.getElementById('pfScriptView').hidden = true;
    document.getElementById('pfCmdView').hidden    = false;
    document.getElementById('pfSearchBar').classList.remove('pf-search-bar--script');
    document.getElementById('pfScriptToggle').classList.remove('active');
    scriptViewActive = false;
    hideScriptSearchDropdown();
    /* Re-rendre la liste avec l'éventuelle valeur de recherche */
    const searchInput = document.getElementById('pfCmdSearch');
    renderCommandList(searchInput ? searchInput.value : '');
  }

  /* ════════════════════════════════════════════════════════════
     COMMAND LIST — blocs dépliables colonne droite
     ════════════════════════════════════════════════════════════ */

  function buildCmdItemDom(template) {
    const favs = loadFavorites();
    const ov   = getOverride(template);
    const displayCmd = ov ? ov.cmd : template;

    const wrap = document.createElement('div');
    wrap.className = 'pf-cmd-item-wrap';
    if (selectedTemplate === template) wrap.classList.add('selected');

    const btn = document.createElement('button');
    btn.className = 'pf-cmd-item';
    btn.type  = 'button';
    btn.title = displayCmd;

    if (ov && ov.title) {
      btn.textContent = ov.title;
    } else {
      displayCmd.split(/(<[a-zA-Z]+>)/).forEach(function (part) {
        if (/^<[a-zA-Z]+>$/.test(part)) {
          const span = document.createElement('span');
          span.className = 'pf-cmd-param';
          span.textContent = part;
          btn.appendChild(span);
        } else if (part) {
          btn.appendChild(document.createTextNode(part));
        }
      });
    }

    btn.addEventListener('click', function () {
      document.querySelectorAll('.pf-cmd-item-wrap.selected').forEach(function (el) {
        el.classList.remove('selected');
      });
      wrap.classList.add('selected');
      selectedTemplate = ov ? displayCmd : template;
      renderBuiltCommand();
      setDescBar(ov ? (ov.desc || null) : getDescForCmd(template));
    });

    if (ov) {
      const badge = document.createElement('span');
      badge.className   = 'pf-override-badge';
      badge.title       = 'Commande modifiée — voir le Gestionnaire pour restaurer';
      badge.textContent = 'modifié';
      wrap.appendChild(btn);
      wrap.appendChild(badge);
    } else {
      wrap.appendChild(btn);
    }

    const star = document.createElement('button');
    star.className = 'pf-cmd-star' + (favs.has(template) ? ' favorited' : '');
    star.type = 'button';
    star.title = favs.has(template) ? 'Retirer des favoris' : 'Ajouter aux favoris';
    star.textContent = favs.has(template) ? '★' : '☆';
    star.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleFavorite(template);
    });

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

  function makeSavedBlock(savedList, customList) {
    const labelEl = document.createElement('span');
    labelEl.className = 'pf-cg-label';
    const saveIcon = document.createElement('img');
    saveIcon.src = '../assets/save.png';
    saveIcon.className = 'icon-adaptive pf-cg-label-icon';
    saveIcon.alt = '';
    labelEl.appendChild(saveIcon);
    labelEl.appendChild(document.createTextNode(' Mes commandes '));
    const cnt = document.createElement('span');
    cnt.className = 'pf-cg-count';
    cnt.textContent = (savedList ? savedList.length : 0) + (customList ? customList.length : 0);
    labelEl.appendChild(cnt);

    return makeCgBlock(labelEl, function (body) {
      if (customList) customList.forEach(function (entry) { body.appendChild(buildCustomCmdItemDom(entry)); });
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
          setDescBar(null);
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

  function makeFavBlock(visibleFavs, total, customFavs) {
    const labelEl = document.createElement('span');
    labelEl.className = 'pf-cg-label';
    labelEl.appendChild(document.createTextNode('★ Favoris '));
    const cnt = document.createElement('span');
    cnt.className = 'pf-cg-count';
    cnt.textContent = total;
    labelEl.appendChild(cnt);
    labelEl.style.color = '#f59e0b';

    return makeCgBlock(labelEl, function (body) {
      if (customFavs) customFavs.forEach(function (e) { body.appendChild(buildCustomCmdItemDom(e)); });
      visibleFavs.forEach(function (cmd) { body.appendChild(buildCmdItemDom(cmd)); });
    }, 'pf-cg-block--fav', false);
  }

  function renderCommandList(filter) {
    const list = document.getElementById('pfCmdList');
    if (!list) return;
    list.replaceChildren();

    const q      = (filter || '').toLowerCase().trim();
    const favs   = loadFavorites();
    const saved  = loadSaved();
    const custom = loadCustomCmds();

    /* ── Mes commandes : sauvegardées + custom "mine" ── */
    const filteredSaved = saved.filter(function (e) {
      return !q || e.name.toLowerCase().indexOf(q) !== -1 || e.cmd.toLowerCase().indexOf(q) !== -1;
    });
    const customMine = custom.filter(function (e) {
      return (e.category === 'mine' || !e.category) &&
             (!q || (e.title || '').toLowerCase().indexOf(q) !== -1 ||
                    e.cmd.toLowerCase().indexOf(q)           !== -1 ||
                    (e.desc || '').toLowerCase().indexOf(q)  !== -1);
    });
    if (filteredSaved.length > 0 || customMine.length > 0) {
      list.appendChild(makeSavedBlock(filteredSaved, customMine));
    }

    /* ── Favoris : étoilés + custom "favorites" ── */
    const customFav = custom.filter(function (e) {
      return e.category === 'favorites' &&
             (!q || (e.title || '').toLowerCase().indexOf(q) !== -1 ||
                    e.cmd.toLowerCase().indexOf(q)           !== -1 ||
                    (e.desc || '').toLowerCase().indexOf(q)  !== -1);
    });
    const visibleFavs = [...favs].filter(function (cmd) {
      return !q || cmd.toLowerCase().indexOf(q) !== -1;
    });
    if (favs.size > 0 || customFav.length > 0) {
      list.appendChild(makeFavBlock(visibleFavs, favs.size, customFav));
    }

    const sectionMap   = {};
    const sectionOrder = [];

    PF_COMMANDS.forEach(function (entry) {
      if (q &&
          entry.cmd.toLowerCase().indexOf(q) === -1 &&
          entry.g.toLowerCase().indexOf(q)   === -1 &&
          entry.s.toLowerCase().indexOf(q)   === -1) return;

      if (!sectionMap[entry.s]) { sectionMap[entry.s] = {}; sectionOrder.push(entry.s); }
      if (!sectionMap[entry.s][entry.g]) sectionMap[entry.s][entry.g] = [];
      sectionMap[entry.s][entry.g].push({ cmd: entry.cmd });
    });

    /* Injection custom windows / microsoft365 */
    const CAT_SECTION = { windows: 'Système Windows', microsoft365: 'Microsoft 365' };
    custom.forEach(function (entry) {
      const sName = CAT_SECTION[entry.category];
      if (!sName) return;
      if (q &&
          (entry.title || '').toLowerCase().indexOf(q) === -1 &&
          entry.cmd.toLowerCase().indexOf(q)           === -1 &&
          (entry.desc  || '').toLowerCase().indexOf(q) === -1) return;
      if (!sectionMap[sName]) { sectionMap[sName] = {}; sectionOrder.push(sName); }
      const grpKey = entry.group || 'Non classé';
      if (!sectionMap[sName][grpKey]) sectionMap[sName][grpKey] = [];
      sectionMap[sName][grpKey].push({ cmd: entry.cmd, customEntry: entry });
    });

    if (sectionOrder.length === 0 && list.childElementCount === 0) {
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
        lEl.textContent = getGroupDisplayName(gName);
        const cmds = sectionMap[sName][gName];
        const block = makeCgBlock(lEl, function (body) {
          cmds.forEach(function (item) {
            body.appendChild(item.customEntry ? buildCustomCmdItemDom(item.customEntry) : buildCmdItemDom(item.cmd));
          });
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
    if (scriptViewActive) renderScriptChips();
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

    const newCfg = { id: id, label: trimmed, hint: '', placeholder: trimmed, custom: true };
    config.push(newCfg);
    saveBlocksConfig(config);

    /* Ajout ciblé : on insère uniquement le nouveau bloc sans reconstruire toute la liste
       (évite de perdre les valeurs saisies dans les autres inputs) */
    const list = document.getElementById('pfBlocksList');
    if (list) list.appendChild(createBlockDom(newCfg));
    renderParamChips();
    if (scriptViewActive) renderScriptChips();
  }

  function deleteBlock(blockId) {
    const config = loadBlocksConfig().filter(function (c) { return c.id !== blockId; });
    saveBlocksConfig(config);
    /* Suppression ciblée : retire uniquement ce bloc du DOM */
    const blockEl = document.getElementById('block-' + blockId);
    if (blockEl) blockEl.remove();
    renderParamChips();
    if (scriptViewActive) renderScriptChips();
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
    const willOpen = block.classList.contains('collapsed');
    /* Accordéon : si on va ouvrir ce bloc, refermer tous les autres */
    if (willOpen) {
      document.querySelectorAll('#pfBlocksList .pf-block').forEach(function (b) {
        if (b !== block) b.classList.add('collapsed');
      });
    }
    block.classList.toggle('collapsed');
  }

  /* ════════════════════════════════════════════════════════════
     DÉLÉGATION D'ÉVÉNEMENTS
     ════════════════════════════════════════════════════════════ */

  function showSaveModal() {
    const cmd = scriptViewActive ? getScriptText() : getBuiltText();
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
    const cmd = scriptViewActive ? getScriptText() : getBuiltText();
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
    /* Ferme le dropdown si on clique en dehors de lui et de la barre de recherche */
    if (scriptViewActive &&
        !e.target.closest('#pfScriptSearchDropdown') &&
        !e.target.closest('#pfCmdSearch')) {
      hideScriptSearchDropdown();
    }

    /* Gestionnaire de commandes */
    if (e.target.closest('#pfManagerToggle')) {
      managerViewActive ? hideManagerView() : showManagerView();
      return;
    }
    if (e.target.closest('#pfManagerBack'))   { hideManagerView();  return; }
    if (e.target.closest('#pfManagerAdd'))    { showManagerForm();  return; }
    if (e.target.closest('#pfMgrCancel'))     { hideManagerForm();  return; }
    if (e.target.closest('#pfMgrSave'))       { submitManagerForm(); return; }

    /* Description */
    if (e.target.closest('#pfDescToggle'))       { toggleDescContent('pfDescContent');       return; }
    if (e.target.closest('#pfScriptDescToggle')) { toggleDescContent('pfScriptDescContent'); return; }

    /* Script Builder — bascule */
    if (e.target.closest('#pfScriptToggle')) {
      if (managerViewActive) hideManagerView();
      scriptViewActive ? hideScriptView() : showScriptView();
      return;
    }
    if (e.target.closest('#pfScriptBack'))  { hideScriptView(); return; }

    /* Script Builder — actions */
    if (e.target.closest('#pfScriptClear')) {
      const ed = document.getElementById('pfScriptEditor');
      if (ed) ed.replaceChildren();
      return;
    }
    if (e.target.closest('#pfScriptCopy')) {
      const text = getScriptText();
      if (!text) return;
      copyText(text, null);
      const btn = document.getElementById('pfScriptCopy');
      if (btn) { const o = btn.textContent; btn.textContent = 'Copié !'; setTimeout(function () { btn.textContent = o; }, 1000); }
      return;
    }
    if (e.target.closest('#pfScriptSave')) { showSaveModal(); return; }

    /* Modale sauvegarde */
    if (e.target.closest('#pfCmdSave'))    { showSaveModal();    return; }
    if (e.target.closest('#pfModalSave'))  { confirmSaveModal(); return; }
    if (e.target.closest('#pfModalClose') || e.target.closest('#pfModalCancel')) { hideSaveModal(); return; }
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
    if (e.target.id === 'pfMgrTitle' || e.target.id === 'pfMgrCmd') {
      e.preventDefault();
      submitManagerForm();
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'pfCmdSearch') {
      if (scriptViewActive) { renderScriptSearchDropdown(e.target.value); }
      else                  { renderCommandList(e.target.value); }
      return;
    }
    if (e.target.id === 'pfManagerSearch') { renderManagerList(e.target.value); return; }
    if (e.target.id === 'pfCmdBuilt')    { autoConvertParams(e.target); return; }
    if (e.target.id === 'pfScriptEditor'){ autoConvertParams(e.target); }
  });

  /* Sauvegarde la position du curseur dès que le script editor perd le focus
     (le clic sur le bouton "injecter" déplace le focus avant que l'action s'exécute) */
  document.addEventListener('change', function (e) {
    if (e.target.name === 'pfMgrCat') {
      renderSubcatField(e.target.value);
    }
  });

  document.addEventListener('focusout', function (e) {
    if (e.target.id !== 'pfScriptEditor') return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r   = sel.getRangeAt(0);
    const div = document.getElementById('pfScriptEditor');
    if (div && div.contains(r.commonAncestorContainer)) {
      savedScriptRange = r.cloneRange();
    }
  });

  /* Ré-affiche le dropdown si l'utilisateur refocuse la barre de recherche en mode script */
  document.addEventListener('focusin', function (e) {
    if (e.target.id === 'pfCmdSearch' && scriptViewActive) {
      const val = e.target.value.trim();
      if (val) renderScriptSearchDropdown(val);
    }
  });

  /* ════════════════════════════════════════════════════════════
     INIT
     ════════════════════════════════════════════════════════════ */
  renderSidebar();
  renderCommandList();
  initDragDrop();

})();
