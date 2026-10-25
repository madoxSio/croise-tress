import { describe, expect, it } from 'vitest'
import type { WordListDto } from '@crossverse/contracts'
import { checkSelection, isMystery, locate, mysteryOf } from '../src/wordlist/game'
import { addHit, EMPTY_STATE } from '../src/wordsearch/state'

// CHAT (ligne 1) et CHIEN (colonne 1) partagent le C ; il reste « OUI » pour le mot mystère.
const LIST: WordListDto = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'test',
  title: 'Test',
  theme: 'Nature',
  themeSlug: 'nature',
  parentThemeSlug: null,
  skin: 'default',
  difficulty: 'easy',
  size: 5,
  wordCount: 2,
  estimatedMinutes: 5,
  rows: ['CHATO', 'HUIXX', 'IXXXX', 'EXXXX', 'NXXXX'].map((r) => r.replaceAll('X', '')),
  words: ['CHAT', 'CHIEN'],
  directions: { diagonals: false, reversed: false },
  mysteryLength: 3,
  mysteryClue: 'Contraire de non',
}

describe('mots mêlés (app)', () => {
  it('reconnaît un mot tracé à rebours, puis le signale déjà trouvé', () => {
    const result = checkSelection(LIST, [], { from: { row: 0, col: 3 }, to: { row: 0, col: 0 } })
    expect(result).toEqual({
      kind: 'hit',
      hit: {
        direction: 'across',
        number: 1,
        answer: 'CHAT',
        start: { row: 0, col: 0 },
        end: { row: 0, col: 3 },
      },
    })
    if (result.kind !== 'hit') return
    const state = addHit(EMPTY_STATE, result.hit)
    const again = checkSelection(LIST, state.found, {
      from: { row: 0, col: 0 },
      to: { row: 0, col: 3 },
    })
    expect(again.kind).toBe('already')
    expect(
      checkSelection(LIST, [], { from: { row: 1, col: 0 }, to: { row: 1, col: 2 } }).kind,
    ).toBe('miss')
  })

  it('montre un mot et lit le mot mystère dans les lettres restantes', () => {
    expect(locate(LIST, 'CHIEN')?.end).toEqual({ row: 4, col: 0 })
    expect(mysteryOf(LIST).letters).toBe('OUI')
    expect(isMystery(LIST, ' oui ')).toBe(true)
    expect(isMystery(LIST, 'non')).toBe(false)
  })
})
