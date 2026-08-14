/* ══════════════════════════════════════════════════════════════════════════
   Page de retour de l'authentification Microsoft Graph

   Elle n'existe que pour contourner un comportement précis d'Azure Static Web
   Apps : son cookie d'authentification (`StaticWebAppsAuthCookie`) est posé en
   SameSite=Strict. Un tel cookie n'est pas transmis lors d'une navigation
   provenant d'un autre site — y compris une navigation de premier niveau.

   Au retour de login.microsoftonline.com, SWA voit donc une requête anonyme,
   applique sa règle « 401 → /.auth/login/aad », et réauthentifie l'utilisateur
   en silence. Le fragment qui portait le code d'autorisation disparaît dans
   cette chaîne de redirections. Symptôme observé : la page se recharge et rien
   ne se passe, sans la moindre erreur.

   Cette page-ci est déclarée en route anonyme dans staticwebapp.config.json.
   Elle est donc servie directement, sans contrôle d'authentification, et le
   fragment lui arrive intact. Elle le dépose en sessionStorage puis renvoie sur
   la racine : cette seconde navigation est same-site, le cookie repart, et
   l'application se charge normalement.

   Elle ne contient et n'expose aucune donnée. Le code d'autorisation qu'elle
   transporte est inutilisable sans le vérificateur PKCE, qui reste sur
   l'origine authentifiée et n'a jamais quitté le navigateur.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  var CLE = 'tenantpulse_graph_hash_v1';
  try {
    if (location.hash && location.hash.length > 1) {
      sessionStorage.setItem(CLE, location.hash);
    }
  } catch (e) {
    /* Stockage indisponible : on renvoie quand même sur la racine, la connexion
       échouera proprement plutôt que de laisser l'utilisateur sur une page vide. */
  }
  /* replace et non assign : cette page ne doit pas rester dans l'historique,
     un retour arrière rejouerait un code déjà consommé. */
  location.replace('/');
})();
