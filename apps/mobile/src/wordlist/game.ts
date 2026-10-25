/**
 * Mots mêlés « standard » côté app (fonctions pures, testées sans React Native). Tout est
 * public : la grille, la liste des mots et donc le mot mystère ; les règles viennent de
 * crossword-core. L'état de surlignage réutilise celui de la grille pré-remplie : chaque mot
 * y joue le rôle d'une « définition » numérotée dans l'ordre alphabétique.
 */
import {
  leftoverLetters,
  matchWordList,
  normalizeAnswer,
  wordOccurrences,
  type Position,
} from '@crossverse/crossword-core'
import type { WordListDto, WordSearchHit } from '@crossverse/contracts'
import type { FoundWord, Selection } from '../wordsearch/state'

function toHit(list: WordListDto, word: string, start: Position, end: Position): WordSearchHit {
  return { direction: 'across', number: list.words.indexOf(word) + 1, answer: word, start, end }
}

export type SelectionResult =
  | { readonly kind: 'hit'; readonly hit: WordSearchHit }
  | { readonly kind: 'already' }
  | { readonly kind: 'miss' }

/** Mot de la liste surligné par un tracé, dans un sens ou dans l'autre. */
export function checkSelection(
  list: WordListDto,
  found: readonly FoundWord[],
  selection: Selection,
): SelectionResult {
  const done = new Set(found.map((word) => word.answer))
  const hit = matchWordList(list, selection.from, selection.to, list.directions, done)
  if (hit) return { kind: 'hit', hit: toHit(list, hit.word, hit.start, hit.end) }
  if (matchWordList(list, selection.from, selection.to, list.directions)) return { kind: 'already' }
  return { kind: 'miss' }
}

/** « Où est-il ? » : emplacement d'un mot de la liste. */
export function locate(list: WordListDto, word: string): WordSearchHit | null {
  const hit = wordOccurrences(list.rows, word)[0]
  return hit ? toHit(list, word, hit.start, hit.end) : null
}

/** Mot mystère : lettres restantes quand tous les mots sont rayés, et leurs cases. */
export function mysteryOf(list: WordListDto): { letters: string; cells: Position[] } {
  const hits = list.words.flatMap((word) => wordOccurrences(list.rows, word).slice(0, 1))
  return leftoverLetters(list.rows, hits)
}

export function isMystery(list: WordListDto, guess: string): boolean {
  const normalized = normalizeAnswer(guess)
  return normalized !== null && normalized.length > 0 && normalized === mysteryOf(list).letters
}
