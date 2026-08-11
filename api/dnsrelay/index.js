const { getAuthContext, hasRole } = require("../shared/auth");
const { getDnsRelayState, setDnsRelayEnabled } = require("../shared/config");

const json = (status, body) => ({
  status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

/**
 * GET /api/dns-relay
 * État du relais DNS : { enabled, updatedBy, updatedAt }.
 * Accessible : tout utilisateur connecté et non bloqué — le frontend en a besoin
 * pour router ses résolutions et pour afficher le bandeau d'information.
 *
 * POST /api/dns-relay
 * Active ou désactive le relais. Body : { enabled: true|false }
 * Accessible : admin uniquement.
 *
 * Pourquoi ce n'est pas un réglage anodin : quand le relais est actif, les domaines
 * analysés transitent par le serveur de l'application au lieu de partir directement
 * du navigateur. C'est un mode de secours pour les réseaux qui bloquent le
 * DNS-over-HTTPS, et les utilisateurs en sont avertis dans l'interface.
 */
module.exports = async function (context, req) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) { context.res = json(401, { error: "Non authentifié" }); return; }
    if (auth.blocked) { context.res = json(403, { error: "Compte bloqué" }); return; }

    if (req.method === "GET") {
      context.res = json(200, await getDnsRelayState());
      return;
    }

    if (req.method === "POST") {
      if (!hasRole(auth.role, "admin")) {
        context.res = json(403, { error: "Accès refusé — admin requis" });
        return;
      }
      const enabled = req.body ? req.body.enabled : undefined;
      if (typeof enabled !== "boolean") {
        context.res = json(400, { error: "enabled doit valoir true ou false" });
        return;
      }
      const etat = await setDnsRelayEnabled(enabled, auth.email);
      context.log.warn(`Relais DNS ${enabled ? "ACTIVE" : "desactive"} par ${auth.email}`);
      context.res = json(200, Object.assign({ success: true }, etat));
      return;
    }

    context.res = json(405, { error: "Méthode non supportée" });

  } catch (err) {
    context.log.error("Erreur /api/dns-relay :", err.message);
    context.res = json(500, { error: "Erreur serveur" });
  }
};
