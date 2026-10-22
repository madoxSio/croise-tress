# Modèle de menace — Crossverse

> Version 0.1 (2026-10-17), établie sur l'architecture **cible** (aucun code n'existe). À réviser à chaque phase et à chaque changement d'architecture. Méthode : STRIDE par surface, priorisation qualitative (impact × probabilité).

## 1. Actifs

| Actif                                                | Pourquoi il compte                              |
| ---------------------------------------------------- | ----------------------------------------------- |
| Identifiants (e-mail, hash de mot de passe)          | compromission de compte, réutilisation ailleurs |
| Sessions et jetons e-mail                            | prise de contrôle de compte                     |
| Données personnelles (e-mail, pseudo, IP)            | obligations RGPD, réputation                    |
| Solutions des puzzles                                | intérêt du jeu, triche en compétition           |
| Intégrité des scores, résultats, classements, succès | équité, confiance des joueurs                   |
| État officiel des matchs                             | équité en temps réel                            |
| Disponibilité de l'API et du temps réel              | expérience de jeu                               |
| Secrets (BD, SMTP, clés de signature)                | accès total aux données                         |
| Chaîne de build (dépendances, CI, images)            | compromission de tous les utilisateurs          |
| Sauvegardes                                          | fuite massive, perte de données                 |

## 2. Acteurs

- **Visiteur anonyme** : parcourt le catalogue, joue en invité.
- **Joueur authentifié** : actions sur ses propres ressources.
- **Tricheur** : joueur authentifié qui modifie son client, rejoue ou forge des requêtes et événements WS.
- **Attaquant externe** : bourrage d'identifiants, énumération, XSS, CSRF, DoS.
- **Administrateur** : gère le catalogue ; compte à forte valeur.
- **Dépendance ou action CI compromise** (chaîne d'approvisionnement).
- **Opérateur d'hébergement** (accès infrastructure).

## 3. Frontières de confiance

1. Navigateur / app ↔ reverse proxy (Internet, TLS).
2. Reverse proxy ↔ API (réseau privé).
3. API ↔ PostgreSQL (réseau privé, compte à privilèges minimaux).
4. API ↔ fournisseur e-mail (Internet).
5. Dépôt ↔ CI ↔ registre d'images.

Tout ce qui franchit la frontière 1 est non fiable, y compris les messages issus du client officiel.

## 4. Scénarios de menace

| #   | Surface                                    | STRIDE | Scénario                                                                    | Mesures                                                                                                                      | Prio            |
| --- | ------------------------------------------ | ------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------- |
| T1  | `/auth/login`                              | S      | bourrage d'identifiants / force brute                                       | Argon2id, limitation par IP et compte, délai croissant, journalisation                                                       | Haute           |
| T2  | `/auth/register`, `/auth/forgot`           | I      | énumération des comptes par message ou délai                                | réponses et temps homogènes, e-mail envoyé de façon asynchrone                                                               | Moyenne         |
| T3  | jetons e-mail                              | S/E    | vol ou rejeu d'un lien de réinitialisation                                  | 256 bits, haché, usage unique, 30 min, révocation des sessions après usage, `Referrer-Policy`                                | Haute           |
| T4  | session                                    | S      | vol de cookie via XSS, fixation                                             | `HttpOnly`, `__Host-`, rotation à la connexion, CSP, pas de `v-html`                                                         | Haute           |
| T5  | routes mutantes                            | T      | CSRF depuis un site tiers                                                   | `SameSite=Lax`, vérification `Origin`, jeton CSRF                                                                            | Haute           |
| T6  | `/play-sessions/:id`, profils, invitations | I/T    | IDOR/BOLA : lire ou modifier la partie d'un autre                           | filtrage par propriétaire dans la requête, 404 uniforme, tests entre comptes                                                 | Haute           |
| T7  | `/puzzles/:id`                             | I      | extraction de la solution (réponse API, bundle, source map)                 | solution jamais sérialisée hors révélation, DTO explicites, test de non-fuite                                                | Haute           |
| T8  | `/check`, `/hints`                         | I      | énumération lettre par lettre de la solution via `check`                    | limitation de débit, `check` comptabilisé dans le score, impossible en classé                                                | Moyenne         |
| T9  | fin de partie solo                         | T      | déclarer une partie terminée ou un temps falsifié                           | le serveur vérifie la grille et calcule la durée à partir de ses propres horodatages                                         | Moyenne         |
| T10 | WS `match:*`                               | S/E    | rejoindre la room d'un autre match, agir pour un autre joueur               | identité issue de la session, appartenance vérifiée à chaque événement, rooms gérées côté serveur                            | Haute           |
| T11 | WS `match:*`                               | T      | forger un score, déclarer sa victoire, rejouer un événement                 | événements d'intention uniquement, transitions validées, idempotence par `clientEventId`, `UPDATE … WHERE status='active'`   | Haute           |
| T12 | diffusion de progression                   | I      | lire les lettres de l'adversaire dans le trafic                             | seuls des compteurs sont diffusés                                                                                            | Moyenne         |
| T13 | matchmaking                                | T/D    | double affectation, inondation de la file, multi-comptes pour le classement | transaction + `SKIP LOCKED`, index partiel, débit limité, compte confirmé requis en classé ; multi-comptes = risque résiduel | Moyenne         |
| T14 | déconnexion                                | D/R    | se déconnecter volontairement pour éviter une défaite                       | délai de grâce puis abandon, chrono serveur continu                                                                          | Moyenne         |
| T15 | API et WS                                  | D      | grosses requêtes, connexions massives, opérations coûteuses (hash)          | limites de taille, débit, connexions par utilisateur, délai d'attente ; protection réseau en amont à prévoir                 | Moyenne         |
| T16 | contenu (pseudos, définitions)             | T      | XSS stocké, contenu offensant                                               | rendu texte, validation des pseudos, modération admin                                                                        | Moyenne         |
| T17 | admin                                      | E      | élévation de privilège, vol du compte admin                                 | rôle vérifié serveur, journalisation, MFA admin (à prévoir), pas de création d'admin via l'API publique                      | Haute           |
| T18 | base de données                            | I/T    | exposition de PostgreSQL, injection SQL                                     | BD non publiée, Prisma paramétré, compte restreint                                                                           | Haute           |
| T19 | secrets                                    | I      | secret commité ou présent dans le bundle                                    | gitleaks, seules `NUXT_PUBLIC_*` exposées, revue du bundle                                                                   | Haute           |
| T20 | chaîne CI                                  | T      | dépendance ou action malveillante                                           | lockfile, versions stables, actions épinglées par SHA, audit, permissions minimales                                          | Moyenne         |
| T21 | journaux                                   | I      | mots de passe ou jetons dans les logs                                       | `redact` pino, tests                                                                                                         | Moyenne         |
| T22 | sauvegardes                                | I/D    | fuite d'une sauvegarde, restauration impossible                             | chiffrement, accès restreint, restauration testée                                                                            | Moyenne         |
| T23 | e-mail                                     | S      | hameçonnage imitant Crossverse, abus d'envoi                                | SPF/DKIM/DMARC en prod, débit limité, liens vers le domaine officiel uniquement                                              | Basse           |
| T24 | app native                                 | I      | jeton natif extrait de l'appareil                                           | stockage sécurisé natif, révocation, durée bornée                                                                            | Basse (phase 7) |

## 5. Risques résiduels acceptés (à confirmer)

- Assistance externe (dictionnaire, solveur, seconde personne) en multijoueur : non détectable de façon fiable ; atténuée par l'absence de solution côté client et par la limite de temps.
- Comptes multiples pour manipuler le classement : atténué par la confirmation e-mail et la limitation, non éliminé.
- DoS volumétrique : nécessite une protection réseau de l'hébergeur ou d'un CDN, hors périmètre applicatif.
- Le mode solo hors ligne (phase 7) impliquera de confier la solution d'une grille au client : les parties hors ligne ne compteront pas pour les classements.
