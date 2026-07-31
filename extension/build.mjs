#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────────
   build.mjs — produit les artefacts de distribution de l'extension.

   Deux variantes sont générées depuis la même source, parce qu'elles ne peuvent
   PAS partager le même manifest :
     • magasins (Chrome Web Store / Edge Add-ons) → manifest inchangé.
       Un « update_url » hors magasin ferait rejeter l'envoi.
     • auto-hébergé (CRX + updates.xml)           → manifest enrichi d'« update_url ».

   Usage :
     node extension/build.mjs                     # ZIP magasin uniquement
     node extension/build.mjs --pem <clé.pem>     # ZIP + CRX + updates.xml
     node extension/build.mjs --id --pem <clé.pem> # affiche seulement l'identifiant

   Sortie dans extension/dist/ (ignoré par git).
   ────────────────────────────────────────────────────────────────────────────── */

import { createHash, createPublicKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const DIST = join(EXT_DIR, 'dist');

/* Configuration locale, hors dépôt : origine réelle de l'application et URL
   d'hébergement du CRX (jeton SAS compris). Voir local-config.example.json. */
const CONFIG_PATH = join(EXT_DIR, 'local-config.json');
const ORIGIN_FILE = join(EXT_DIR, 'app-origin.js');

/* Fichiers embarqués dans les paquets : liste explicite, pour ne jamais expédier
   le script de build, la documentation interne ou les artefacts précédents. */
const RUNTIME_FILES = ['manifest.json', 'popup.html', 'popup.css', 'popup.js', 'tp-core.js', 'tp-net.js', 'sync.js', 'background.js', 'app-origin.js'];
const RUNTIME_DIRS  = ['assets'];

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.error(`Configuration absente : ${CONFIG_PATH}`);
    console.error('Copiez local-config.example.json en local-config.json et renseignez vos valeurs.');
    process.exit(1);
  }
  let cfg;
  try { cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); }
  catch (e) { console.error(`local-config.json illisible : ${e.message}`); process.exit(1); }
  const origin = (cfg.appOrigin || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^/\s]+$/.test(origin)) {
    console.error("« appOrigin » doit être une origine https sans chemin, par exemple https://exemple.azurestaticapps.net");
    process.exit(1);
  }
  /* Le manifest cible « https://*.azurestaticapps.net/* » : hors de ce domaine, le
     script de contenu ne serait jamais injecté et le miroir ne fonctionnerait pas. */
  if (!/\.azurestaticapps\.net$/.test(new URL(origin).hostname)) {
    console.error(`« appOrigin » (${origin}) n'est pas un hôte *.azurestaticapps.net : le motif « matches » du manifest ne l'atteindrait pas.`);
    process.exit(1);
  }
  return { ...cfg, appOrigin: origin };
}

/* Écrit app-origin.js — la seule définition de TP_APP_ORIGIN, hors dépôt.
   Chargé aussi bien par la popup que comme premier script de contenu. */
function writeOriginFile(path, origin) {
  writeFileSync(path,
    '/* Généré par build.mjs depuis local-config.json — ne pas versionner.\n'
    + "   Origine de l'application TenantPulse : garde-fou du script de contenu,\n"
    + "   appel /api/me et lien d'analyse approfondie. */\n"
    + `const TP_APP_ORIGIN = ${JSON.stringify(origin)};\n`, 'utf8');
}

// ── Arguments ──
const argv = process.argv.slice(2);
const pemPath = (() => {
  const i = argv.indexOf('--pem');
  return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : null;
})();
const idOnly = argv.includes('--id');

// ── Identifiant d'extension dérivé de la clé privée ──
/* Chromium calcule l'identifiant à partir du SHA-256 de la clé publique DER :
   les 16 premiers octets, chaque quartet traduit en lettre a–p. */
function publicKeyDer(pem) {
  return createPublicKey(pem).export({ type: 'spki', format: 'der' });
}
function extensionIdFromPem(pem) {
  const hash = createHash('sha256').update(publicKeyDer(pem)).digest();
  let id = '';
  for (const byte of hash.subarray(0, 16)) {
    id += String.fromCharCode(97 + (byte >> 4)) + String.fromCharCode(97 + (byte & 0x0f));
  }
  return id;
}

// ── Copie de l'arborescence d'exécution ──
function stageRuntime(target) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const f of RUNTIME_FILES) cpSync(join(EXT_DIR, f), join(target, f));
  for (const d of RUNTIME_DIRS)  cpSync(join(EXT_DIR, d), join(target, d), { recursive: true });
}

// ── Archive ZIP ──
/* Écriture directe du format ZIP plutôt qu'un appel à un outil du système :
   Compress-Archive comme ZipFile.CreateFromDirectory (sous .NET Framework) écrivent
   les chemins de sous-dossiers avec des « \ », en violation du format, ce qui casse
   la lecture par d'autres outils et peut faire échouer l'envoi au magasin.
   Horodatage fixé au 1er janvier 1980 pour que deux builds d'une même source soient
   octet pour octet identiques. */
const DOS_TIME = 0x0000;
const DOS_DATE = 0x0021; // 1980-01-01

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/* Liste les fichiers d'un dossier, récursivement, en chemins relatifs à séparateur « / ». */
function listFiles(root, prefix = '') {
  const out = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(root, rel));
    else out.push(rel);
  }
  return out;
}

function zipDir(srcDir, zipPath) {
  const local = [];
  const central = [];
  let offset = 0;

  for (const name of listFiles(srcDir)) {
    const raw = readFileSync(join(srcDir, name));
    const deflated = deflateRawSync(raw, { level: 9 });
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(raw);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);   // signature
    lh.writeUInt16LE(20, 4);           // version nécessaire
    lh.writeUInt16LE(0, 6);            // drapeaux
    lh.writeUInt16LE(8, 8);            // méthode : deflate
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(deflated.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);           // champ « extra » absent
    local.push(lh, nameBuf, deflated);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);           // version d'écriture
    cd.writeUInt16LE(20, 6);           // version nécessaire
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(deflated.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);           // extra
    cd.writeUInt16LE(0, 32);           // commentaire
    cd.writeUInt16LE(0, 34);           // disque de départ
    cd.writeUInt16LE(0, 36);           // attributs internes
    cd.writeUInt32LE(0, 38);           // attributs externes
    cd.writeUInt32LE(offset, 42);      // position de l'en-tête local
    central.push(cd, nameBuf);

    offset += lh.length + nameBuf.length + deflated.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(central.length / 2, 8);
  eocd.writeUInt16LE(central.length / 2, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  writeFileSync(zipPath, Buffer.concat([...local, centralBuf, eocd]));
}

// ── Empaquetage CRX ──
/* Signature déléguée au navigateur (« --pack-extension »), seule méthode
   officiellement supportée pour produire un CRX3 valide.
   --user-data-dir sur un dossier temporaire est indispensable : sans lui, un
   navigateur déjà lancé récupère la commande et l'empaquetage n'a pas lieu. */
function findBrowser() {
  const candidates = process.platform === 'win32' ? [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ] : [
    '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return candidates.find(p => existsSync(p)) || null;
}

function packCrx(stagedDir, pem, outCrx) {
  const browser = findBrowser();
  if (!browser) {
    throw new Error("Aucun navigateur Chromium trouvé pour signer le CRX. Empaquetez à la main via edge://extensions → « Empaqueter l'extension ».");
  }
  const profile = mkdtempSync(join(tmpdir(), 'tp-pack-'));
  try {
    execFileSync(browser, [
      `--pack-extension=${stagedDir}`,
      `--pack-extension-key=${pem}`,
      `--user-data-dir=${profile}`,
      '--no-first-run', '--no-default-browser-check',
    ], { stdio: 'inherit' });
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
  // Le navigateur écrit « <dossier>.crx » à côté du dossier empaqueté.
  const produced = stagedDir + '.crx';
  if (!existsSync(produced)) throw new Error(`Le navigateur n'a pas produit ${produced}.`);
  rmSync(outCrx, { force: true });
  renameSync(produced, outCrx);
  return browser;
}

// ── Manifeste de mise à jour ──
function writeUpdatesXml(id, version, crxUrl, path) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Manifeste de mise à jour de l'extension TenantPulse (distribution auto-hébergée).
     Interrogé anonymement par le navigateur ; les URLs doivent rester stables. -->
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="${id}">
    <updatecheck codebase="${crxUrl.replace(/&/g, '&amp;')}" version="${version}" />
  </app>
</gupdate>
`;
  writeFileSync(path, xml, 'utf8');
}

// ── Exécution ──
const manifest = JSON.parse(readFileSync(join(EXT_DIR, 'manifest.json'), 'utf8'));
const version = manifest.version;

if (idOnly) {
  if (!pemPath) { console.error('--id requiert --pem <clé.pem>'); process.exit(1); }
  console.log(extensionIdFromPem(readFileSync(pemPath, 'utf8')));
  process.exit(0);
}

if (manifest.update_url) {
  console.error("manifest.json ne doit PAS contenir « update_url » : il est injecté par ce script pour la seule variante auto-hébergée.");
  process.exit(1);
}

const config = loadConfig();
/* app-origin.js est écrit aussi dans extension/ : c'est ce qui rend le dossier source
   chargeable directement en mode développeur, sans passer par dist/. */
writeOriginFile(ORIGIN_FILE, config.appOrigin);

mkdirSync(DIST, { recursive: true });
const results = [];

// 1) Variante magasins — manifest inchangé.
//    Conservée comme repli : la distribution retenue est la politique d'entreprise,
//    aucun magasin ne permettant de restreindre une extension à une organisation.
const storeDir = join(DIST, 'store');
stageRuntime(storeDir);
const storeZip = join(DIST, `tenantpulse-extension-store-${version}.zip`);
zipDir(storeDir, storeZip);
results.push(['ZIP magasins (repli)', storeZip]);

// 2) Variante auto-hébergée — manifest + update_url, puis signature
if (pemPath) {
  if (!existsSync(pemPath)) { console.error(`Clé introuvable : ${pemPath}`); process.exit(1); }
  for (const champ of ['updateUrl', 'crxUrl']) {
    if (!/^https:\/\/\S+$/.test(config[champ] || '') || config[champ].includes('<')) {
      console.error(`« ${champ} » manquant ou non renseigné dans local-config.json : la variante auto-hébergée en a besoin.`);
      console.error("Créez d'abord l'hébergement (conteneur Blob privé + jeton SAS), puis reportez les URL ici.");
      process.exit(1);
    }
  }
  const pem = readFileSync(pemPath, 'utf8');
  const id = extensionIdFromPem(pem);

  const selfDir = join(DIST, 'selfhosted');
  stageRuntime(selfDir);
  /* « key » : clé publique de signature. Elle garantit que ce dossier, chargé en mode
     développeur, porte le MÊME identifiant que le CRX signé — indispensable pour tester
     une politique d'entreprise avant publication. À ne jamais mettre dans la variante
     magasin, qui reçoit son identifiant du magasin lui-même. */
  writeFileSync(join(selfDir, 'manifest.json'),
    JSON.stringify({ ...manifest, key: publicKeyDer(pem).toString('base64'), update_url: config.updateUrl }, null, 2) + '\n', 'utf8');

  const crx = join(DIST, 'tenantpulse-extension.crx');
  packCrx(selfDir, pemPath, crx);
  const xml = join(DIST, 'updates.xml');
  writeUpdatesXml(id, version, config.crxUrl, xml);

  results.push(['CRX auto-hébergé', crx], ['Manifeste de mise à jour', xml]);
  console.log(`\nIdentifiant de l'extension (à utiliser dans les politiques) : ${id}`);
} else {
  console.log("\nVariante auto-hébergée ignorée (pas de --pem). Voir extension/README.md.");
}

console.log(`\nVersion ${version} — artefacts dans ${DIST} :`);
for (const [label, path] of results) console.log(`  • ${label.padEnd(26)} ${path}`);
