const mammoth = require("mammoth");
const { getAuthContext, hasRole } = require("../shared/auth");
const { foundryConfigured, chatJson } = require("../shared/foundry");

// Limites (alignées sur /api/process pour que le brouillon soit enregistrable tel quel).
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 Mo de .docx
const MAX_HTML_CHARS = 60000;            // borne le contexte envoyé au LLM
const MAX_TITRE       = 120;
const MAX_CATEGORIE   = 64;
const MAX_DESC        = 300;
const MAX_CONTENT     = 200000;

function json(status, obj) {
  return { status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}

function clamp(s, max) {
  s = typeof s === "string" ? s.trim() : "";
  return s.length > max ? s.slice(0, max) : s;
}

const PROMPT_IMPORT = `Tu convertis une procédure interne (extraite d'un document Word, fournie en HTML) en une fiche PsForge au format markdown.
Renvoie UNIQUEMENT un objet JSON conforme à ce schéma :
{
  "titre": "<titre court et explicite de la procédure>",
  "categorie": "<catégorie courte, ex: M365, Windows, Réseau, Sécurité, Mobile, Intune… ; 'Autre' si incertain>",
  "descriptionCourte": "<résumé en 1 ou 2 phrases du cas d'usage ; sert à la recherche>",
  "contentMarkdown": "<la procédure complète, reformatée>"
}
Règles strictes pour "contentMarkdown" :
- Utilise UNIQUEMENT : titres "## " et "### ", listes "- ", listes numérotées "1. ", gras **texte**, code en ligne \`code\`, blocs de code triple-backtick avec langage (ex: \`\`\`powershell), séparateurs "---".
- AUCUN tableau markdown (non supporté) : convertis tout tableau en liste claire (clé : valeur).
- AUCUNE image.
- Reprends FIDÈLEMENT le contenu : ne résume pas, n'invente rien, n'ajoute aucune étape. Conserve à l'identique les commandes, chemins, URLs, codes d'erreur et valeurs techniques.
- Structure logiquement (Prérequis, Étapes, Dépannage, Escalade…) selon le document.
Réponds par le JSON seul, sans texte autour.`;

/**
 * POST /api/process-import — rôle minimum : tech.
 * Body : { fileBase64: "<.docx en base64>", fileName?: "<nom>" }
 *
 * Convertit un .docx en brouillon de procédure PsForge :
 *   1. mammoth : .docx → HTML (texte, titres, listes, tableaux).
 *   2. gpt-4.1-mini : HTML → JSON { titre, categorie, descriptionCourte, contentMarkdown }
 *      au format markdown PsForge.
 * Le brouillon N'EST PAS enregistré : il est renvoyé pour relecture/correction par le
 * technicien, qui l'enregistre ensuite via POST /api/process (humain dans la boucle).
 *
 * Les images ne sont pas importées automatiquement (extraction/placement non fiables) :
 * si le document en contient, un avertissement invite à les rajouter manuellement.
 */
module.exports = async function (context, req) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return void (context.res = json(401, { error: "Non authentifié" }));
    if (auth.blocked) return void (context.res = json(403, { error: "Accès refusé" }));
    if (!hasRole(auth.role, "tech")) {
      return void (context.res = json(403, { error: "Accès refusé — rôle tech ou supérieur requis" }));
    }
    if (!foundryConfigured()) {
      return void (context.res = json(503, { error: "Service IA non configuré (variables FOUNDRY_* manquantes)" }));
    }

    const body = req.body || {};
    const fileBase64 = typeof body.fileBase64 === "string" ? body.fileBase64 : "";
    if (!fileBase64) return void (context.res = json(400, { error: "fileBase64 manquant" }));

    let buf;
    try { buf = Buffer.from(fileBase64, "base64"); }
    catch { return void (context.res = json(400, { error: "fichier illisible" })); }
    if (!buf.length) return void (context.res = json(400, { error: "fichier vide" }));
    if (buf.length > MAX_FILE_BYTES) return void (context.res = json(400, { error: "fichier trop volumineux (10 Mo max)" }));
    // Un .docx est un ZIP : magie "PK".
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
      return void (context.res = json(400, { error: "format non supporté (.docx attendu)" }));
    }

    // Le document contient-il des médias (images flottantes que mammoth ne sait pas extraire) ?
    const hasImages = buf.toString("latin1").includes("word/media/");

    // 1. .docx → HTML. On retire les images (data: interdit par la CSP, et bruit pour le LLM).
    let html;
    try {
      const result = await mammoth.convertToHtml({ buffer: buf }, {
        convertImage: mammoth.images.imgElement(function () { return { src: "" }; })
      });
      html = (result.value || "").replace(/<img\b[^>]*>/gi, "");
    } catch (err) {
      context.log.error(`process-import conversion: ${err.message}`);
      return void (context.res = json(422, { error: "Conversion du document impossible" }));
    }
    if (!html.trim()) return void (context.res = json(422, { error: "Document vide ou illisible" }));
    if (html.length > MAX_HTML_CHARS) html = html.slice(0, MAX_HTML_CHARS);

    // 2. HTML → brouillon markdown PsForge.
    let draft;
    try {
      draft = await chatJson([
        { role: "system", content: PROMPT_IMPORT },
        { role: "user", content: html }
      ], 0);
    } catch (err) {
      context.log.error(`process-import reformatage: ${err.message}`);
      return void (context.res = json(502, { error: "Échec du reformatage par l'IA" }));
    }

    const titre = clamp(draft && draft.titre, MAX_TITRE);
    if (!titre) return void (context.res = json(422, { error: "Titre introuvable dans le document" }));
    let contentMarkdown = typeof (draft && draft.contentMarkdown) === "string" ? draft.contentMarkdown : "";
    // Garde-fou : supprime toute image qui ne pointe pas vers /api/process-image.
    contentMarkdown = contentMarkdown.replace(/!\[[^\]]*\]\((?!\/api\/process-image)[^)]*\)/g, "");
    if (contentMarkdown.length > MAX_CONTENT) contentMarkdown = contentMarkdown.slice(0, MAX_CONTENT);

    const warnings = [];
    if (hasImages) {
      warnings.push("Le document contient des images : elles ne sont pas importées automatiquement. Ajoutez-les via « + Image » après enregistrement.");
    }

    context.log(`process-import ok categorie=${clamp(draft && draft.categorie, MAX_CATEGORIE) || "?"} images=${hasImages}`);
    context.res = json(200, {
      titre,
      categorie:         clamp(draft && draft.categorie, MAX_CATEGORIE),
      descriptionCourte: clamp(draft && draft.descriptionCourte, MAX_DESC),
      contentMarkdown,
      warnings
    });
  } catch (err) {
    context.log.error(`process-import erreur: ${err.message}`);
    context.res = json(500, { error: "Erreur serveur" });
  }
};
