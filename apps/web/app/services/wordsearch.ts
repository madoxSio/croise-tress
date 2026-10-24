import {
  wordSearchCheckResultSchema,
  wordSearchHitSchema,
  wordSearchSchema,
  type WordSearchClueRef,
  type WordSearchDto,
  type WordSearchHit,
} from '@crossverse/contracts'
import type { Position } from '@crossverse/crossword-core'
import { ensureSession, query, request, segment } from '~/services/api'

/**
 * Grille pré-remplie (façon mots mêlés). Le serveur seul sait où se cachent les réponses :
 * chaque sélection lui est soumise, il renvoie le mot trouvé ou rien.
 */
export async function getWordSearch(puzzleId: string, seed?: number): Promise<WordSearchDto> {
  await ensureSession()
  return request(
    'GET',
    `/puzzles/${segment(puzzleId)}/word-search${query({ seed })}`,
    wordSearchSchema,
  )
}

export async function checkWordSearch(
  puzzleId: string,
  body: { seed: number; from: Position; to: Position; found: WordSearchClueRef[] },
): Promise<WordSearchHit | null> {
  const result = await request(
    'POST',
    `/puzzles/${segment(puzzleId)}/word-search/check`,
    wordSearchCheckResultSchema,
    { body },
  )
  return result.hit
}

export function revealWordSearch(
  puzzleId: string,
  body: WordSearchClueRef & { seed: number },
): Promise<WordSearchHit> {
  return request('POST', `/puzzles/${segment(puzzleId)}/word-search/reveal`, wordSearchHitSchema, {
    body,
  })
}
