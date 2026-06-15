const { getAuthContext, hasRole } = require("../shared/auth");
const { rolesClient } = require("../shared/tableClient");

/**
 * GET /api/roles
 * Liste tous les rôles (moderator, manager, admin).
 * Accessible : manager, admin.
 *
 * POST /api/roles
 * Ajoute ou modifie le rôle d'un utilisateur.
 * Body : { email, role }
 * Règles :
 *   - Manager  → peut ajouter/modifier des tech et des moderators
 *   - Admin    → peut ajouter/modifier tech, managers et moderators
 *
 * DELETE /api/roles
 * Supprime le rôle d'un utilisateur (repasse en "user").
 * Body : { email }
 * Règles identiques + protection : impossible de supprimer le dernier admin.
 */
module.exports = async function (context, req) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) {
      context.res = {
        status: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Non authentifié" })
      };
      return;
    }

    if (!hasRole(auth.role, "manager")) {
      context.res = {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Accès refusé — manager minimum requis" })
      };
      return;
    }

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const results = [];
      const queryResults = rolesClient.listEntities({
        queryOptions: { filter: `PartitionKey eq 'role'` }
      });

      for await (const entity of queryResults) {
        results.push({
          email: entity.rowKey,
          role:  entity.role
        });
      }

      results.sort((a, b) => {
        const order = { admin: 0, manager: 1, moderator: 2, tech: 3 };
        return (order[a.role] ?? 4) - (order[b.role] ?? 4);
      });

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(results)
      };
      return;
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === "POST") {
      const { email, role } = req.body || {};

      if (!email || !role) {
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "email et role sont obligatoires" })
        };
        return;
      }

      // Protection : un utilisateur ne peut pas modifier son propre rôle
      if (email.trim().toLowerCase() === auth.email.trim().toLowerCase()) {
        context.res = {
          status: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Impossible de modifier son propre rôle" })
        };
        return;
      }

      // Validation : email basique (présence @, longueur raisonnable).
      const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,253}$/;
      if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "email invalide" })
        };
        return;
      }

      // ── Blocage des requêtes d'un utilisateur (manager+) ──
      if (role === "blocked") {
        // On ne bloque que de simples utilisateurs (jamais un rôle privilégié)
        try {
          const existing = await rolesClient.getEntity("role", email.toLowerCase());
          const cur = String(existing.role || "").trim().toLowerCase();
          if (["tech", "moderator", "manager", "admin"].includes(cur)) {
            context.res = {
              status: 403,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ error: "Impossible de bloquer un utilisateur ayant un rôle" })
            };
            return;
          }
        } catch { /* pas dans la table = simple utilisateur, blocable */ }

        await rolesClient.upsertEntity({
          partitionKey: "role",
          rowKey:       email.toLowerCase(),
          role:         "blocked",
          assignedBy:   auth.email,
          assignedAt:   new Date().toISOString()
        }, "Replace");

        context.res = {
          status: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ success: true, email, role: "blocked" })
        };
        return;
      }

      if (!["tech", "moderator", "manager", "admin"].includes(role)) {
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Rôle invalide. Valeurs acceptées : tech, moderator, manager, admin" })
        };
        return;
      }

      // Manager ne peut attribuer que les rôles tech et moderator
      if (auth.role === "manager" && !["tech", "moderator"].includes(role)) {
        context.res = {
          status: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Un manager ne peut attribuer que les rôles tech ou moderator" })
        };
        return;
      }

      await rolesClient.upsertEntity({
        partitionKey: "role",
        rowKey:       email.toLowerCase(),
        role,
        assignedBy:   auth.email,
        assignedAt:   new Date().toISOString()
      }, "Replace");

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, email, role })
      };
      return;
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (req.method === "DELETE") {
      const { email } = req.body || {};

      if (!email) {
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "email est obligatoire" })
        };
        return;
      }

      // Protection : un utilisateur ne peut pas supprimer son propre rôle
      if (email.trim().toLowerCase() === auth.email.trim().toLowerCase()) {
        context.res = {
          status: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Impossible de supprimer son propre rôle" })
        };
        return;
      }

      // Validation email (même règle que dans le POST).
      const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,253}$/;
      if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "email invalide" })
        };
        return;
      }

      // Récupérer le rôle actuel de l'utilisateur ciblé
      let targetEntity;
      try {
        targetEntity = await rolesClient.getEntity("role", email.toLowerCase());
      } catch {
        context.res = {
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Utilisateur introuvable dans les rôles" })
        };
        return;
      }

      // Manager ne peut supprimer que des tech/moderators ou débloquer des utilisateurs
      if (auth.role === "manager" && !["tech", "moderator", "blocked"].includes(targetEntity.role)) {
        context.res = {
          status: 403,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Un manager ne peut supprimer que des tech/moderators ou débloquer des utilisateurs" })
        };
        return;
      }

      // Protection : impossible de supprimer le dernier admin
      if (targetEntity.role === "admin") {
        const admins = [];
        const adminQuery = rolesClient.listEntities({
          queryOptions: { filter: `PartitionKey eq 'role' and role eq 'admin'` }
        });
        for await (const e of adminQuery) admins.push(e);

        if (admins.length <= 1) {
          context.res = {
            status: 403,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Impossible de supprimer le dernier admin" })
          };
          return;
        }
      }

      await rolesClient.deleteEntity("role", email.toLowerCase());

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, email, removed: true })
      };
      return;
    }

  } catch (err) {
    context.log.error("Erreur /api/roles :", err.message);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Erreur serveur" })
    };
  }
};
