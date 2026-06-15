const { v4: uuidv4 } = require("uuid");
const { getAuthContext, hasRole } = require("../shared/auth");
const { processesClient } = require("../shared/tableClient");
const { processesContainer, ensureContainer } = require("../shared/blobClient");

// Limites de validation (un process ≈ 4 pages Word → ~200 Ko de markdown suffisent).
const MAX_TITRE     = 120;
const MAX_CATEGORIE = 64;
const MAX_DESC       = 300;   // description courte : sert aussi de résumé pour la recherche LLM
const MAX_CONTENT    = 200000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status, obj) {
  return { status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

// Chemin du blob markdown d'un process.
function contentPath(id) {
  return `${id}/content.md`;
}

// Lit le contenu markdown d'un process depuis le Blob (chaîne vide si absent).
async function readContent(id) {
  try {
    const blob = processesContainer.getBlockBlobClient(contentPath(id));
    const buf = await blob.downloadToBuffer();
    return buf.toString("utf-8");
  } catch {
    return "";
  }
}

/**
 * GET /api/process
 *   → liste légère de tous les process (sans le contenu markdown).
 * GET /api/process?id=<uuid>
 *   → un process avec son contenu markdown complet.
 * Accessible : tous les utilisateurs connectés.
 *
 * POST /api/process
 *   Body : { id?, titre, categorie, descriptionCourte, contentMarkdown }
 *   - id absent → création ; id présent → modification (404 si introuvable).
 *   - écrit l'entrée légère en Table Storage + le markdown en Blob Storage.
 *   Accessible : tech minimum (tech, moderator, manager, admin).
 *
 * DELETE /api/process?id=<uuid>  (ou body { id })
 *   Supprime l'entrée Table + le markdown + toutes les images du process.
 *   Accessible : moderator minimum.
 */
module.exports = async function (context, req) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return void (context.res = json(401, { error: "Non authentifié" }));
    if (auth.blocked) return void (context.res = json(403, { error: "Accès refusé" }));

    await ensureContainer();

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const id = (req.query.id || "").trim();

      if (id) {
        if (!UUID_RE.test(id)) return void (context.res = json(400, { error: "id invalide" }));
        let entity;
        try { entity = await processesClient.getEntity("process", id); }
        catch { return void (context.res = json(404, { error: "Process introuvable" })); }

        const contentMarkdown = await readContent(id);
        context.res = json(200, {
          id,
          titre:             entity.titre,
          categorie:         entity.categorie || "",
          descriptionCourte: entity.descriptionCourte || "",
          contentMarkdown,
          createdBy:         entity.createdBy,
          createdAt:         entity.createdAt,
          updatedBy:         entity.updatedBy,
          updatedAt:         entity.updatedAt
        });
        return;
      }

      // Liste légère (pas de contenu markdown — c'est tout l'intérêt du modèle).
      const items = [];
      const results = processesClient.listEntities({ queryOptions: { filter: "PartitionKey eq 'process'" } });
      for await (const e of results) {
        items.push({
          id:                e.rowKey,
          titre:             e.titre,
          categorie:         e.categorie || "",
          descriptionCourte: e.descriptionCourte || "",
          createdAt:         e.createdAt,
          updatedAt:         e.updatedAt
        });
      }
      context.res = json(200, { items });
      return;
    }

    // ── POST (création / modification) ─────────────────────────────────────────
    if (req.method === "POST") {
      if (!hasRole(auth.role, "tech")) {
        return void (context.res = json(403, { error: "Accès refusé — rôle tech ou supérieur requis" }));
      }
      const body = req.body || {};
      const id = (body.id || "").trim();
      const titre = typeof body.titre === "string" ? body.titre.trim() : "";
      const categorie = typeof body.categorie === "string" ? body.categorie.trim() : "";
      const descriptionCourte = typeof body.descriptionCourte === "string" ? body.descriptionCourte.trim() : "";
      const contentMarkdown = typeof body.contentMarkdown === "string" ? body.contentMarkdown : "";

      if (!titre) return void (context.res = json(400, { error: "titre est obligatoire" }));
      if (titre.length > MAX_TITRE) return void (context.res = json(400, { error: `titre trop long (${MAX_TITRE} caractères max)` }));
      if (categorie.length > MAX_CATEGORIE) return void (context.res = json(400, { error: `categorie trop longue (${MAX_CATEGORIE} caractères max)` }));
      if (descriptionCourte.length > MAX_DESC) return void (context.res = json(400, { error: `descriptionCourte trop longue (${MAX_DESC} caractères max)` }));
      if (contentMarkdown.length > MAX_CONTENT) return void (context.res = json(400, { error: `contenu trop volumineux (${MAX_CONTENT} caractères max)` }));
      if (id && !UUID_RE.test(id)) return void (context.res = json(400, { error: "id invalide (UUID attendu)" }));

      const now = new Date().toISOString();
      const isUpdate = !!id;
      const pid = id || uuidv4();

      let createdBy = auth.email;
      let createdAt = now;
      if (isUpdate) {
        // Édition : l'entité doit exister ; on préserve createdBy/createdAt d'origine.
        try {
          const ex = await processesClient.getEntity("process", pid);
          createdBy = ex.createdBy || auth.email;
          createdAt = ex.createdAt || now;
        } catch {
          return void (context.res = json(404, { error: "Process introuvable" }));
        }
      }

      // 1. Markdown → Blob. 2. Métadonnées légères → Table.
      const blob = processesContainer.getBlockBlobClient(contentPath(pid));
      await blob.upload(contentMarkdown, Buffer.byteLength(contentMarkdown, "utf-8"), {
        blobHTTPHeaders: { blobContentType: "text/markdown; charset=utf-8" }
      });

      await processesClient.upsertEntity({
        partitionKey: "process",
        rowKey:       pid,
        titre,
        categorie,
        descriptionCourte,
        createdBy,
        createdAt,
        updatedBy:    auth.email,
        updatedAt:    now
      }, "Replace");

      context.res = json(200, { success: true, id: pid });
      return;
    }

    // ── DELETE ─────────────────────────────────────────────────────────────────
    if (req.method === "DELETE") {
      if (!hasRole(auth.role, "moderator")) {
        return void (context.res = json(403, { error: "Accès refusé — moderator minimum requis" }));
      }
      const id = ((req.query.id || (req.body && req.body.id)) || "").trim();
      if (!id || !UUID_RE.test(id)) return void (context.res = json(400, { error: "id invalide" }));

      try { await processesClient.deleteEntity("process", id); }
      catch { return void (context.res = json(404, { error: "Process introuvable" })); }

      // Supprime le markdown + toutes les images sous le préfixe "<id>/".
      let removedBlobs = 0;
      try {
        for await (const b of processesContainer.listBlobsFlat({ prefix: `${id}/` })) {
          try { await processesContainer.deleteBlob(b.name); removedBlobs++; } catch {}
        }
      } catch {}

      context.res = json(200, { success: true, id, removedBlobs });
      return;
    }

    context.res = json(405, { error: "Méthode non supportée" });
  } catch (err) {
    context.log.error("Erreur /api/process :", err.message);
    context.res = json(500, { error: "Erreur serveur" });
  }
};
