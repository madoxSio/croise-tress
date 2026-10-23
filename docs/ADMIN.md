# Administration et comptes de test

L'espace d'administration est servi par le web sous `/admin` (lien « Administration » dans
« Mon compte », visible seulement pour un administrateur) et par l'API sous `/api/v1/admin/*`.

## Ce qu'il permet

| Page                 | Contenu                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/admin`             | comptes, nouveaux et actifs sur 7 jours, invités, parties, duels, grilles ; série des 30 derniers jours (UTC) |
| `/admin/users`       | recherche par début de pseudo ou d'e-mail, invités en option, pagination                                      |
| `/admin/users/:id`   | fiche et **parcours** d'un joueur : grilles commencées/terminées (score, durée, aides), duels, succès         |
| `/admin/puzzles`     | toutes les grilles (brouillons compris) avec leur nombre de parties ; publier / dépublier                     |
| `/admin/puzzles/new` | éditeur : la grille se saisit ligne par ligne (`#` = case noire), un champ de définition apparaît par mot     |
| `/admin/puzzles/:id` | modification ; une grille déjà jouée garde ses lettres (seuls titres et définitions changent)                 |
| `/admin/audit`       | journal des actions d'administration                                                                          |

Une grille est créée **en brouillon** : elle n'apparaît au catalogue, au défi du jour et en duel
qu'une fois publiée. Sa cohérence (mots, numérotation, connexité) est vérifiée par le moteur
`crossword-core`, comme pour le seed.

## Sécurité et données personnelles

- Rôle `admin` relu en base à **chaque** requête, compte complet et confirmé exigé. Tout autre
  appelant (invité, joueur, sans session) reçoit une **404** identique à une route inexistante
  (`test/admin.test.ts`, AUTHZ-03).
- **Aucune route HTTP** ne crée d'administrateur : le rôle se donne uniquement en ligne de
  commande, avec un accès au serveur ou à la base (THREAT-MODEL T17). Retirer le rôle ferme
  toutes les sessions du compte.
- Journal `audit_log` : création, modification, publication de grilles, **chaque consultation
  d'un parcours joueur**, et les actions en ligne de commande. Il contient un identifiant ou un
  slug, jamais de donnée personnelle.
- Exposé à l'administrateur : pseudo, e-mail, dates, compteurs de jeu. Jamais : hash de mot de
  passe, jetons, adresses IP, contenu des sessions. Les grilles renvoyées par `/admin` contiennent
  la solution (réservé à ce rôle) ; les routes publiques ne la renvoient toujours pas.
- Limite de débit dédiée : 120 requêtes par minute.
- Reste à faire : MFA pour les administrateurs (T17), modération des pseudos, export ou
  suppression d'un compte par l'administrateur (demandes RGPD), durée de conservation du journal.

## Créer un compte de test ou un administrateur

Le mot de passe n'est **jamais** passé en argument ni écrit dans le dépôt : il est lu dans la
variable `ACCOUNT_PASSWORD`, ou généré (128 bits) et affiché **une seule fois**. Le compte est
créé confirmé (pas d'e-mail), avec un hash Argon2id.

```sh
# Développement sans Docker (base du .env) — vérifié
make account-local email=testeur@example.com username=testeur
make account-local email=moi@example.com username=madox admin=1

# Développement Docker / production VPS — écrites, non exécutées (pas de Docker ici)
make account email=… username=… [admin=1]
make prod-account email=… username=… [admin=1]
make account-role email=… role=admin|player       # ou prod-account-role
```

Hébergement provisoire (API sur Render, base Neon) : lancer le script depuis un clone du dépôt
en visant la base Neon ; les variables passées en ligne de commande priment sur le `.env` local.

```sh
read -rs ACCOUNT_PASSWORD && export ACCOUNT_PASSWORD   # saisie masquée, ou vide pour en générer un
DATABASE_URL='<chaîne Neon directe>' make account-local email=testeur@example.com username=testeur
DATABASE_URL='<chaîne Neon directe>' pnpm --filter @crossverse/api account promote --email moi@example.com
```

Commandes du script (`apps/api/scripts/account.ts`) : `create --email --username [--admin]`,
`promote --email`, `demote --email`.
