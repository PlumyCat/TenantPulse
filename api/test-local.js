/**
 * Mini-testeur local — simule le runtime Azure Functions.
 * Usage : node test-local.js
 * Requiert STORAGE_CONNECTION_STRING dans local.settings.json (chargé automatiquement).
 */

// Charge local.settings.json comme le ferait func start
const fs   = require("fs");
const path = require("path");

const settingsPath = path.join(__dirname, "local.settings.json");
if (fs.existsSync(settingsPath)) {
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  Object.assign(process.env, settings.Values || {});
}

const processHandler      = require("./process/index.js");
const processImageHandler = require("./process-image/index.js");

// ── Helpers ────────────────────────────────────────────────────────────────

// Simule le header x-ms-client-principal pour un email donné.
function makePrincipalHeader(email) {
  const payload = JSON.stringify({
    identityProvider: "aad",
    userId:           "test-local",
    userDetails:      email,
    userRoles:        ["authenticated"]
  });
  return Buffer.from(payload).toString("base64");
}

// Contexte Azure Functions minimal.
function makeContext() {
  return {
    log:   { error: (...a) => console.error("[ERR]", ...a) },
    res:   null
  };
}

// Construit une fausse requête.
function makeReq(method, queryOrPath, body, email) {
  const query = typeof queryOrPath === "string"
    ? Object.fromEntries(new URLSearchParams(queryOrPath))
    : (queryOrPath || {});
  return {
    method,
    query,
    body: body || null,
    headers: { "x-ms-client-principal": makePrincipalHeader(email) }
  };
}

async function call(handler, method, queryOrPath, body, email) {
  const ctx = makeContext();
  const req = makeReq(method, queryOrPath, body, email);
  await handler(ctx, req);
  let parsed;
  try { parsed = JSON.parse(ctx.res.body); } catch { parsed = ctx.res.body; }
  return { status: ctx.res.status, body: parsed };
}

function section(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function log(label, res) {
  const ok = res.status >= 200 && res.status < 300;
  console.log(`${ok ? "✓" : "✗"} [${res.status}] ${label}`);
  if (!ok || process.env.VERBOSE) console.log("   →", JSON.stringify(res.body, null, 2));
}

// ── Email à utiliser ────────────────────────────────────────────────────────
// Mets ici l'email présent dans ta table Roles (role=admin ou moderator).
const EMAIL = process.env.TEST_EMAIL || "anthonyrpsup@gmail.com";

// ── Tests ──────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\nTenantPulse — test local des endpoints process`);
  console.log(`Email utilisé : ${EMAIL}`);
  console.log(`(Si 401 : cet email n'est pas dans la table Roles. Change TEST_EMAIL=ton@email.com node test-local.js)\n`);

  // 1. Liste vide (ou existante)
  section("1 · GET /api/process (liste)");
  const liste = await call(processHandler, "GET", "", null, EMAIL);
  log("liste initiale", liste);

  // 2. Créer un process
  section("2 · POST /api/process (création)");
  const create = await call(processHandler, "POST", "", {
    titre:             "Process de test local",
    categorie:         "M365",
    descriptionCourte: "Vérification que la stack Table + Blob fonctionne.",
    contentMarkdown:   "# Process de test\n\nCeci est un **contenu** de test.\n\n## Étape 1\n\nFaire quelque chose."
  }, EMAIL);
  log("création", create);

  if (create.status !== 200) {
    console.log("\n⛔ Arrêt — impossible de continuer sans un ID valide.");
    process.exit(1);
  }
  const id = create.body.id;
  console.log(`   id créé : ${id}`);

  // 3. Relire le process
  section("3 · GET /api/process?id= (lecture complète)");
  const read = await call(processHandler, "GET", `id=${id}`, null, EMAIL);
  log("lecture", read);
  if (read.status === 200) {
    console.log(`   titre    : ${read.body.titre}`);
    console.log(`   markdown : ${read.body.contentMarkdown.slice(0, 60)}…`);
  }

  // 4. Modifier le process
  section("4 · POST /api/process (modification)");
  const update = await call(processHandler, "POST", "", {
    id,
    titre:             "Process de test local (modifié)",
    categorie:         "M365",
    descriptionCourte: "Contenu mis à jour.",
    contentMarkdown:   "# Process modifié\n\nLe contenu a été mis à jour correctement."
  }, EMAIL);
  log("modification", update);

  // 5. Vérifier la liste (doit contenir le process)
  section("5 · GET /api/process (liste après création)");
  const liste2 = await call(processHandler, "GET", "", null, EMAIL);
  log(`liste (${liste2.body.items?.length ?? "?"} entrée(s))`, liste2);

  // 6. Upload d'une image (PNG 1×1 pixel en base64)
  section("6 · POST /api/process-image (upload)");
  const PNG1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const imgUp = await call(processImageHandler, "POST", "", {
    processId:   id,
    contentType: "image/png",
    dataBase64:  PNG1x1
  }, EMAIL);
  log("upload image", imgUp);
  if (imgUp.status === 200) console.log(`   url image : ${imgUp.body.url}`);

  // 7. Relire l'image uploadée
  if (imgUp.status === 200) {
    section("7 · GET /api/process-image (lecture)");
    const imgName = imgUp.body.name;
    const imgRead = await call(processImageHandler, "GET", `id=${id}&name=${imgName}`, null, EMAIL);
    console.log(`${imgRead.status === 200 ? "✓" : "✗"} [${imgRead.status}] lecture image (${imgRead.status === 200 ? "binaire OK" : "erreur"})`);
  }

  // 8. Supprimer le process (nettoyage)
  section("8 · DELETE /api/process (suppression + nettoyage blobs)");
  const del = await call(processHandler, "DELETE", `id=${id}`, { id }, EMAIL);
  log("suppression", del);
  if (del.status === 200) console.log(`   blobs supprimés : ${del.body.removedBlobs}`);

  // 9. Vérifier que c'est bien parti
  section("9 · GET /api/process?id= (doit retourner 404)");
  const readAfter = await call(processHandler, "GET", `id=${id}`, null, EMAIL);
  log("lecture après suppression (404 attendu)", readAfter);

  // ── Résumé ──────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(60)}`);
  console.log("  Terminé. Vérifie dans le portail Azure :");
  console.log("  · Table Storage → Processes  (doit être vide après le test)");
  console.log("  · Blob Storage  → processes  (container créé automatiquement)");
  console.log("═".repeat(60));
})();
