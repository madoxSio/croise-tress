import { describe, expect, it } from 'vitest'
import {
  buildWordList,
  leftoverLetters,
  matchWordList,
  validateWordList,
  wordOccurrences,
} from '../src/index.js'

// CHAT à l'horizontale et CHIEN à la verticale partagent le C ; COO se lit en diagonale.
const GRID = {
  rows: ['CHATM', 'HOIAI', 'ISOAU', 'EBXAK', 'NQZWO'],
  words: ['CHAT', 'CHIEN'],
  mystery: '',
}

const FORWARD = { diagonals: false, reversed: false }
const ALL = { diagonals: true, reversed: true }

describe('wordOccurrences', () => {
  it('trouve un mot dans les huit sens, une seule fois pour un palindrome', () => {
    expect(wordOccurrences(GRID.rows, 'CHAT')).toEqual([
      { word: 'CHAT', start: { row: 0, col: 0 }, end: { row: 0, col: 3 } },
    ])
    expect(wordOccurrences(['ABA', 'XYZ', 'QRS'], 'ABA')).toHaveLength(1)
    expect(wordOccurrences(GRID.rows, 'TAHC')).toHaveLength(1)
  })
})

describe('matchWordList', () => {
  it('accepte un mot tracé dans un sens comme dans l’autre, orienté dans son sens de lecture', () => {
    const forward = matchWordList(GRID, { row: 0, col: 0 }, { row: 0, col: 3 }, FORWARD)
    const backward = matchWordList(GRID, { row: 0, col: 3 }, { row: 0, col: 0 }, FORWARD)
    expect(forward).toEqual({ word: 'CHAT', start: { row: 0, col: 0 }, end: { row: 0, col: 3 } })
    expect(backward).toEqual(forward)
  })

  it('refuse un mot déjà trouvé, un tracé non aligné ou des lettres hors liste', () => {
    const from = { row: 0, col: 0 }
    expect(
      matchWordList(GRID, from, { row: 0, col: 3 }, FORWARD, new Set(['CHAT'])),
    ).toBeUndefined()
    expect(matchWordList(GRID, from, { row: 1, col: 3 }, FORWARD)).toBeUndefined()
    expect(matchWordList(GRID, from, { row: 0, col: 2 }, FORWARD)).toBeUndefined()
  })

  it('ne reconnaît un mot écrit à l’envers ou en diagonale qu’aux niveaux qui le permettent', () => {
    const reversed = { rows: ['TAHCX', ...GRID.rows.slice(1)], words: ['CHAT'] }
    const from = { row: 0, col: 3 }
    const to = { row: 0, col: 0 }
    expect(matchWordList(reversed, from, to, FORWARD)).toBeUndefined()
    expect(matchWordList(reversed, from, to, ALL)?.word).toBe('CHAT')
    const diagonal = { rows: GRID.rows, words: ['COO'] }
    expect(matchWordList(diagonal, { row: 0, col: 0 }, { row: 2, col: 2 }, FORWARD)).toBeUndefined()
    expect(matchWordList(diagonal, { row: 0, col: 0 }, { row: 2, col: 2 }, ALL)?.word).toBe('COO')
  })
})

describe('leftoverLetters', () => {
  it('lit les lettres non rayées de gauche à droite, de haut en bas', () => {
    const hits = [
      { start: { row: 0, col: 0 }, end: { row: 0, col: 3 } },
      { start: { row: 0, col: 0 }, end: { row: 4, col: 0 } },
    ]
    const { letters, cells } = leftoverLetters(['CHATM', 'HXY', 'IZW'], hits.slice(0, 1))
    expect(letters).toBe('MHXYIZW')
    expect(cells[0]).toEqual({ row: 0, col: 4 })
    expect(leftoverLetters(GRID.rows, hits).letters).toBe('MOIAISOAUBXAKQZWO')
  })
})

describe('validateWordList', () => {
  it('signale un mot absent, en double ou illisible au niveau choisi, et un mot mystère faux', () => {
    const problems = validateWordList(
      { rows: ['CHAT', 'XTAH', 'CHAT', 'ABCD'], words: ['CHAT', 'DOG', 'ABCD'], mystery: 'NON' },
      FORWARD,
    ).map((p) => p.message)
    expect(problems).toContain('« CHAT » apparaît 2 fois.')
    expect(problems).toContain('« DOG » apparaît 0 fois.')
    expect(problems.some((m) => m.startsWith('Lettres restantes'))).toBe(true)
    expect(
      validateWordList(
        { rows: ['TAHC', 'XYZW', 'QRSV', 'ABDE'], words: ['CHAT'], mystery: '' },
        FORWARD,
      )[0]?.message,
    ).toBe("« CHAT » n'est pas lisible dans les sens de ce niveau.")
  })
})

describe('buildWordList', () => {
  it('complète avec des mots du thème jusqu’à laisser la place exacte du mot mystère', () => {
    const input = {
      words: ['LION', 'TIGRE', 'ZEBRE', 'GIRAFE'],
      extras: ['PANDA', 'OURS', 'LOUP', 'RAT', 'GNOU', 'YAK', 'EMU', 'COBRA'],
      mystery: 'SAVANE',
      size: 6,
      directions: { diagonals: true, reversed: false },
      seed: 1,
      attempts: 300,
    }
    let built: { rows: string[]; words: string[] } | null = null
    for (let seed = 1; seed < 50 && !built; seed++) built = buildWordList({ ...input, seed })
    if (!built) throw new Error('aucune grille trouvée')
    expect(validateWordList({ ...input, ...built }, input.directions)).toEqual([])
    expect(built.words).toEqual(expect.arrayContaining(input.words))
  })
})
