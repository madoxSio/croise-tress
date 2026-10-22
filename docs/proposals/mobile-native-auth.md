# Proposition : authentification des clients natifs (app mobile)

> Statut : **validée par madox le 2026-10-20** (carte de décision « Jeton natif »), implémentée et
> testée par le fil « App mobile » : `apps/api/test/native.test.ts` (14 tests, dont la suppression de compte depuis l’app), suite API 106/106
> verte, lint et typecheck verts. Le diff est dans [`mobile-native-auth.patch`](mobile-native-auth.patch)
> (`patch -p1` depuis la racine) ; son intégration dans `apps/api` revient au fil « Audit et cadrage ».

## Problème

L'API n'accepte qu'un navigateur : session par cookie `HttpOnly` et, sur toute requête mutante,
en-tête `Origin` présent dans `WEB_ORIGINS` plus jeton CSRF. Une app iOS ou Android :

- n'envoie pas d'en-tête `Origin` (ce n'est pas un navigateur) : toute requête mutante est
  refusée en 403 `csrf_rejected`, y compris la création de la session invitée ;
- n'a pas de stockage de cookies maîtrisé (le magasin de cookies du système n'est ni chiffré ni
  limité à l'app de façon garantie).

Contourner en forgeant un `Origin` autorisé depuis l'app serait fragile et brouillerait le sens
de ce contrôle : on l'écarte.

## Proposition

1. **Annonce explicite** : un client natif envoie `x-crossverse-client: native` sur chaque requête.
   Un navigateur ne peut pas envoyer cet en-tête vers l'API depuis un autre site sans pré-vol CORS,
   que l'API n'accorde à aucune origine (pas de `@fastify/cors`, Caddy n'ajoute aucun en-tête CORS).
   L'en-tête ne peut donc pas servir à une attaque CSRF.
2. **Jeton porteur** : dans ce mode, la session vient uniquement de
   `Authorization: Bearer <jeton>` ; le cookie est ignoré. Le jeton est celui qui irait dans le
   cookie (256 bits, haché en base, expirant, révocable, même table `sessions`) : aucune nouvelle
   mécanique de session.
3. **Remise du jeton** : `POST /session/guest`, `/auth/login` et `/auth/verify-email` renvoient le
   jeton dans un champ `sessionToken` **uniquement** en mode natif ; un navigateur ne le voit
   jamais. Les routes qui effacent le cookie ne le font qu'en mode navigateur.
4. **Ce qui ne change pas** : le jeton CSRF reste exigé sur toute requête mutante authentifiée,
   dans les deux modes (défense en profondeur). Seul le contrôle `Origin`, propre aux navigateurs,
   est sauté en mode natif. Le web n'est pas modifié. Limitation de débit, rotation à la
   connexion, révocation (`/auth/sessions`) s'appliquent à l'identique.
5. **Côté app** : jeton rangé dans le coffre du système (`expo-secure-store` : Keychain iOS
   `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, Keystore Android), jamais en clair ni journalisé, effacé à la
   déconnexion. Déjà implémenté dans `apps/mobile/src/api/` (`bearerTransport`).
6. **Temps réel (duels)** : même principe pour Socket.IO, jeton passé dans `handshake.auth.token`
   avec l'en-tête natif ; l'`allowRequest` actuel (Origin / `Sec-Fetch-Site`) laisse passer une
   requête sans `Origin` ni `Sec-Fetch-Site`, donc seule `authenticate()` est à étendre. Non écrit.

## Correctif proposé

[`mobile-native-auth.patch`](mobile-native-auth.patch) (contrats + plugin `auth` + routes `session`
et `auth`), relatif à la racine du dépôt (`git apply docs/proposals/mobile-native-auth.patch`).
**Non appliqué et non testé** contre la suite de l'API ; à compléter avant intégration :

- en-tête natif sans `Origin` : création d'invité acceptée, `sessionToken` présent ;
- navigateur : jamais de `sessionToken`, comportement actuel inchangé (suite existante verte) ;
- mode natif : cookie seul ignoré (401), `Authorization` mal formé → 401, jeton CSRF absent → 403 ;
- `Authorization` sans en-tête natif : ignoré (pas d'élévation pour un navigateur) ;
- déconnexion native : jeton révoqué, plus accepté ;
- journaux : `authorization` déjà masqué par la configuration pino.

## Risques résiduels

- Un jeton volé sur un appareil compromis (root/jailbreak) donne la session jusqu'à révocation ou
  expiration : même exposition qu'un cookie volé, atténuée par la liste des sessions révocables.
- Si un jour l'API active CORS pour une origine, cette origine pourra envoyer l'en-tête natif :
  la liste CORS devra rester limitée aux origines de confiance (déjà la règle de CLAUDE.md §4).
