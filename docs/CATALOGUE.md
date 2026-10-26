# Catalogue de thèmes et de grilles

Les grilles sont rangées dans un **thème** (Football) ou un **sous-thème** (Football > Ligue des
champions). Deux niveaux au plus. Chaque thème porte un habillage pour l'interface.

## Modèle

- Table `themes` : `slug` (stable, sert d'identifiant public), `name`, `description`,
  `parent_id` (NULL pour un thème de premier niveau), `sort_order` (ordre éditorial), et
  l'habillage : `skin` (clé interprétée par le client : `culture`, `histoire`, `football`,
  `champions`, `sport`, `manga`, `art`, `musique`, `nature`…), `icon` (emoji), `accent` et `accent_alt`
  (`#RRGGBB`, dégradé de la carte). Un champ d'habillage NULL est hérité du parent ; l'API
  renvoie toujours des valeurs résolues.
- `puzzles.theme_id` → `themes` (`ON DELETE RESTRICT`). La difficulté garde ses cinq niveaux ;
  l'interface en montre trois : **simple** = `discovery` + `easy`, **intermédiaire** =
  `intermediate`, **compliqué** = `hard` + `expert`.

## API publique (`/api/v1`)

| Route                                    | Réponse                                                                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /catalog`                           | `{ themes: CatalogTheme[] }` : thèmes ayant au moins une grille publiée, chacun avec `counts` par niveau, `puzzleCount` et ses `children` non vides |
| `GET /puzzles?theme=<slug>&difficulty=…` | grilles publiées du thème **et de ses sous-thèmes** (ou d'un seul sous-thème) ; slug inconnu = liste vide                                           |
| `GET /quick-play` / `?theme=<slug>`      | `{ puzzle }` : grille simple tirée au hasard (sinon n'importe quel niveau du thème) ; 404 si aucune                                                 |

Chaque résumé de grille (`PuzzleSummary`, aussi dans `GET /puzzles/:id`) contient `theme` (nom
affichable), `themeSlug`, `parentThemeSlug` et `skin`. Contrats : `packages/contracts/src/catalog.ts`.
Une partie rapide se joue sans compte : session invitée (`POST /session/guest`) puis
`POST /play-sessions`.

## Administration

`GET /admin/themes` (parents suivis de leurs sous-thèmes), `POST /admin/themes`,
`PUT /admin/themes/:id` ; corps `adminThemeBodySchema` (`slug`, `name`, `description`,
`parentSlug`, `skin`, `icon`, `accent`, `accentAlt`, `sortOrder`). Refus (409) d'un troisième
niveau, d'un thème parent de lui-même, d'un thème ayant des enfants qui deviendrait sous-thème,
d'un slug déjà pris. Pas de suppression (les grilles sont protégées par la base). Les grilles
s'y rattachent par `themeSlug`. Créations et modifications sont journalisées (`theme.create`,
`theme.update`).

## Contenu éditorial et chargement

- `apps/api/prisma/seed/themes.ts` : arbre des thèmes ; `seed/puzzles.ts` : 6 grilles de
  découverte (aussi utilisées par les tests) ; `seed/catalog-puzzles.ts` : grilles thématiques.
- `prisma/seed.ts` appelle `syncCatalog` (`seed/sync.ts`) : il **ajoute** les thèmes et grilles
  absents (par slug), valide chaque grille avec `crossword-core`, et ne modifie **jamais** une
  ligne existante. Seule exception : une grille restée dans un sous-thème « Divers » (créé par la
  migration pour les anciens libellés) est rangée dans le thème prévu.
- Exécuté par `make seed` en développement et **à chaque démarrage** de l'image de production
  (`docker/prod.Dockerfile`), après les migrations : déployer suffit à publier de nouvelles
  grilles. Corriger une grille déjà en base se fait par l'éditeur d'administration.
- Les grilles thématiques sont des mots croisés « en croix » (mots libres reliés par leurs
  croisements, cases noires autour), jusqu'à 15 cases de côté. `test/catalog.test.ts` vérifie
  chaque grille (moteur, thème existant, slug unique, définitions non vides).

- Les **mots croisés classiques** (`format: 'classic'`, sous-thème « Mots croisés ») sont des
  grilles denses (au plus un quart de cases noires) dans `seed/classic-puzzles.ts`. Leurs
  définitions s'écrivent par ligne (I, II…) et par colonne (1, 2…), dans l'ordre de lecture ;
  `classicPuzzle` les renumérote pour le moteur et échoue au chargement si une ligne n'a pas
  autant de définitions que de mots. Filtre `?format=classic|freeform` sur `GET /puzzles` et
  `GET /quick-play` ; choix « Type de grille » dans l'éditeur d'administration.

## Mots mêlés (D16)

- `GET /word-lists?difficulty=&theme=&limit=&cursor=` et `GET /word-lists/:id` : publics. Le
  détail contient les lignes, les mots (ordre alphabétique), les sens permis, la longueur et
  l'indice du mot mystère, jamais le mot lui-même. Contrats : `packages/contracts/src/wordlists.ts`.
- Contenu : `apps/api/prisma/seed/word-lists.ts` (8 grilles : 2 simples 10×10, 3 intermédiaires
  et 3 compliquées 12×12), chargé par `syncWordLists` sans écrasement, comme les grilles.
- Ajouter une grille : écrire un brouillon JSON (`words`, `extras` courts du même thème,
  `mystery`, `size`, `difficulty`), lancer `pnpm --filter @crossverse/api exec tsx
scripts/word-list.ts brouillon.json`, recopier `rows` et `words` dans le seed, puis
  `pnpm --filter @crossverse/api test` (`wordlists.test.ts` revérifie chaque grille).

## Ajouter une grille au seed

1. Choisir un slug unique et un sous-thème de `themes.ts`.
2. Écrire la grille (`#` = case noire, lettres A–Z sans accent) et une définition par mot, numérotée
   comme le moteur (ligne par ligne, une case reçoit un numéro si elle commence un mot).
3. `pnpm --filter @crossverse/api test` puis déployer : la grille est ajoutée au démarrage.
