/**
 * Outil d'écriture d'une grille de mots mêlés pour `prisma/seed/word-lists.ts`.
 *
 *   tsx scripts/word-list.ts brouillon.json
 *
 * `brouillon.json` : `{ "words": [...], "extras": [...], "mystery": "...", "size": 12,
 * "difficulty": "intermediate" }`. Les mots de `words` sont tous placés ; ceux de `extras`
 * (même thème, plutôt courts) complètent la grille jusqu'à laisser la place exacte du mot
 * mystère. Affiche les lignes et les mots retenus, à recopier dans le seed.
 */
import { readFileSync } from 'node:fs'
import { buildWordList } from '@crossverse/crossword-core'
import { difficultySchema } from '@crossverse/contracts'
import { z } from 'zod'
import { directionsFor } from '../src/modules/wordsearch/service.ts'

const draftSchema = z.strictObject({
  words: z.array(z.string().regex(/^[A-Z]{2,}$/)).min(1),
  extras: z.array(z.string().regex(/^[A-Z]{2,}$/)).default([]),
  mystery: z.string().regex(/^[A-Z]+$/),
  size: z.int().min(5).max(18),
  difficulty: difficultySchema,
})

const path = process.argv[2]
if (!path) throw new Error('Usage : tsx scripts/word-list.ts brouillon.json')
const draft = draftSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
const directions = directionsFor(draft.difficulty)

for (let seed = 1; seed <= 400; seed++) {
  const built = buildWordList({ ...draft, directions, seed })
  if (built) {
    process.stdout.write(`${JSON.stringify(built, null, 2)}\n`)
    process.exit(0)
  }
}
process.stderr.write('Aucune grille trouvée : agrandir la grille ou ajouter des mots courts.\n')
process.exit(1)
