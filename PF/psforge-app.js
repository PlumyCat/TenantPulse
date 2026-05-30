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

    { s: 'Microsoft 365', g: 'Appareils Intune',          cmd: 'Get-MgUserRegisteredDevice -UserId <upn>' },
    { s: 'Microsoft 365', g: 'Appareils Intune',          cmd: 'Get-MgDeviceManagementManagedDevice -Filter "userPrincipalName eq \'<upn>\'"' },
    { s: 'Microsoft 365', g: 'Appareils Intune',          cmd: 'Invoke-MgRetireDeviceManagementManagedDevice -ManagedDeviceId <id>' },

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
    microsoft365: ['Utilisateur','Exchange Online','MFA / Sécurité','Licences','Groupes','Appareils Intune','Teams'],
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
  function saveCommand(name, cmdText, desc, kind) {
    const saved = loadSaved();
    const entry = { name, cmd: cmdText, ts: Date.now() };
    if (desc) entry.desc = desc;
    if (kind) entry.kind = kind;   /* 'script' = enregistré depuis le Script Builder */
    saved.unshift(entry);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved.slice(0, 100))); } catch {}
  }
  function deleteSaved(ts) {
    const saved = loadSaved().filter(function (e) { return e.ts !== ts; });
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch {}
    renderCommandList(document.getElementById('pfCmdSearch')?.value || '');
  }
  function renameSaved(ts, newName) {
    const saved = loadSaved().map(function (e) {
      return e.ts === ts ? Object.assign({}, e, { name: newName }) : e;
    });
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
    /* Vue commande simple : barre dépliable sous la toolbar. */
    const bar     = document.getElementById('pfDescBar');
    const content = document.getElementById('pfDescContent');
    if (bar) {
      if (desc) {
        bar.hidden = false;
        if (content && !content.hidden) content.textContent = desc;
      } else {
        bar.hidden = true;
        if (content) { content.hidden = true; content.textContent = ''; }
      }
    }
    /* Vue Script Builder : bouton toolbar + panneau flottant. */
    updateScriptDescUI();
  }

  /* Active/désactive le bouton Description de la toolbar selon la description
     courante, et synchronise le panneau s'il est ouvert. */
  function updateScriptDescUI() {
    const btn   = document.getElementById('pfScriptDescBtn');
    const panel = document.getElementById('pfScriptDescPanel');
    const text  = document.getElementById('pfScriptDescText');
    if (btn) {
      btn.disabled = !currentCmdDesc;
      btn.title = currentCmdDesc ? 'Voir la description du script' : 'Aucune description pour ce script';
      if (!currentCmdDesc) btn.classList.remove('active');
    }
    if (panel) {
      if (!currentCmdDesc) { panel.hidden = true; if (text) text.textContent = ''; }
      else if (!panel.hidden && text) { text.textContent = currentCmdDesc; }
    }
  }

  function toggleScriptDescPanel() {
    const panel = document.getElementById('pfScriptDescPanel');
    const btn   = document.getElementById('pfScriptDescBtn');
    const text  = document.getElementById('pfScriptDescText');
    if (!panel || !currentCmdDesc) return;
    if (panel.hidden) {
      if (text) text.textContent = currentCmdDesc;
      panel.hidden = false;
      if (btn) btn.classList.add('active');
    } else {
      panel.hidden = true;
      if (btn) btn.classList.remove('active');
    }
  }
  function closeScriptDescPanel() {
    const panel = document.getElementById('pfScriptDescPanel');
    const btn   = document.getElementById('pfScriptDescBtn');
    if (panel) panel.hidden = true;
    if (btn) btn.classList.remove('active');
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

    highlightEditor(div);
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

    highlightEditor(div);
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
    const hasContent = { custom: false, builtin: false, extra: false };

    /* ── Section : commandes personnalisées ──
       Un seul parent repliable regroupant les sous-catégories (Mes commandes,
       Système Windows, Microsoft 365, Favoris). Évite la confusion avec les
       sections intégrées qui portent les mêmes noms, et permet de replier. */
    const groupOrder  = ['mine', 'windows', 'microsoft365', 'favorites'];
    const groupLabels = { mine: 'Mes commandes', windows: 'Système Windows', microsoft365: 'Microsoft 365', favorites: '★ Favoris' };
    const groups      = { mine: [], windows: [], microsoft365: [], favorites: [] };

    all.forEach(function (e) {
      if (q && (e.title || '').toLowerCase().indexOf(q) === -1 &&
               e.cmd.toLowerCase().indexOf(q)           === -1 &&
               (e.desc || '').toLowerCase().indexOf(q)  === -1) return;
      (groups[e.category || 'mine'] || groups.mine).push(e);
    });

    const customTotal = groupOrder.reduce(function (n, cat) { return n + groups[cat].length; }, 0);
    if (customTotal) {
      hasContent.custom = true;
      const customSec = buildManagerCollapsible(
        'Commandes personnalisées', customTotal, true,
        function (body) {
          groupOrder.forEach(function (cat) {
            const items = groups[cat];
            if (!items.length) return;
            const grpHeading = document.createElement('div');
            grpHeading.className   = 'pf-manager-builtin-group-heading';
            grpHeading.textContent = groupLabels[cat];
            body.appendChild(grpHeading);
            items.forEach(function (entry) { body.appendChild(buildManagerCustomRow(entry)); });
          });
        }
      );
      customSec.classList.add('pf-manager-builtin-section--custom'); /* accent bleu */
      list.appendChild(customSec);
    }

    /* ── Section : commandes enregistrées (modale Sauvegarder) ── */
    const savedAll = loadSaved().filter(function (e) {
      return !q || (e.name || '').toLowerCase().indexOf(q) !== -1 ||
                   e.cmd.toLowerCase().indexOf(q) !== -1;
    });
    if (savedAll.length) {
      hasContent.extra = true;
      list.appendChild(buildManagerCollapsible(
        'Commandes enregistrées', savedAll.length, q,
        function (body) { savedAll.forEach(function (e) { body.appendChild(buildManagerSavedRow(e)); }); }
      ));
    }

    /* ── Section : favoris épinglés (commandes étoilées) ── */
    const favList = [...loadFavorites()].filter(function (cmd) {
      return !q || cmd.toLowerCase().indexOf(q) !== -1;
    });
    if (favList.length) {
      hasContent.extra = true;
      list.appendChild(buildManagerCollapsible(
        '★ Favoris épinglés', favList.length, q,
        function (body) { favList.forEach(function (cmd) { body.appendChild(buildManagerFavRow(cmd)); }); }
      ));
    }

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
        hdTitle.textContent = 'Groupes · ' + sLabel;
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
    if (!hasContent.custom && !hasContent.builtin && !hasContent.extra) {
      const empty = document.createElement('div');
      empty.className   = 'pf-manager-empty';
      empty.textContent = q ? 'Aucune commande ne correspond à "' + filter + '".'
                            : 'Aucune commande personnalisée. Cliquez sur "+ Nouvelle commande" pour commencer.';
      list.appendChild(empty);
    }
  }

  /* Section repliable générique du gestionnaire (en-tête + compteur + corps) */
  function buildManagerCollapsible(title, count, expanded, fillBody) {
    const sec = document.createElement('div');
    sec.className = 'pf-manager-builtin-section' + (expanded ? '' : ' collapsed');

    const hd = document.createElement('div');
    hd.className = 'pf-manager-builtin-heading';
    hd.addEventListener('click', function () { sec.classList.toggle('collapsed'); });

    const t = document.createElement('span');
    t.textContent = title;
    const cb = document.createElement('span');
    cb.className = 'pf-manager-builtin-count';
    cb.textContent = count;
    const ar = document.createElement('span');
    ar.className = 'pf-manager-builtin-arrow';
    ar.textContent = '▾';
    hd.appendChild(t); hd.appendChild(cb); hd.appendChild(ar);

    const body = document.createElement('div');
    body.className = 'pf-manager-builtin-body';
    fillBody(body);

    sec.appendChild(hd); sec.appendChild(body);
    return sec;
  }

  /* Ligne — commande enregistrée (renommer + supprimer) */
  function buildManagerSavedRow(entry) {
    const row = document.createElement('div');
    row.className = 'pf-manager-item';

    const info = document.createElement('div');
    info.className = 'pf-manager-item-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'pf-manager-item-title';
    titleEl.textContent = entry.name || entry.cmd;
    info.appendChild(titleEl);

    if (entry.name) {
      const cmdEl = document.createElement('div');
      cmdEl.className = 'pf-manager-item-cmd';
      const oneLine = entry.cmd.split('\n')[0] + (entry.cmd.indexOf('\n') !== -1 ? ' …' : '');
      oneLine.split(/(<[a-zA-Z]+>)/).forEach(function (part) {
        if (/^<[a-zA-Z]+>$/.test(part)) {
          const sp = document.createElement('span'); sp.className = 'pf-cmd-param'; sp.textContent = part; cmdEl.appendChild(sp);
        } else if (part) { cmdEl.appendChild(document.createTextNode(part)); }
      });
      info.appendChild(cmdEl);
    }

    if (entry.desc) {
      const descEl = document.createElement('div');
      descEl.className = 'pf-manager-item-desc'; descEl.textContent = entry.desc;
      info.appendChild(descEl);
    }

    const editRow = document.createElement('div');
    editRow.className = 'pf-manager-group-edit-row';
    editRow.hidden = true;
    const inp = document.createElement('input');
    inp.className = 'pf-manager-group-input'; inp.type = 'text';
    inp.value = entry.name || ''; inp.maxLength = 60; inp.placeholder = 'Nom…';
    const okBtn = document.createElement('button');
    okBtn.className = 'pf-manager-group-save'; okBtn.type = 'button'; okBtn.textContent = 'OK';
    editRow.appendChild(inp); editRow.appendChild(okBtn);
    info.appendChild(editRow);

    const actions = document.createElement('div');
    actions.className = 'pf-manager-item-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'pf-manager-item-edit'; editBtn.type = 'button';
    editBtn.title = 'Renommer'; editBtn.textContent = '✏';
    editBtn.addEventListener('click', function () {
      editRow.hidden = !editRow.hidden;
      if (!editRow.hidden) { inp.focus(); inp.select(); }
    });
    function doRename() {
      const v = inp.value.trim();
      if (!v) return;
      renameSaved(entry.ts, v);
      renderManagerList(managerFilter);
    }
    okBtn.addEventListener('click', doRename);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doRename(); } });

    const delBtn = document.createElement('button');
    delBtn.className = 'pf-saved-del'; delBtn.type = 'button';
    delBtn.title = 'Supprimer'; delBtn.textContent = '✕';
    delBtn.addEventListener('click', function () {
      deleteSaved(entry.ts);
      renderManagerList(managerFilter);
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    row.appendChild(info);
    row.appendChild(actions);
    return row;
  }

  /* Ligne — favori épinglé (retirer des favoris) */
  function buildManagerFavRow(cmdStr) {
    const row = document.createElement('div');
    row.className = 'pf-manager-item';

    const info = document.createElement('div');
    info.className = 'pf-manager-item-info';
    const titleEl = document.createElement('div');
    titleEl.className = 'pf-manager-item-title';

    const ov = getOverride(cmdStr);
    if (ov && ov.title) {
      titleEl.textContent = ov.title;
    } else {
      const disp = ov ? ov.cmd : cmdStr;
      disp.split(/(<[a-zA-Z]+>)/).forEach(function (part) {
        if (/^<[a-zA-Z]+>$/.test(part)) {
          const sp = document.createElement('span'); sp.className = 'pf-cmd-param'; sp.textContent = part; titleEl.appendChild(sp);
        } else if (part) { titleEl.appendChild(document.createTextNode(part)); }
      });
    }
    info.appendChild(titleEl);

    const actions = document.createElement('div');
    actions.className = 'pf-manager-item-actions';
    const unfav = document.createElement('button');
    unfav.className = 'pf-saved-del'; unfav.type = 'button';
    unfav.title = 'Retirer des favoris'; unfav.textContent = '✕';
    unfav.addEventListener('click', function () {
      toggleFavorite(cmdStr);
      renderManagerList(managerFilter);
    });
    actions.appendChild(unfav);

    row.appendChild(info);
    row.appendChild(actions);
    return row;
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

  /* ════════════════════════════════════════════════════════════
     IMPORT / EXPORT DE COMMANDES (paquets .json)
     ----------------------------------------------------------------
     Un paquet regroupe (au choix de l'expert) : commandes
     personnalisées, modifications de commandes intégrées, groupes
     créés/renommés, commandes enregistrées et favoris.
     Format : { format:'psforge-package', version:1, exportedAt, data }
     ════════════════════════════════════════════════════════════ */

  let ioExportLookup = {};
  let ioImportLookup = {};

  /* ── Garde-fous de sécurité (paquets = données non fiables) ── */
  const IO_MAX_BYTES   = 1024 * 1024;   /* fichier / code importé : 1 Mo max */
  const IO_MAX_ITEMS   = 500;           /* nb max d'éléments par type */
  const IO_MAX_TITLE   = 200;
  const IO_MAX_GROUP   = 80;
  const IO_MAX_DESC    = 4000;
  const IO_MAX_CMD     = 20000;         /* une commande / script */
  const IO_FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

  function ioSafeStr(v, max) {
    const s = (v == null) ? '' : String(v);
    return s.length > max ? s.slice(0, max) : s;
  }
  function ioForbidden(k) { return IO_FORBIDDEN_KEYS.indexOf(k) !== -1; }
  function ioSafeCategory(c) { return ['mine', 'windows', 'microsoft365', 'favorites'].indexOf(c) !== -1 ? c : 'mine'; }
  function ioSafeSection(s)  { return (s === 'windows' || s === 'microsoft365') ? s : null; }
  function ioSafeGroup(v) {
    if (v == null) return null;
    const s = ioSafeStr(v, IO_MAX_GROUP);
    return (s && !ioForbidden(s)) ? s : null;
  }

  /* Motifs PowerShell à risque (exécution distante, obfuscation, destruction…) */
  const IO_RISKY = [
    /Invoke-Expression/i, /(^|[\s;(|])iex([\s;)|]|$)/i,
    /Invoke-WebRequest|Invoke-RestMethod|(^|[\s;(|])(iwr|irm|curl|wget)([\s;)|]|$)/i,
    /DownloadString|DownloadFile|Net\.WebClient/i, /FromBase64String/i,
    /-Enc(odedCommand)?\b/i, /-nop\b|-noprofile|-w(indowstyle)?\s+hidden/i,
    /Remove-Item[^\n]*-(Recurse|Force)/i, /Format-Volume|Clear-Disk/i,
    /Set-ExecutionPolicy/i, /Add-MpPreference|Set-MpPreference|DisableRealtimeMonitoring/i,
    /New-Object\s+Net\.Sockets/i, /\bbitsadmin\b|\bcertutil\b|\bmshta\b|\bregsvr32\b/i,
    /\breg\s+(add|delete)\b/i, /Start-Process/i,
  ];
  function ioIsRisky(text) { const t = String(text || ''); return IO_RISKY.some(function (re) { return re.test(t); }); }

  /* Motifs d'informations sensibles (à ne pas partager par mégarde) */
  const IO_SECRET = [
    /pass(word|wd)?\s*[:=]/i, /-Password\b/i, /ConvertTo-SecureString/i,
    /client[_-]?secret|ClientSecret/i, /api[_-]?key/i, /\bsecret\s*[:=]/i,
    /\btoken\s*[:=]|-Token\b/i, /Authorization\s*[:=]|Bearer\s+\S/i,
    /AccessKey|SecretKey/i, /-AsPlainText\b/i,
  ];
  function ioIsSensitive(text) { const t = String(text || ''); return IO_SECRET.some(function (re) { return re.test(t); }); }

  /* Nettoie/valide les données d'un paquet (anti-pollution, caps, types). */
  function sanitizePackageData(raw) {
    const data = {};
    if (!raw || typeof raw !== 'object') return data;

    if (Array.isArray(raw.customCmds)) {
      data.customCmds = raw.customCmds.slice(0, IO_MAX_ITEMS)
        .filter(function (e) { return e && typeof e === 'object'; })
        .map(function (e) { return {
          title: ioSafeStr(e.title, IO_MAX_TITLE), cmd: ioSafeStr(e.cmd, IO_MAX_CMD),
          desc: ioSafeStr(e.desc, IO_MAX_DESC), category: ioSafeCategory(e.category), group: ioSafeGroup(e.group),
        }; })
        .filter(function (e) { return e.cmd; });
    }
    if (raw.overrides && typeof raw.overrides === 'object') {
      const o = {}; let n = 0;
      Object.keys(raw.overrides).forEach(function (k) {
        if (n >= IO_MAX_ITEMS || ioForbidden(k)) return;
        const v = raw.overrides[k];
        if (!v || typeof v !== 'object') return;
        o[ioSafeStr(k, IO_MAX_CMD)] = { title: ioSafeStr(v.title, IO_MAX_TITLE), cmd: ioSafeStr(v.cmd, IO_MAX_CMD), desc: ioSafeStr(v.desc, IO_MAX_DESC) };
        n++;
      });
      data.overrides = o;
    }
    if (Array.isArray(raw.customGroups)) {
      data.customGroups = raw.customGroups.slice(0, IO_MAX_ITEMS)
        .filter(function (g) { return g && typeof g === 'object'; })
        .map(function (g) { return { name: ioSafeGroup(g.name), section: ioSafeSection(g.section) }; })
        .filter(function (g) { return g.name && g.section; });
    }
    if (raw.groupOverrides && typeof raw.groupOverrides === 'object') {
      const o = {}; let n = 0;
      Object.keys(raw.groupOverrides).forEach(function (k) {
        if (n >= IO_MAX_ITEMS || ioForbidden(k)) return;
        const disp = ioSafeGroup(raw.groupOverrides[k]);
        if (!disp) return;
        o[ioSafeStr(k, IO_MAX_GROUP)] = disp; n++;
      });
      data.groupOverrides = o;
    }
    if (Array.isArray(raw.saved)) {
      data.saved = raw.saved.slice(0, IO_MAX_ITEMS)
        .filter(function (e) { return e && typeof e === 'object'; })
        .map(function (e) { return { name: ioSafeStr(e.name, IO_MAX_TITLE), cmd: ioSafeStr(e.cmd, IO_MAX_CMD) }; })
        .filter(function (e) { return e.cmd; });
    }
    if (Array.isArray(raw.favorites)) {
      data.favorites = raw.favorites.slice(0, IO_MAX_ITEMS)
        .filter(function (c) { return typeof c === 'string' && c; })
        .map(function (c) { return ioSafeStr(c, IO_MAX_CMD); });
    }
    return data;
  }

  /* Ajoute un texte de commande avec coloration des balises <param> */
  function appendCmdWithParams(el, text) {
    String(text).split(/(<[a-zA-Z]+>)/).forEach(function (part) {
      if (/^<[a-zA-Z]+>$/.test(part)) {
        const sp = document.createElement('span'); sp.className = 'pf-cmd-param'; sp.textContent = part; el.appendChild(sp);
      } else if (part) { el.appendChild(document.createTextNode(part)); }
    });
  }

  /* Données exportables actuelles, groupées par type */
  function collectExportable() {
    const groups = [];
    const customs = loadCustomCmds();
    if (customs.length) groups.push({ type: 'customCmds', label: 'Commandes personnalisées',
      items: customs.map(function (e) { return { key: 'customCmds:' + e.id, raw: e, title: (e.title || e.cmd), cmd: e.cmd, warn: ioIsSensitive(e.cmd + ' ' + (e.desc || '')) ? '⚠ sensible' : null }; }) });

    const ov = loadOverrides();
    const ovKeys = Object.keys(ov);
    if (ovKeys.length) groups.push({ type: 'overrides', label: 'Modifications de commandes intégrées',
      items: ovKeys.map(function (orig) { const d = ov[orig]; return { key: 'overrides:' + orig, raw: { orig: orig, data: d }, title: (d.title || d.cmd || orig), cmd: '↳ remplace : ' + orig, warn: ioIsSensitive((d.cmd || '') + ' ' + (d.desc || '')) ? '⚠ sensible' : null }; }) });

    const cg = loadCustomGroups();
    if (cg.length) groups.push({ type: 'customGroups', label: 'Groupes créés',
      items: cg.map(function (g) { return { key: 'customGroups:' + g.id, raw: g, title: g.name, cmd: (g.section === 'windows' ? 'Système Windows' : 'Microsoft 365') }; }) });

    const go = loadGroupOverrides();
    const goKeys = Object.keys(go);
    if (goKeys.length) groups.push({ type: 'groupOverrides', label: 'Groupes renommés',
      items: goKeys.map(function (orig) { return { key: 'groupOverrides:' + orig, raw: { orig: orig, display: go[orig] }, title: orig + ' → ' + go[orig], cmd: null }; }) });

    const saved = loadSaved();
    if (saved.length) groups.push({ type: 'saved', label: 'Commandes enregistrées',
      items: saved.map(function (e) { return { key: 'saved:' + e.ts, raw: e, title: (e.name || e.cmd), cmd: e.cmd, warn: ioIsSensitive(e.cmd) ? '⚠ sensible' : null }; }) });

    const favs = [...loadFavorites()];
    if (favs.length) groups.push({ type: 'favorites', label: '★ Favoris',
      items: favs.map(function (c) { return { key: 'favorites:' + c, raw: c, title: c, cmd: null, warn: ioIsSensitive(c) ? '⚠ sensible' : null }; }) });

    return groups;
  }

  /* Données importables d'un paquet, avec statut nouveau / déjà présent */
  function collectImportable(data) {
    const groups = [];
    const cur = {
      customCmds: loadCustomCmds(), overrides: loadOverrides(),
      customGroups: loadCustomGroups(), groupOverrides: loadGroupOverrides(),
      saved: loadSaved(), favorites: loadFavorites(),
    };
    if (Array.isArray(data.customCmds) && data.customCmds.length) groups.push({ type: 'customCmds', label: 'Commandes personnalisées',
      items: data.customCmds.map(function (e, i) { return { key: 'customCmds:' + i, raw: e, title: (e.title || e.cmd || '(sans titre)'), cmd: e.cmd || '', status: cur.customCmds.some(function (x) { return x.cmd === e.cmd; }) ? 'dup' : 'new', warn: ioIsRisky(e.cmd) ? '⚠ à vérifier' : null }; }) });

    if (data.overrides && Object.keys(data.overrides).length) groups.push({ type: 'overrides', label: 'Modifications de commandes intégrées',
      items: Object.keys(data.overrides).map(function (orig, i) { const d = data.overrides[orig]; return { key: 'overrides:' + i, raw: { orig: orig, data: d }, title: (d.title || d.cmd || orig), cmd: (d.cmd && d.cmd !== orig ? d.cmd + '\n' : '') + '↳ remplace : ' + orig, status: cur.overrides[orig] ? 'dup' : 'new', warn: ioIsRisky((d.cmd || '') + ' ' + orig) ? '⚠ à vérifier' : null }; }) });

    if (Array.isArray(data.customGroups) && data.customGroups.length) groups.push({ type: 'customGroups', label: 'Groupes créés',
      items: data.customGroups.map(function (g, i) { return { key: 'customGroups:' + i, raw: g, title: g.name, cmd: (g.section === 'windows' ? 'Système Windows' : 'Microsoft 365'), status: cur.customGroups.some(function (x) { return x.section === g.section && x.name === g.name; }) ? 'dup' : 'new' }; }) });

    if (data.groupOverrides && Object.keys(data.groupOverrides).length) groups.push({ type: 'groupOverrides', label: 'Groupes renommés',
      items: Object.keys(data.groupOverrides).map(function (orig, i) { return { key: 'groupOverrides:' + i, raw: { orig: orig, display: data.groupOverrides[orig] }, title: orig + ' → ' + data.groupOverrides[orig], cmd: null, status: cur.groupOverrides[orig] ? 'dup' : 'new' }; }) });

    if (Array.isArray(data.saved) && data.saved.length) groups.push({ type: 'saved', label: 'Commandes enregistrées',
      items: data.saved.map(function (e, i) { const c = e.cmd || ''; return { key: 'saved:' + i, raw: e, title: (e.name || c), cmd: c, status: cur.saved.some(function (x) { return x.cmd === e.cmd; }) ? 'dup' : 'new', warn: ioIsRisky(c) ? '⚠ à vérifier' : null }; }) });

    if (Array.isArray(data.favorites) && data.favorites.length) groups.push({ type: 'favorites', label: '★ Favoris',
      items: data.favorites.map(function (c, i) { return { key: 'favorites:' + i, raw: c, title: c, cmd: null, status: cur.favorites.has(c) ? 'dup' : 'new', warn: ioIsRisky(c) ? '⚠ à vérifier' : null }; }) });

    return groups;
  }

  /* Construit un groupe de l'arbre de sélection (en-tête + éléments). */
  function buildIoGroup(g, withStatus, onChange) {
    const group = document.createElement('div');
    group.className = 'pf-io-group';

    const head = document.createElement('label');
    head.className = 'pf-io-group-head';
    const master = document.createElement('input');
    master.type = 'checkbox'; master.className = 'pf-io-cb pf-io-master';
    const title = document.createElement('span');
    title.className = 'pf-io-group-title'; title.textContent = g.label;
    const count = document.createElement('span');
    count.className = 'pf-io-group-count'; count.textContent = g.items.length;
    head.appendChild(master); head.appendChild(title); head.appendChild(count);
    group.appendChild(head);

    const itemCbs = [];
    g.items.forEach(function (it) {
      const row = document.createElement('label');
      row.className = 'pf-io-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = 'pf-io-cb';
      cb.dataset.iokey = it.key;
      cb.checked = withStatus ? (it.status === 'new') : true;

      const body = document.createElement('div');
      body.className = 'pf-io-item-body';
      const t = document.createElement('div');
      t.className = 'pf-io-item-title'; t.textContent = it.title;
      body.appendChild(t);
      if (it.cmd) {
        const c = document.createElement('div');
        c.className = 'pf-io-item-cmd';
        appendCmdWithParams(c, it.cmd);
        body.appendChild(c);
      }

      row.appendChild(cb);
      row.appendChild(body);
      if (withStatus && it.status) {
        const b = document.createElement('span');
        b.className = 'pf-io-badge pf-io-badge--' + (it.status === 'new' ? 'new' : 'dup');
        b.textContent = it.status === 'new' ? '✦ nouveau' : '⟳ déjà présent';
        row.appendChild(b);
      }
      if (it.warn) {
        const w = document.createElement('span');
        w.className = 'pf-io-badge pf-io-badge--warn';
        w.textContent = it.warn;
        if (it.warn.indexOf('vérifier') !== -1) row.classList.add('pf-io-item--risky');
        row.appendChild(w);
      }

      cb.addEventListener('change', function () { syncMaster(); onChange(); });
      group.appendChild(row);
      itemCbs.push(cb);
    });

    function syncMaster() {
      const c = itemCbs.filter(function (x) { return x.checked; }).length;
      master.checked = c === itemCbs.length;
      master.indeterminate = c > 0 && c < itemCbs.length;
    }
    master.addEventListener('change', function () {
      itemCbs.forEach(function (x) { x.checked = master.checked; });
      onChange();
    });
    syncMaster();
    return group;
  }

  function countIo(treeId) {
    const cbs = [...document.querySelectorAll('#' + treeId + ' .pf-io-cb:not(.pf-io-master)')];
    return { sel: cbs.filter(function (c) { return c.checked; }).length, total: cbs.length };
  }
  function setAllIo(treeId, checked) {
    document.querySelectorAll('#' + treeId + ' .pf-io-cb').forEach(function (cb) { cb.checked = checked; cb.indeterminate = false; });
  }
  function updateExportCount() {
    const r = countIo('pfExportTree');
    const el = document.getElementById('pfExportCount');
    if (el) el.textContent = r.total ? (r.sel + ' / ' + r.total + ' sélectionné' + (r.sel > 1 ? 's' : '')) : '';
    const dl = document.getElementById('pfExportDownload');
    if (dl) dl.disabled = r.sel === 0;
  }
  function updateImportCount() {
    const r = countIo('pfImportTree');
    const el = document.getElementById('pfImportCount');
    if (el) el.textContent = r.total ? (r.sel + ' / ' + r.total + ' sélectionné' + (r.sel > 1 ? 's' : '')) : '';
    const ap = document.getElementById('pfImportApply');
    if (ap) ap.disabled = r.sel === 0;
  }

  /* ── Export ── */
  function renderExportTree() {
    ioExportLookup = {};
    const tree = document.getElementById('pfExportTree');
    tree.replaceChildren();
    const groups = collectExportable();
    if (!groups.length) {
      const e = document.createElement('div');
      e.className = 'pf-io-empty';
      e.textContent = 'Rien à exporter pour le moment. Créez d\'abord des commandes dans le Gestionnaire.';
      tree.appendChild(e);
      updateExportCount();
      return;
    }
    groups.forEach(function (g) {
      g.items.forEach(function (it) { ioExportLookup[it.key] = { type: g.type, raw: it.raw }; });
      tree.appendChild(buildIoGroup(g, false, updateExportCount));
    });
    updateExportCount();
  }
  function showExportModal() {
    renderExportTree();
    document.getElementById('pfExportModal').hidden = false;
  }
  function hideExportModal() { document.getElementById('pfExportModal').hidden = true; }

  /* Base64 sûr pour l'UTF-8 (commandes avec accents, flèches, etc.) */
  function utf8ToB64(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64ToUtf8(str) { return decodeURIComponent(escape(atob(str))); }
  const PKG_CODE_PREFIX = 'PSFORGE1:';

  /* Construit le paquet à partir des cases cochées (ou null si rien). */
  function buildPackageFromExportSelection() {
    const tree = document.getElementById('pfExportTree');
    const data = {};
    tree.querySelectorAll('.pf-io-cb:not(.pf-io-master)').forEach(function (cb) {
      if (!cb.checked) return;
      const it = ioExportLookup[cb.dataset.iokey];
      if (!it) return;
      const t = it.type, raw = it.raw;
      if (t === 'overrides')           { (data.overrides = data.overrides || {})[raw.orig] = raw.data; }
      else if (t === 'groupOverrides') { (data.groupOverrides = data.groupOverrides || {})[raw.orig] = raw.display; }
      else                             { (data[t] = data[t] || []).push(raw); }
    });
    if (!Object.keys(data).length) return null;
    return { format: 'psforge-package', version: 1, exportedAt: new Date().toISOString(), data: data };
  }

  function downloadExportPackage() {
    const pkg = buildPackageFromExportSelection();
    if (!pkg) return;
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const d = new Date();
    const stamp = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const a = document.createElement('a');
    a.href = url; a.download = 'psforge-commandes-' + stamp + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    hideExportModal();
  }

  function copyExportCode() {
    const pkg = buildPackageFromExportSelection();
    if (!pkg) return;
    const code = PKG_CODE_PREFIX + utf8ToB64(JSON.stringify(pkg));
    copyText(code, null);
    const btn = document.getElementById('pfExportCopy');
    if (btn) {
      const o = btn.textContent;
      btn.textContent = '✓ Code copié !';
      setTimeout(function () { btn.textContent = o; }, 1300);
    }
  }

  /* ── Import ── */
  function showImportError(msg) {
    ioImportLookup = {};
    const tree = document.getElementById('pfImportTree');
    tree.replaceChildren();
    const e = document.createElement('div');
    e.className = 'pf-io-empty'; e.textContent = msg;
    tree.appendChild(e);
    updateImportCount();
    document.getElementById('pfImportModal').hidden = false;
  }
  function renderImportTree(data) {
    ioImportLookup = {};
    const tree = document.getElementById('pfImportTree');
    tree.replaceChildren();
    const groups = collectImportable(data);
    if (!groups.length) {
      const e = document.createElement('div');
      e.className = 'pf-io-empty'; e.textContent = 'Le paquet ne contient aucune donnée importable.';
      tree.appendChild(e);
      updateImportCount();
      return;
    }
    groups.forEach(function (g) {
      g.items.forEach(function (it) { ioImportLookup[it.key] = { type: g.type, raw: it.raw }; });
      tree.appendChild(buildIoGroup(g, true, updateImportCount));
    });
    updateImportCount();
  }
  /* Parse un fichier OU un code texte (PSFORGE1:… ou JSON brut) → paquet | null
     Données non fiables : taille bornée, schéma validé, contenu nettoyé. */
  function parseImportText(text) {
    let t = (text || '').trim();
    if (!t || t.length > IO_MAX_BYTES * 2) return null;   /* garde-fou taille brute */
    if (t.indexOf(PKG_CODE_PREFIX) === 0) {
      t = t.slice(PKG_CODE_PREFIX.length).trim();
      try { t = b64ToUtf8(t); } catch (e) { return null; }
    }
    if (t.length > IO_MAX_BYTES) return null;             /* JSON décodé trop volumineux */
    let pkg = null;
    try { pkg = JSON.parse(t); } catch (e) { return null; }
    if (!pkg || pkg.format !== 'psforge-package' || typeof pkg.data !== 'object' || !pkg.data) return null;
    return { format: pkg.format, version: pkg.version, data: sanitizePackageData(pkg.data) };
  }

  /* Ouvre la modale d'import vide (choix fichier ou collage de code) */
  function showImportModal() {
    ioImportLookup = {};
    const code = document.getElementById('pfImportCode');
    if (code) code.value = '';
    const tree = document.getElementById('pfImportTree');
    tree.replaceChildren();
    const e = document.createElement('div');
    e.className = 'pf-io-empty';
    e.textContent = 'Choisissez un fichier .json ou collez un code pour prévisualiser le contenu.';
    tree.appendChild(e);
    updateImportCount();
    document.getElementById('pfImportModal').hidden = false;
  }

  function analyzeImportCode() {
    const pkg = parseImportText(document.getElementById('pfImportCode').value);
    if (!pkg) { showImportError('Code invalide ou illisible. Vérifiez d\'avoir copié le code en entier.'); return; }
    renderImportTree(pkg.data);
  }

  function handleImportFile(file) {
    if (file && file.size > IO_MAX_BYTES) {
      showImportError('Fichier trop volumineux (max 1 Mo). Refusé par sécurité.');
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      const pkg = parseImportText(reader.result);
      if (!pkg) { showImportError('Fichier invalide : ce n\'est pas un paquet de commandes PsForge.'); return; }
      renderImportTree(pkg.data);
      document.getElementById('pfImportModal').hidden = false;
    };
    reader.onerror = function () { showImportError('Impossible de lire le fichier.'); };
    reader.readAsText(file);
  }
  function hideImportModal() {
    document.getElementById('pfImportModal').hidden = true;
    ioImportLookup = {};
  }
  function applyImport() {
    const tree = document.getElementById('pfImportTree');
    const sel  = {};
    tree.querySelectorAll('.pf-io-cb:not(.pf-io-master)').forEach(function (cb) {
      if (!cb.checked) return;
      const it = ioImportLookup[cb.dataset.iokey];
      if (!it) return;
      (sel[it.type] = sel[it.type] || []).push(it.raw);
    });

    /* Groupes d'abord (les commandes peuvent les référencer) */
    (sel.customGroups   || []).forEach(function (g) { if (g && g.section && g.name) addCustomGroup(g.section, g.name); });
    (sel.groupOverrides || []).forEach(function (o) { if (o && o.orig) setGroupOverride(o.orig, o.display); });
    (sel.overrides      || []).forEach(function (o) { if (o && o.orig && o.data) setOverride(o.orig, o.data); });

    if (sel.customCmds) {
      const arr = loadCustomCmds();
      sel.customCmds.forEach(function (raw) {
        if (!raw || !raw.cmd) return;
        const idx = arr.findIndex(function (e) { return e.cmd === raw.cmd; });
        const entry = {
          id:       idx !== -1 ? arr[idx].id : (Date.now() + Math.floor(Math.random() * 1e6)),
          title:    raw.title || '', cmd: raw.cmd, desc: raw.desc || '',
          category: raw.category || 'mine', group: raw.group || null,
        };
        if (idx !== -1) arr[idx] = entry; else arr.unshift(entry);
        if ((entry.category === 'windows' || entry.category === 'microsoft365') && entry.group) {
          const exists = getGroupsForSection(entry.category).some(function (g) { return g.name === entry.group; });
          if (!exists) addCustomGroup(entry.category, entry.group);
        }
      });
      saveCustomCmds(arr.slice(0, 200));
    }

    if (sel.saved) {
      const arr = loadSaved();
      sel.saved.forEach(function (raw) {
        if (!raw || !raw.cmd) return;
        const idx = arr.findIndex(function (e) { return e.cmd === raw.cmd; });
        if (idx !== -1) { arr[idx] = Object.assign({}, arr[idx], { name: raw.name || arr[idx].name }); }
        else { arr.unshift({ name: raw.name || '', cmd: raw.cmd, ts: Date.now() + Math.floor(Math.random() * 1e6) }); }
      });
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(arr.slice(0, 100))); } catch (e) {}
    }

    if (sel.favorites) {
      const set = loadFavorites();
      sel.favorites.forEach(function (c) { if (typeof c === 'string') set.add(c); });
      saveFavorites(set);
    }

    hideImportModal();
    renderManagerList(managerFilter);
    renderCommandList(document.getElementById('pfCmdSearch')?.value || '');
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
    highlightEditor(div);
  }

  /* ════════════════════════════════════════════════════════════
     COLORATION SYNTAXIQUE POWERSHELL (live, dans les éditeurs)
     ----------------------------------------------------------------
     Les éditeurs (#pfCmdBuilt, #pfScriptEditor) sont des contenteditable
     qui mélangent du texte libre et des balises <param> interactives
     (span.pf-param-tag, contentEditable=false). À chaque frappe on :
       1. sérialise le contenu en segments (texte / saut de ligne / param)
       2. capture la position du curseur en offset logique
       3. reconstruit le DOM avec des <span> colorés pour le texte
          (les balises <param> sont préservées telles quelles)
       4. restaure le curseur
     Les balises <param> ne sont JAMAIS colorées comme du code : elles
     gardent leur style orange/vert existant.
     ════════════════════════════════════════════════════════════ */

  /* Mots-clés PowerShell */
  const PS_KEYWORDS = /^(?:if|else|elseif|switch|foreach|for|while|do|until|function|filter|workflow|return|break|continue|throw|try|catch|finally|param|begin|process|end|in|trap|class|enum|data|dynamicparam|using|exit)$/i;

  /* Tokenise une ligne de texte PowerShell → [{ v, c }]
     v = texte, c = classe de coloration (ou null pour texte brut). */
  function tokenizePS(line) {
    const out = [];
    const n   = line.length;
    let i = 0;
    function isWS(ch) { return ch === ' ' || ch === '\t'; }

    while (i < n) {
      const c = line[i];

      /* Commentaire — jusqu'à la fin de la ligne */
      if (c === '#') { out.push({ v: line.slice(i), c: 'cmt' }); break; }

      /* Chaîne double-quote (avec échappement backtick) */
      if (c === '"') {
        let j = i + 1;
        while (j < n) { if (line[j] === '`') { j += 2; continue; } if (line[j] === '"') { j++; break; } j++; }
        out.push({ v: line.slice(i, j), c: 'str' }); i = j; continue;
      }
      /* Chaîne single-quote */
      if (c === "'") {
        let j = i + 1;
        while (j < n) { if (line[j] === "'") { if (line[j + 1] === "'") { j += 2; continue; } j++; break; } j++; }
        out.push({ v: line.slice(i, j), c: 'str' }); i = j; continue;
      }

      /* Variable $nom / ${...} / $env:... */
      if (c === '$') {
        const m = /^\$(?:\{[^}]*\}|[A-Za-z_][\w:]*)/.exec(line.slice(i));
        if (m) { out.push({ v: m[0], c: 'var' }); i += m[0].length; continue; }
      }

      /* Nombre */
      if (c >= '0' && c <= '9' && (i === 0 || !/[A-Za-z_]/.test(line[i - 1]))) {
        const m = /^\d+(?:\.\d+)?/.exec(line.slice(i));
        if (m) { out.push({ v: m[0], c: 'num' }); i += m[0].length; continue; }
      }

      /* Paramètre -Xxx (précédé d'un espace ou début) */
      if (c === '-' && (i === 0 || isWS(line[i - 1]) || '({|;,'.indexOf(line[i - 1]) >= 0)) {
        const m = /^-[A-Za-z][\w-]*/.exec(line.slice(i));
        if (m) { out.push({ v: m[0], c: 'par' }); i += m[0].length; continue; }
      }

      /* Mot — cmdlet (Verbe-Nom), mot-clé, ou texte brut */
      if (/[A-Za-z_]/.test(c)) {
        const m = /^[A-Za-z_][\w]*(?:-[A-Za-z][\w]*)*/.exec(line.slice(i));
        const w = m[0];
        if (/^[A-Za-z]+-[A-Za-z][\w]*$/.test(w))      { out.push({ v: w, c: 'cmd' }); }
        else if (PS_KEYWORDS.test(w))                 { out.push({ v: w, c: 'kw'  }); }
        else                                          { out.push({ v: w, c: null }); }
        i += w.length; continue;
      }

      /* Opérateurs / ponctuation */
      if ('|><=+&;(){}@'.indexOf(c) >= 0) { out.push({ v: c, c: 'op' }); i++; continue; }

      /* Caractère brut */
      out.push({ v: c, c: null }); i++;
    }

    /* Fusionne les tokens bruts consécutifs (moins de nœuds DOM) */
    const merged = [];
    out.forEach(function (t) {
      const last = merged[merged.length - 1];
      if (last && last.c === null && t.c === null) { last.v += t.v; }
      else merged.push({ v: t.v, c: t.c });
    });
    return merged;
  }

  /* Sérialise un éditeur en segments :
     { t:'text', v } | { t:'nl' } | { t:'param', text, key, filled, active } */
  function serializeEditor(div) {
    const segs = [];
    function pushText(t) { if (t) segs.push({ t: 'text', v: t }); }
    function walk(node) {
      const kids = node.childNodes;
      for (let i = 0; i < kids.length; i++) {
        const ch = kids[i];
        if (ch.nodeType === Node.TEXT_NODE) {
          pushText(ch.nodeValue);
        } else if (ch.nodeType === Node.ELEMENT_NODE) {
          if (ch.nodeName === 'BR') {
            if (ch.classList && ch.classList.contains('pf-eol')) continue; /* sentinelle */
            segs.push({ t: 'nl' });
          } else if (ch.classList && ch.classList.contains('pf-param-tag')) {
            segs.push({
              t: 'param',
              text:   ch.textContent,
              key:    ch.dataset.param || '',
              filled: ch.classList.contains('filled'),
              active: ch.classList.contains('active'),
            });
          } else {
            const block = (ch.nodeName === 'DIV' || ch.nodeName === 'P');
            if (block && segs.length && segs[segs.length - 1].t !== 'nl') segs.push({ t: 'nl' });
            walk(ch);
          }
        }
      }
    }
    walk(div);
    return segs;
  }

  /* Mesure l'offset logique (nb de caractères) du début de l'éditeur
     jusqu'à la position (stopNode, stopOffset). Mêmes règles que serializeEditor. */
  function measureCaret(root, stopNode, stopOffset) {
    let count = 0, done = false;
    function walk(node) {
      const kids = node.childNodes;
      for (let i = 0; i < kids.length && !done; i++) {
        if (node === stopNode && i === stopOffset) { done = true; return; }
        const ch = kids[i];
        if (ch.nodeType === Node.TEXT_NODE) {
          if (ch === stopNode) { count += stopOffset; done = true; return; }
          count += ch.nodeValue.length;
        } else if (ch.nodeName === 'BR') {
          if (ch.classList && ch.classList.contains('pf-eol')) continue;
          count += 1;
        } else if (ch.classList && ch.classList.contains('pf-param-tag')) {
          if (ch === stopNode) { count += (stopOffset > 0 ? ch.textContent.length : 0); done = true; return; }
          count += ch.textContent.length;
        } else {
          const block = (ch.nodeName === 'DIV' || ch.nodeName === 'P');
          if (block && count > 0) count += 1;
          walk(ch);
        }
      }
      if (node === stopNode && stopOffset === kids.length) done = true;
    }
    walk(root);
    return count;
  }

  function caretToOffset(div) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!div.contains(r.startContainer)) return null;
    return measureCaret(div, r.startContainer, r.startOffset);
  }

  /* Replace le curseur à l'offset logique cible dans l'éditeur reconstruit. */
  function offsetToCaret(div, target) {
    if (target == null) return;
    let remaining = target, placed = false;
    const range = document.createRange();
    const kids  = div.childNodes;
    for (let i = 0; i < kids.length && !placed; i++) {
      const ch = kids[i];
      if (ch.nodeType === Node.TEXT_NODE) {
        if (remaining <= ch.nodeValue.length) { range.setStart(ch, remaining); placed = true; break; }
        remaining -= ch.nodeValue.length;
      } else if (ch.nodeName === 'BR') {
        if (ch.classList && ch.classList.contains('pf-eol')) { if (remaining <= 0) { range.setStartBefore(ch); placed = true; } continue; }
        if (remaining <= 0) { range.setStartBefore(ch); placed = true; break; }
        remaining -= 1;
      } else if (ch.classList && ch.classList.contains('pf-param-tag')) {
        const len = ch.textContent.length;
        if (remaining <= 0)   { range.setStartBefore(ch); placed = true; break; }
        if (remaining <= len) { range.setStartAfter(ch);  placed = true; break; }
        remaining -= len;
      } else {
        /* span de coloration : contient un unique nœud texte */
        const len = ch.textContent.length;
        if (remaining <= len) { range.setStart(ch.firstChild || ch, remaining); placed = true; break; }
        remaining -= len;
      }
    }
    if (!placed) { range.selectNodeContents(div); range.collapse(false); }
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /* Reconstruit le contenu de l'éditeur avec coloration syntaxique. */
  function renderHighlighted(div, segs, caretOffset) {
    activeParamTag = null;
    div.replaceChildren();
    let endsWithNl = false;

    function emitText(text) {
      text.split('\n').forEach(function (line, idx) {
        if (idx > 0) { div.appendChild(document.createElement('br')); endsWithNl = true; }
        if (!line) return;
        tokenizePS(line).forEach(function (tok) {
          if (tok.c) {
            const sp = document.createElement('span');
            sp.className   = 'pf-ps-' + tok.c;
            sp.textContent = tok.v;
            div.appendChild(sp);
          } else {
            div.appendChild(document.createTextNode(tok.v));
          }
          endsWithNl = false;
        });
      });
    }

    segs.forEach(function (seg) {
      if (seg.t === 'param') {
        const tag = makeParamTag(seg.text, seg.key);
        if (seg.filled) tag.classList.add('filled');
        if (seg.active) { tag.classList.add('active'); activeParamTag = tag; }
        div.appendChild(tag);
        endsWithNl = false;
      } else if (seg.t === 'nl') {
        div.appendChild(document.createElement('br'));
        endsWithNl = true;
      } else {
        emitText(seg.v);
      }
    });

    /* <br> sentinelle pour rendre visible une dernière ligne vide */
    if (endsWithNl) {
      const b = document.createElement('br');
      b.className = 'pf-eol';
      div.appendChild(b);
    }

    offsetToCaret(div, caretOffset);

    /* Script Builder : rafraîchir la gouttière et, si ouvert, la recherche. */
    if (div.id === 'pfScriptEditor') {
      refreshScriptGutter();
      if (findOpen) runFind(false);
    }
  }

  /* Point d'entrée : recolore un éditeur en préservant le curseur. */
  function highlightEditor(div) {
    if (!div) return;
    if (div.querySelector('.pf-cmd-hint')) return; /* état initial (hint) */
    const off  = caretToOffset(div);
    const segs = serializeEditor(div);
    renderHighlighted(div, segs, off);
  }

  /* ════════════════════════════════════════════════════════════
     SCRIPT BUILDER — GOUTTIÈRE (numéros de ligne) + FIND/REPLACE
     ════════════════════════════════════════════════════════════ */

  function scriptEditorEl() { return document.getElementById('pfScriptEditor'); }
  function scriptGutterEl() { return document.getElementById('pfScriptGutter'); }

  /* ── Modèle segments ↔ lignes (préserve couleurs et balises param) ── */
  function segmentsToLines(segs) {
    const lines = [[]];
    segs.forEach(function (s) {
      if (s.t === 'nl') lines.push([]);
      else lines[lines.length - 1].push(s);
    });
    return lines;
  }
  function linesToSegments(lines) {
    const segs = [];
    lines.forEach(function (line, i) {
      if (i > 0) segs.push({ t: 'nl' });
      line.forEach(function (s) { segs.push(s); });
    });
    return segs;
  }
  function getScriptLines() {
    const ed = scriptEditorEl();
    return ed ? segmentsToLines(serializeEditor(ed)) : [[]];
  }
  /* Applique un nouveau tableau de lignes (réutilise le pipeline coloré). */
  function setScriptLines(lines, caretOffset) {
    const ed = scriptEditorEl();
    if (!ed) return;
    if (!lines.length) lines = [[]];
    renderHighlighted(ed, linesToSegments(lines), caretOffset != null ? caretOffset : null);
  }
  function scriptLineCount() {
    const ed = scriptEditorEl();
    if (!ed) return 1;
    let n = 1;
    serializeEditor(ed).forEach(function (s) { if (s.t === 'nl') n++; });
    return n;
  }

  /* ── Gouttière ── */
  let gutterSel    = new Set();   /* indices de lignes sélectionnées */
  let gutterAnchor = null;        /* ancre pour Shift+clic */
  let dragLines    = null;        /* indices en cours de glisser-déposer */

  function refreshScriptGutter() {
    const ed = scriptEditorEl();
    const g  = scriptGutterEl();
    if (!ed || !g) return;
    const n = scriptLineCount();
    /* purge des sélections hors limites */
    Array.from(gutterSel).forEach(function (i) { if (i >= n) gutterSel.delete(i); });
    g.replaceChildren();
    for (let i = 0; i < n; i++) {
      const cell = document.createElement('div');
      cell.className = 'pf-gutter-num' + (gutterSel.has(i) ? ' selected' : '');
      cell.textContent = String(i + 1);
      cell.dataset.line = String(i);
      cell.setAttribute('draggable', 'true');
      g.appendChild(cell);
    }
    g.scrollTop = ed.scrollTop;
    refreshLineHighlight();
  }

  /* Bandes de surbrillance pleine largeur pour les lignes sélectionnées.
     Réutilise la géométrie des cellules de gouttière (déjà alignées au pixel
     près sur les lignes de l'éditeur) ; la couche est translatée en sync avec
     le défilement vertical de l'éditeur. */
  function refreshLineHighlight() {
    const ed    = scriptEditorEl();
    const g     = scriptGutterEl();
    const inner = document.getElementById('pfScriptLineHLInner');
    if (!ed || !g || !inner) return;
    inner.replaceChildren();
    gutterSel.forEach(function (i) {
      const cell = g.children[i];
      if (!cell) return;
      const band = document.createElement('div');
      band.className = 'pf-line-hl-band';
      band.style.top    = cell.offsetTop + 'px';
      band.style.height = cell.offsetHeight + 'px';
      inner.appendChild(band);
    });
    inner.style.transform = 'translateY(' + (-ed.scrollTop) + 'px)';
  }
  function syncLineHighlightScroll() {
    const ed    = scriptEditorEl();
    const inner = document.getElementById('pfScriptLineHLInner');
    if (ed && inner) inner.style.transform = 'translateY(' + (-ed.scrollTop) + 'px)';
  }

  function clearGutterSelection() {
    if (!gutterSel.size) return;
    gutterSel.clear(); gutterAnchor = null;
    refreshScriptGutter();
  }

  function deleteSelectedLines() {
    if (!gutterSel.size) return;
    const lines = getScriptLines();
    const keep  = lines.filter(function (_, i) { return !gutterSel.has(i); });
    gutterSel.clear(); gutterAnchor = null;
    setScriptLines(keep.length ? keep : [[]]);
  }

  function onGutterClick(e) {
    const cell = e.target.closest('.pf-gutter-num');
    if (!cell) return;
    const i = +cell.dataset.line;
    if (e.shiftKey && gutterAnchor != null) {
      const lo = Math.min(gutterAnchor, i), hi = Math.max(gutterAnchor, i);
      gutterSel.clear();
      for (let k = lo; k <= hi; k++) gutterSel.add(k);
    } else if (e.ctrlKey || e.metaKey) {
      if (gutterSel.has(i)) gutterSel.delete(i); else gutterSel.add(i);
      gutterAnchor = i;
    } else {
      gutterSel.clear(); gutterSel.add(i); gutterAnchor = i;
    }
    refreshScriptGutter();
  }

  function clearDropMarkers() {
    const g = scriptGutterEl();
    if (!g) return;
    g.querySelectorAll('.drop-before, .drop-after').forEach(function (c) {
      c.classList.remove('drop-before', 'drop-after');
    });
  }

  function onGutterDragStart(e) {
    const cell = e.target.closest('.pf-gutter-num');
    if (!cell) return;
    const i = +cell.dataset.line;
    if (!gutterSel.has(i)) { gutterSel.clear(); gutterSel.add(i); gutterAnchor = i; refreshScriptGutter(); }
    dragLines = Array.from(gutterSel).sort(function (a, b) { return a - b; });
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragLines.join(',')); } catch (_) {}
    scriptGutterEl().querySelectorAll('.pf-gutter-num').forEach(function (c) {
      if (gutterSel.has(+c.dataset.line)) c.classList.add('dragging');
    });
  }
  function onGutterDragOver(e) {
    if (!dragLines) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDropMarkers();
    const cell = e.target.closest('.pf-gutter-num');
    if (!cell) return;
    const r = cell.getBoundingClientRect();
    const after = (e.clientY - r.top) > r.height / 2;
    cell.classList.add(after ? 'drop-after' : 'drop-before');
  }
  function onGutterDragLeave() { clearDropMarkers(); }
  function onGutterDrop(e) {
    if (!dragLines) return;
    e.preventDefault();
    const cell = e.target.closest('.pf-gutter-num');
    let boundary;
    if (!cell) {
      boundary = scriptLineCount();
    } else {
      const idx = +cell.dataset.line;
      const r = cell.getBoundingClientRect();
      boundary = ((e.clientY - r.top) > r.height / 2) ? idx + 1 : idx;
    }
    const moved     = dragLines.slice();
    const movedSet  = new Set(moved);
    const lines     = getScriptLines();
    const movedRows = moved.map(function (i) { return lines[i]; });
    const remaining = lines.filter(function (_, i) { return !movedSet.has(i); });
    let shift = 0; moved.forEach(function (i) { if (i < boundary) shift++; });
    const insertAt = boundary - shift;
    remaining.splice.apply(remaining, [insertAt, 0].concat(movedRows));
    gutterSel = new Set();
    for (let k = 0; k < movedRows.length; k++) gutterSel.add(insertAt + k);
    gutterAnchor = insertAt;
    dragLines = null;
    setScriptLines(remaining);
  }
  function onGutterDragEnd() {
    dragLines = null;
    clearDropMarkers();
    const g = scriptGutterEl();
    if (g) g.querySelectorAll('.dragging').forEach(function (c) { c.classList.remove('dragging'); });
  }

  /* ── Find / Replace (CSS Custom Highlight API) ── */
  let findOpen   = false;
  let findMatches = [];           /* [{start,end}] en offsets logiques */
  let findIndex   = -1;
  const findOpts  = { case: false, word: false, regex: false };

  function findSupportsHighlight() {
    return typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
  }
  function findEl(id) { return document.getElementById(id); }

  /* Texte source aligné sur les offsets logiques (nl = 1 char, param = son texte). */
  function findSourceText() {
    const ed = scriptEditorEl();
    if (!ed) return '';
    let t = '';
    serializeEditor(ed).forEach(function (s) {
      if (s.t === 'nl') t += '\n';
      else if (s.t === 'param') t += s.text;
      else t += s.v;
    });
    return t;
  }

  /* Position (node, offset) DOM correspondant à un offset logique. */
  function findLocate(div, target) {
    let remaining = target;
    const kids = div.childNodes;
    for (let i = 0; i < kids.length; i++) {
      const ch = kids[i];
      if (ch.nodeType === Node.TEXT_NODE) {
        if (remaining <= ch.nodeValue.length) return { node: ch, offset: remaining };
        remaining -= ch.nodeValue.length;
      } else if (ch.nodeName === 'BR') {
        if (ch.classList && ch.classList.contains('pf-eol')) continue;
        if (remaining <= 0) return { node: div, offset: i };
        remaining -= 1;
      } else if (ch.classList && ch.classList.contains('pf-param-tag')) {
        const len = ch.textContent.length;
        if (remaining <= 0)   return { node: div, offset: i };
        if (remaining <= len) return { node: div, offset: i + 1 };
        remaining -= len;
      } else {
        const len = ch.textContent.length;
        if (remaining <= len) return { node: ch.firstChild || ch, offset: remaining };
        remaining -= len;
      }
    }
    return { node: div, offset: kids.length };
  }
  function findBuildRange(start, end) {
    const div = scriptEditorEl();
    const a = findLocate(div, start), b = findLocate(div, end);
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    return r;
  }

  function findBuildRegex(query) {
    if (!query) return null;
    let src = findOpts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (findOpts.word) src = '\\b(?:' + src + ')\\b';
    try { return new RegExp(src, 'g' + (findOpts.case ? '' : 'i')); }
    catch (e) { return null; }
  }

  function findClearHighlights() {
    if (!findSupportsHighlight()) return;
    CSS.highlights.delete('pf-find');
    CSS.highlights.delete('pf-find-current');
  }
  function findApplyHighlights() {
    if (!findSupportsHighlight()) return;
    const all = new Highlight();
    findMatches.forEach(function (m) {
      try { all.add(findBuildRange(m.start, m.end)); } catch (e) {}
    });
    all.priority = 0;
    CSS.highlights.set('pf-find', all);
    const cur = new Highlight();
    if (findIndex >= 0 && findMatches[findIndex]) {
      try { cur.add(findBuildRange(findMatches[findIndex].start, findMatches[findIndex].end)); } catch (e) {}
    }
    cur.priority = 1;
    CSS.highlights.set('pf-find-current', cur);
  }

  function findUpdateCount() {
    const c = findEl('pfFindCount');
    if (c) c.textContent = findMatches.length ? (findIndex + 1) + '/' + findMatches.length : '0/0';
  }
  function findScrollTo(i) {
    const m = findMatches[i];
    if (!m) return;
    const ed = scriptEditorEl();
    let r; try { r = findBuildRange(m.start, m.end); } catch (e) { return; }
    const rect = r.getBoundingClientRect(), erect = ed.getBoundingClientRect();
    if (rect.height || rect.width) {
      if (rect.top < erect.top + 4 || rect.bottom > erect.bottom - 4)
        ed.scrollTop += (rect.top - erect.top) - ed.clientHeight / 2 + rect.height / 2;
      if (rect.left < erect.left + 4 || rect.right > erect.right - 4)
        ed.scrollLeft += (rect.left - erect.left) - ed.clientWidth / 2 + rect.width / 2;
    }
    const g = scriptGutterEl(); if (g) g.scrollTop = ed.scrollTop;
  }

  function runFind(doScroll) {
    const input = findEl('pfFindInput');
    const q = input ? input.value : '';
    findClearHighlights();
    findMatches = []; findIndex = -1;
    if (input) input.classList.remove('pf-find-error');
    if (!q) { findUpdateCount(); return; }
    const re = findBuildRegex(q);
    if (!re) { if (input) input.classList.add('pf-find-error'); findUpdateCount(); return; }
    const text = findSourceText();
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '') { re.lastIndex++; continue; }
      findMatches.push({ start: m.index, end: m.index + m[0].length });
      if (findMatches.length > 5000) break; /* garde-fou */
    }
    if (findMatches.length) findIndex = 0;
    findApplyHighlights();
    findUpdateCount();
    if (doScroll && findIndex >= 0) findScrollTo(findIndex);
  }
  function findNav(delta) {
    if (!findMatches.length) return;
    findIndex = (findIndex + delta + findMatches.length) % findMatches.length;
    findApplyHighlights();
    findUpdateCount();
    findScrollTo(findIndex);
  }

  function findExpandRepl(tpl, groups) {
    if (!findOpts.regex) return tpl;
    return tpl.replace(/\$(\d+)/g, function (_, d) { const g = groups[+d - 1]; return g != null ? g : ''; });
  }
  function findReplaceCurrent() {
    if (findIndex < 0 || !findMatches[findIndex]) return;
    const re = findBuildRegex(findEl('pfFindInput').value);
    if (!re) return;
    const repTpl = findEl('pfReplaceInput').value;
    const text = findSourceText();
    let count = -1;
    const newText = text.replace(re, function (match) {
      count++;
      if (count !== findIndex) return match;
      const groups = Array.prototype.slice.call(arguments, 1, arguments.length - 2);
      return findExpandRepl(repTpl, groups);
    });
    loadTextIntoEditor('pfScriptEditor', newText);
    /* loadTextIntoEditor → highlightEditor → runFind(false) ; on avance ensuite. */
    if (findMatches.length) { findIndex = Math.min(findIndex, findMatches.length - 1); findApplyHighlights(); findUpdateCount(); findScrollTo(findIndex); }
  }
  function findReplaceAll() {
    const re = findBuildRegex(findEl('pfFindInput').value);
    if (!re) return;
    const repTpl = findEl('pfReplaceInput').value;
    const text = findSourceText();
    const newText = text.replace(re, function (match) {
      const groups = Array.prototype.slice.call(arguments, 1, arguments.length - 2);
      return findExpandRepl(repTpl, groups);
    });
    loadTextIntoEditor('pfScriptEditor', newText);
    runFind(true);
  }

  function findToggleOpt(key, btn) {
    findOpts[key] = !findOpts[key];
    btn.setAttribute('aria-pressed', findOpts[key] ? 'true' : 'false');
    runFind(true);
  }
  function openFind() {
    const w = findEl('pfFindWidget');
    if (!w) return;
    findOpen = true;
    w.hidden = false;
    const btn = findEl('pfScriptFind'); if (btn) btn.classList.add('active');
    const input = findEl('pfFindInput');
    if (input) {
      const sel = window.getSelection();
      const selText = sel && sel.rangeCount ? sel.toString() : '';
      if (selText && selText.indexOf('\n') === -1) input.value = selText;
      input.focus(); input.select();
    }
    runFind(true);
  }
  function closeFind() {
    findOpen = false;
    const w = findEl('pfFindWidget'); if (w) w.hidden = true;
    const btn = findEl('pfScriptFind'); if (btn) btn.classList.remove('active');
    findClearHighlights();
    findMatches = []; findIndex = -1;
    findUpdateCount();
    const ed = scriptEditorEl(); if (ed) ed.focus();
  }
  function toggleFind() { findOpen ? closeFind() : openFind(); }

  function onFindInputKey(e) {
    if (e.key === 'Enter')      { e.preventDefault(); findNav(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
  }

  /* Touches globales du Script Builder : Suppr (lignes sélectionnées) + Échap. */
  function onScriptToolsKey(e) {
    if (!scriptViewActive) return;
    if (e.key === 'Escape') {
      const descPanel = document.getElementById('pfScriptDescPanel');
      if (findOpen) { closeFind(); }
      else if (descPanel && !descPanel.hidden) { closeScriptDescPanel(); }
      else if (gutterSel.size) { clearGutterSelection(); }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && gutterSel.size) {
      const a = document.activeElement;
      const typing = a && (a.id === 'pfScriptEditor' || a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
      if (typing) return;
      e.preventDefault();
      deleteSelectedLines();
    }
  }

  /* Câblage (appelé à l'init ; les éléments existent déjà dans le DOM). */
  function initScriptTools() {
    const g  = scriptGutterEl();
    const ed = scriptEditorEl();
    if (g) {
      g.addEventListener('click',     onGutterClick);
      g.addEventListener('dragstart', onGutterDragStart);
      g.addEventListener('dragover',  onGutterDragOver);
      g.addEventListener('dragleave', onGutterDragLeave);
      g.addEventListener('drop',      onGutterDrop);
      g.addEventListener('dragend',   onGutterDragEnd);
    }
    if (ed) {
      ed.addEventListener('scroll', function () { if (g) g.scrollTop = ed.scrollTop; syncLineHighlightScroll(); });
      ed.addEventListener('focus',  clearGutterSelection);
    }
    const wire = function (id, ev, fn) { const el = findEl(id); if (el) el.addEventListener(ev, fn); };
    wire('pfScriptFind',  'click', toggleFind);
    wire('pfFindClose',   'click', closeFind);
    wire('pfFindNext',    'click', function () { findNav(1); });
    wire('pfFindPrev',    'click', function () { findNav(-1); });
    wire('pfFindCase',    'click', function (e) { findToggleOpt('case',  e.currentTarget); });
    wire('pfFindWord',    'click', function (e) { findToggleOpt('word',  e.currentTarget); });
    wire('pfFindRegex',   'click', function (e) { findToggleOpt('regex', e.currentTarget); });
    wire('pfFindInput',   'input', function () { runFind(true); });
    wire('pfFindInput',   'keydown', onFindInputKey);
    wire('pfReplaceOne',  'click', findReplaceCurrent);
    wire('pfReplaceAll',  'click', findReplaceAll);
    document.addEventListener('keydown', onScriptToolsKey);
  }

  /* Insère du texte au curseur (Entrée / coller) en convertissant
     \n → <br> et <mot> → balise param, puis place le curseur après. */
  function insertContentAtCaret(div, text) {
    div.focus();
    const hint = div.querySelector('.pf-cmd-hint');
    if (hint) { div.replaceChildren(); if (div.id === 'pfCmdBuilt') selectedTemplate = null; }

    const sel = window.getSelection();
    let range;
    if (sel && sel.rangeCount && div.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0); range.deleteContents();
    } else {
      range = document.createRange(); range.selectNodeContents(div); range.collapse(false);
    }

    const frag = document.createDocumentFragment();
    text.split('\n').forEach(function (line, idx) {
      if (idx > 0) frag.appendChild(document.createElement('br'));
      line.split(/(<[a-zA-Z]+>)/).forEach(function (part) {
        const m = part.match(/^<([a-zA-Z]+)>$/);
        if (m) { frag.appendChild(makeParamTag(part, m[1].toLowerCase())); }
        else if (part) { frag.appendChild(document.createTextNode(part)); }
      });
    });

    const last = frag.lastChild;
    range.insertNode(frag);
    if (last) {
      const r = document.createRange();
      r.setStartAfter(last); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
    }
  }

  /* Insère un saut de ligne (Entrée) de façon canonique (<br>). */
  function insertNewlineAtCaret(div) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (!div.contains(r.startContainer)) return;
    r.deleteContents();
    const br = document.createElement('br');
    r.insertNode(br);
    r.setStartAfter(br); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
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
          entry.cmd.toLowerCase().indexOf(q)  !== -1 ||
          (entry.desc || '').toLowerCase().indexOf(q) !== -1) {
        matches.push({ label: entry.name || entry.cmd, cmd: entry.cmd, desc: entry.desc || null });
      }
    });

    const ddOverrides = loadOverrides();
    PF_COMMANDS.forEach(function (entry) {
      const ov = ddOverrides[entry.cmd];
      if (entry.cmd.toLowerCase().indexOf(q) !== -1 ||
          entry.g.toLowerCase().indexOf(q)   !== -1 ||
          entry.s.toLowerCase().indexOf(q)   !== -1 ||
          (ov && ((ov.title || '').toLowerCase().indexOf(q) !== -1 ||
                  (ov.cmd   || '').toLowerCase().indexOf(q) !== -1 ||
                  (ov.desc  || '').toLowerCase().indexOf(q) !== -1))) {
        matches.push({ label: (ov && ov.cmd) || entry.cmd, cmd: (ov && ov.cmd) || entry.cmd, desc: (ov && ov.desc) || null });
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

    highlightEditor(div);
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
    gutterSel.clear(); gutterAnchor = null;
    refreshScriptGutter();
    updateScriptDescUI();
    document.getElementById('pfScriptEditor')?.focus();
  }

  function hideScriptView() {
    document.getElementById('pfScriptView').hidden = true;
    document.getElementById('pfCmdView').hidden    = false;
    document.getElementById('pfSearchBar').classList.remove('pf-search-bar--script');
    document.getElementById('pfScriptToggle').classList.remove('active');
    scriptViewActive = false;
    if (findOpen) closeFind();
    closeScriptDescPanel();
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
      badge.title       = 'Commande modifiée : voir le Gestionnaire pour restaurer';
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
          setDescBar(entry.desc || null);
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
      return !q || e.name.toLowerCase().indexOf(q) !== -1 || e.cmd.toLowerCase().indexOf(q) !== -1 ||
             (e.desc || '').toLowerCase().indexOf(q) !== -1;
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

    const clOverrides = loadOverrides();
    PF_COMMANDS.forEach(function (entry) {
      const ov = clOverrides[entry.cmd];
      if (q &&
          entry.cmd.toLowerCase().indexOf(q) === -1 &&
          entry.g.toLowerCase().indexOf(q)   === -1 &&
          entry.s.toLowerCase().indexOf(q)   === -1 &&
          !(ov && ((ov.title || '').toLowerCase().indexOf(q) !== -1 ||
                   (ov.cmd   || '').toLowerCase().indexOf(q) !== -1 ||
                   (ov.desc  || '').toLowerCase().indexOf(q) !== -1))) return;

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
    const descInp = document.getElementById('pfModalDesc');
    const favChk  = document.getElementById('pfModalFav');
    if (!modal) return;
    if (preview) preview.textContent = cmd;
    if (nameInp) nameInp.value = '';
    if (descInp) descInp.value = '';
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
    const desc  = (document.getElementById('pfModalDesc')?.value || '').trim();
    const isFav = document.getElementById('pfModalFav')?.checked;
    saveCommand(name, cmd, desc);
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

    /* Import / Export */
    if (e.target.closest('#pfManagerExport')) { showExportModal(); return; }
    if (e.target.closest('#pfManagerImport')) { showImportModal(); return; }
    if (e.target.closest('#pfExportClose') || e.target.closest('#pfExportCancel')) { hideExportModal(); return; }
    if (e.target.id === 'pfExportModal')      { hideExportModal(); return; }
    if (e.target.closest('#pfExportAll'))     { setAllIo('pfExportTree', true);  updateExportCount(); return; }
    if (e.target.closest('#pfExportNone'))    { setAllIo('pfExportTree', false); updateExportCount(); return; }
    if (e.target.closest('#pfExportCopy'))    { copyExportCode(); return; }
    if (e.target.closest('#pfExportDownload')){ downloadExportPackage(); return; }
    if (e.target.closest('#pfImportClose') || e.target.closest('#pfImportCancel')) { hideImportModal(); return; }
    if (e.target.id === 'pfImportModal')      { hideImportModal(); return; }
    if (e.target.closest('#pfImportFileBtn')) { document.getElementById('pfImportFile').click(); return; }
    if (e.target.closest('#pfImportAnalyze')) { analyzeImportCode(); return; }
    if (e.target.closest('#pfImportAll'))     { setAllIo('pfImportTree', true);  updateImportCount(); return; }
    if (e.target.closest('#pfImportNone'))    { setAllIo('pfImportTree', false); updateImportCount(); return; }
    if (e.target.closest('#pfImportApply'))   { applyImport(); return; }

    /* Description */
    if (e.target.closest('#pfDescToggle'))     { toggleDescContent('pfDescContent'); return; }
    if (e.target.closest('#pfScriptDescBtn'))  { toggleScriptDescPanel();             return; }
    if (e.target.closest('#pfScriptDescClose')){ closeScriptDescPanel();              return; }

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
      gutterSel.clear(); gutterAnchor = null;
      refreshScriptGutter();
      if (findOpen) runFind(false);
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

    /* Bloc de base — effacer */
    if (e.target.closest('#pfCmdClear')) {
      selectedTemplate = null;
      activeParamTag   = null;
      renderBuiltCommand();   /* réaffiche le hint */
      setDescBar(null);
      document.querySelectorAll('.pf-cmd-item-wrap.selected').forEach(function (el) { el.classList.remove('selected'); });
      return;
    }

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

    /* Éditeurs : saut de ligne canonique (<br>) puis recoloration */
    if (e.target.id === 'pfCmdBuilt' || e.target.id === 'pfScriptEditor') {
      e.preventDefault();
      insertNewlineAtCaret(e.target);
      highlightEditor(e.target);
      return;
    }

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
    if (e.target.id === 'pfCmdBuilt' || e.target.id === 'pfScriptEditor') {
      if (e.isComposing) return;            /* ne pas casser la saisie IME */
      autoConvertParams(e.target);
      highlightEditor(e.target);
    }
  });

  /* Collage dans les éditeurs : texte brut (convertit \n et <param>) puis recolore */
  document.addEventListener('paste', function (e) {
    const div = e.target.closest && e.target.closest('#pfCmdBuilt, #pfScriptEditor');
    if (!div) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    insertContentAtCaret(div, text);
    highlightEditor(div);
  });

  /* Sauvegarde la position du curseur dès que le script editor perd le focus
     (le clic sur le bouton "injecter" déplace le focus avant que l'action s'exécute) */
  document.addEventListener('change', function (e) {
    if (e.target.name === 'pfMgrCat') {
      renderSubcatField(e.target.value);
    }
    if (e.target.id === 'pfImportFile') {
      const f = e.target.files && e.target.files[0];
      if (f) handleImportFile(f);
      e.target.value = '';   /* permet de réimporter le même fichier */
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
     PONT PROFILS ← shell (postMessage : query/clear → stats)
     ════════════════════════════════════════════════════════════ */
  function pfProfileStats() {
    var blocks = null;
    try { blocks = JSON.parse(localStorage.getItem(BLOCKS_KEY)); } catch (e) {}
    return {
      saved:          loadSaved().length,
      favorites:      loadFavorites().size,
      blocksCustom:   blocks !== null,
      blocksCount:    Array.isArray(blocks) ? blocks.length : null,
      customCmds:     loadCustomCmds().length,
      overrides:      Object.keys(loadOverrides()).length,
      groups:         loadCustomGroups().length,
      groupOverrides: Object.keys(loadGroupOverrides()).length
    };
  }
  function postPfStats() {
    try { parent.postMessage({ type: 'pf-profile-stats', stats: pfProfileStats() }, '*'); } catch (e) {}
  }
  function refreshPfView() {
    try {
      renderSidebar();
      var cs = document.getElementById('pfCmdSearch');
      renderCommandList(cs ? cs.value : '');
      var ms = document.getElementById('pfManagerSearch');
      renderManagerList(ms ? ms.value : '');
    } catch (e) {}   /* un rendu en échec ne doit pas bloquer les réponses du pont */
  }
  function pfClearTarget(target) {
    function rm(k) { try { localStorage.removeItem(k); } catch (e) {} }
    if      (target === 'saved')     rm(SAVE_KEY);
    else if (target === 'favorites') rm(FAV_KEY);
    else if (target === 'blocks')    rm(BLOCKS_KEY);
    else if (target === 'imports')   { rm(CUSTOM_KEY); rm(OVERRIDES_KEY); rm(GROUPS_KEY); rm(GROUP_OVERRIDES_KEY); }
    else if (target === 'all')       { [SAVE_KEY, FAV_KEY, BLOCKS_KEY, CUSTOM_KEY, OVERRIDES_KEY, GROUPS_KEY, GROUP_OVERRIDES_KEY].forEach(rm); }
    else return;
    refreshPfView();
  }
  /* Inspecteur de stockage : dump/suppression des clés psforge_* */
  function postPfStorage() {
    var entries = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('psforge') === 0) entries.push({ key: k, value: localStorage.getItem(k) });
      }
    } catch (e) {}
    try { parent.postMessage({ type: 'pf-storage-data', entries: entries }, '*'); } catch (e) {}
  }
  function pfStorageClearAll() {
    try {
      var ks = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('psforge') === 0) ks.push(k); }
      ks.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    refreshPfView();
  }
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || !d.type) return;
    if (d.type === 'pf-profile-query')       { postPfStats(); }
    else if (d.type === 'pf-profile-clear')  { pfClearTarget(d.target); postPfStats(); }
    else if (d.type === 'pf-storage-list')   { postPfStorage(); }
    else if (d.type === 'pf-storage-remove') { try { localStorage.removeItem(d.key); } catch (er) {} refreshPfView(); postPfStorage(); postPfStats(); }
    else if (d.type === 'pf-storage-clear')  { pfStorageClearAll(); postPfStorage(); postPfStats(); }
  });

  /* ════════════════════════════════════════════════════════════
     INIT
     ════════════════════════════════════════════════════════════ */
  renderSidebar();
  renderCommandList();
  initDragDrop();
  initScriptTools();

  /* Embarqué : 1ers instantanés poussés au shell dès l'init (anti-course) */
  if (window.self !== window.top) { postPfStats(); postPfStorage(); }

})();
