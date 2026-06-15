const { v4: uuidv4 } = require("uuid");
const { getAuthContext } = require("../shared/auth");
const { processesClient } = require("../shared/tableClient");
const { processesContainer, ensureContainer } = require("../shared/blobClient");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IMG_BYTES = 3 * 1024 * 1024; // 3 Mo par image

// Types d'image autorisés → extension. (Pas de SVG : vecteur d'injection potentiel.)
const ALLOWED = {
  "image/png":  "png",
  "image/jpeg": "jpg",
  "image/gif":  "gif",
  "image/webp": "webp"
};

function json(status, obj) {
  return { status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

function imgPath(processId, name) {
  return `${processId}/img/${name}`;
}

/**
 * POST /api/process-image
 *   Body : { processId, contentType, dataBase64 }
 *   Téléverse une image rattachée à un process. Retourne { name, url } ; l'URL
 *   (relative, même origine) est insérable dans le markdown : ![alt](url).
 *   Accessible : tous les utilisateurs connectés.
 *
 * GET /api/process-image?id=<uuid>&name=<fichier>
 *   Sert l'image (même origine → compatible CSP img-src 'self').
 *   Accessible : tous les utilisateurs connectés.
 */
module.exports = async function (context, req) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return void (context.res = json(401, { error: "Non authentifié" }));
    if (auth.blocked) return void (context.res = json(403, { error: "Accès refusé" }));

    await ensureContainer();

    // ── GET : sert l'image ──────────────────────────────────────────────────
    if (req.method === "GET") {
      const id = (req.query.id || "").trim();
      const name = (req.query.name || "").trim();
      if (!UUID_RE.test(id) || !/^[a-z0-9._-]+$/i.test(name)) {
        return void (context.res = json(400, { error: "paramètres invalides" }));
      }
      try {
        const blob = processesContainer.getBlockBlobClient(imgPath(id, name));
        const props = await blob.getProperties();
        const buf = await blob.downloadToBuffer();
        context.res = {
          status: 200,
          headers: {
            "Content-Type": props.contentType || "application/octet-stream",
            "Cache-Control": "private, max-age=86400"
          },
          body: buf,
          isRaw: true
        };
      } catch {
        context.res = json(404, { error: "Image introuvable" });
      }
      return;
    }

    // ── POST : téléverse une image ──────────────────────────────────────────
    if (req.method === "POST") {
      const body = req.body || {};
      const processId = (body.processId || "").trim();
      const contentType = (body.contentType || "").trim().toLowerCase();
      const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";

      if (!UUID_RE.test(processId)) return void (context.res = json(400, { error: "processId invalide" }));
      const ext = ALLOWED[contentType];
      if (!ext) return void (context.res = json(400, { error: "type d'image non autorisé (png, jpg, gif, webp)" }));
      if (!dataBase64) return void (context.res = json(400, { error: "dataBase64 manquant" }));

      // Le process doit exister avant qu'on lui rattache une image.
      try { await processesClient.getEntity("process", processId); }
      catch { return void (context.res = json(404, { error: "Process introuvable" })); }

      let buf;
      try { buf = Buffer.from(dataBase64, "base64"); }
      catch { return void (context.res = json(400, { error: "dataBase64 illisible" })); }
      if (!buf.length) return void (context.res = json(400, { error: "image vide" }));
      if (buf.length > MAX_IMG_BYTES) return void (context.res = json(400, { error: "image trop volumineuse (3 Mo max)" }));

      // Nom unique et sûr (pas de nom fourni par le client → pas de traversée de chemin).
      const name = `${uuidv4()}.${ext}`;
      const blob = processesContainer.getBlockBlobClient(imgPath(processId, name));
      await blob.upload(buf, buf.length, { blobHTTPHeaders: { blobContentType: contentType } });

      context.res = json(200, {
        success: true,
        name,
        url: `/api/process-image?id=${processId}&name=${name}`
      });
      return;
    }

    context.res = json(405, { error: "Méthode non supportée" });
  } catch (err) {
    context.log.error("Erreur /api/process-image :", err.message);
    context.res = json(500, { error: "Erreur serveur" });
  }
};
