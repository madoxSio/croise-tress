import { z } from 'zod'
import { difficultySchema, uuidSchema } from './common.js'

/**
 * Mots mêlés « standard » : grille carrée entièrement remplie, liste des mots à trouver en
 * clair et mot mystère formé par les lettres restantes. Tout est public (la liste des mots est
 * l'énoncé) ; le mot mystère lui-même n'est pas envoyé : il apparaît en rayant tous les mots.
 * Mode d'entraînement : ni score officiel, ni points, ni progression.
 */

export const wordListSummarySchema = z.strictObject({
  id: uuidSchema,
  slug: z.string(),
  title: z.string(),
  /** Nom affichable du (sous-)thème. */
  theme: z.string(),
  themeSlug: z.string(),
  parentThemeSlug: z.string().nullable(),
  /** Clé d'habillage résolue (voir `catalog.ts`). */
  skin: z.string(),
  difficulty: difficultySchema,
  size: z.int().positive(),
  wordCount: z.int().positive(),
  estimatedMinutes: z.int(),
})
export type WordListSummary = z.infer<typeof wordListSummarySchema>

export const wordListSchema = wordListSummarySchema.extend({
  /** Une chaîne de `size` lettres A–Z par ligne. */
  rows: z.array(z.string()),
  /** Mots à trouver (A–Z), par ordre alphabétique. */
  words: z.array(z.string()),
  /** Sens dans lesquels les mots peuvent être écrits (dépend de la difficulté). */
  directions: z.strictObject({ diagonals: z.boolean(), reversed: z.boolean() }),
  mysteryLength: z.int().positive(),
  mysteryClue: z.string(),
})
export type WordListDto = z.infer<typeof wordListSchema>

export const listWordListsQuerySchema = z.strictObject({
  difficulty: difficultySchema.optional(),
  /** Slug d'un thème (sous-thèmes inclus) ou d'un sous-thème ; inconnu = liste vide. */
  theme: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Pagination par curseur : `id` du dernier élément de la page précédente. */
  cursor: uuidSchema.optional(),
})
export type ListWordListsQuery = z.input<typeof listWordListsQuerySchema>

export const wordListListSchema = z.strictObject({
  items: z.array(wordListSummarySchema),
  nextCursor: uuidSchema.nullable(),
})
export type WordListList = z.infer<typeof wordListListSchema>
