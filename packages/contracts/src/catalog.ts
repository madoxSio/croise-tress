import { z } from 'zod'
import { puzzleSummarySchema } from './puzzles.js'

/**
 * Catalogue de thèmes : deux niveaux (thème > sous-thème). L'habillage (`skin`, `icon`,
 * `accent`, `accentAlt`) est toujours résolu par le serveur : un sous-thème sans style propre
 * hérite de son thème. `skin` est une clé ouverte : un client qui ne la connaît pas utilise
 * son habillage par défaut.
 */

export const themeSlugSchema = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'minuscules, chiffres et tirets')

export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'couleur #RRGGBB')

/** Nombre de grilles publiées par niveau. */
const count = z.int().min(0)
export const difficultyCountsSchema = z.strictObject({
  discovery: count,
  easy: count,
  intermediate: count,
  hard: count,
  expert: count,
})
export type DifficultyCounts = z.infer<typeof difficultyCountsSchema>

const catalogNodeShape = {
  slug: themeSlugSchema,
  name: z.string(),
  description: z.string(),
  skin: z.string(),
  icon: z.string(),
  accent: hexColorSchema,
  accentAlt: hexColorSchema,
  /** Grilles publiées (sous-thèmes compris pour un thème). */
  puzzleCount: z.int().min(0),
  counts: difficultyCountsSchema,
}

export const catalogSubThemeSchema = z.strictObject(catalogNodeShape)
export type CatalogSubTheme = z.infer<typeof catalogSubThemeSchema>

export const catalogThemeSchema = z.strictObject({
  ...catalogNodeShape,
  children: z.array(catalogSubThemeSchema),
})
export type CatalogTheme = z.infer<typeof catalogThemeSchema>

/** `GET /catalog` : thèmes ayant au moins une grille publiée, dans l'ordre éditorial. */
export const catalogSchema = z.strictObject({ themes: z.array(catalogThemeSchema) })
export type Catalog = z.infer<typeof catalogSchema>

/** `GET /quick-play` : une grille simple tirée au hasard, éventuellement dans un thème. */
export const quickPlayQuerySchema = z.strictObject({ theme: themeSlugSchema.optional() })
export type QuickPlayQuery = z.infer<typeof quickPlayQuerySchema>

export const quickPlaySchema = z.strictObject({ puzzle: puzzleSummarySchema })
export type QuickPlay = z.infer<typeof quickPlaySchema>
