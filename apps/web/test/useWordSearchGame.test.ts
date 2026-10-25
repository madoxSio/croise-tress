import { describe, expect, it } from 'vitest'
import type { WordSearchDto } from '@crossverse/contracts'
import { useWordSearchGame } from '../app/composables/useWordSearchGame'
import { puzzlePath } from '../app/utils/playModes'
import { parsePreferences } from '../app/utils/preferences'
import { hitColor } from '../app/utils/wordsearch'

const DATA: WordSearchDto = {
  puzzleId: '00000000-0000-4000-8000-000000000001',
  seed: 1,
  format: 'freeform',
  size: 4,
  rows: ['BALL', 'XEZA', 'QRTE', 'MNOP'],
  directions: { diagonals: true, reversed: false },
  clues: [
    { direction: 'across', number: 1, text: 'Sphère de jeu', length: 4, row: 0, col: 0 },
    { direction: 'down', number: 2, text: 'Autre mot', length: 3, row: 0, col: 1 },
  ],
}

describe('useWordSearchGame', () => {
  it('sélectionne par deux taps : première puis dernière lettre', () => {
    const game = useWordSearchGame(DATA)
    expect(game.press({ row: 0, col: 0 })).toBeNull()
    expect(game.anchor).toEqual({ row: 0, col: 0 })
    expect(game.press({ row: 0, col: 3 })).toEqual({
      from: { row: 0, col: 0 },
      to: { row: 0, col: 3 },
    })
    expect(game.anchor).toBeNull()
  })

  it('un second tap sur la première lettre annule la sélection', () => {
    const game = useWordSearchGame(DATA)
    game.press({ row: 1, col: 1 })
    expect(game.press({ row: 1, col: 1 })).toBeNull()
    expect(game.anchor).toBeNull()
  })

  it('aligne l’aperçu d’un glisser imprécis et le borne à la grille', () => {
    const game = useWordSearchGame(DATA)
    game.begin({ row: 0, col: 0 })
    game.aim({ row: 1, col: 3 })
    expect(game.preview).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ])
    game.aim({ row: 9, col: 9 })
    expect(game.preview.at(-1)).toEqual({ row: 3, col: 3 })
    expect(game.finish()).toEqual({ from: { row: 0, col: 0 }, to: { row: 3, col: 3 } })
  })

  it('une sélection d’une seule case n’est pas soumise', () => {
    const game = useWordSearchGame(DATA)
    game.begin({ row: 2, col: 2 })
    expect(game.finish()).toBeNull()
    expect(game.anchor).toEqual({ row: 2, col: 2 })
  })

  it('déplace le curseur au clavier sans sortir de la grille et suit la sélection', () => {
    const game = useWordSearchGame(DATA)
    game.moveCursor(-1, -1)
    expect(game.cursor).toEqual({ row: 0, col: 0 })
    game.press(game.cursor)
    game.moveCursor(0, 1)
    game.moveCursor(0, 1)
    expect(game.preview).toHaveLength(3)
  })

  it('compte les mots trouvés, ignore les doublons et détecte la fin', () => {
    const game = useWordSearchGame(DATA)
    const hit = {
      direction: 'across' as const,
      number: 1,
      answer: 'BALL',
      start: { row: 0, col: 0 },
      end: { row: 0, col: 3 },
    }
    expect(game.addHit(hit)).toBe(true)
    expect(game.addHit(hit)).toBe(false)
    expect(game.complete).toBe(false)
    game.addHit({ ...hit, direction: 'down', number: 2, answer: 'AET' }, true)
    expect(game.found.size).toBe(2)
    expect(game.foundCount).toBe(1)
    expect(game.complete).toBe(true)
    expect(game.foundRefs).toEqual([
      { direction: 'across', number: 1 },
      { direction: 'down', number: 2 },
    ])
  })
})

describe('modes de jeu', () => {
  it('construit l’adresse de chaque mode', () => {
    expect(puzzlePath('abc')).toBe('/play/abc')
    expect(puzzlePath('abc', 'prefilled')).toBe('/pre-remplie/abc')
  })

  it('lit le mode préféré en ignorant une valeur inconnue', () => {
    expect(parsePreferences('{"playMode":"prefilled"}').playMode).toBe('prefilled')
    expect(parsePreferences('{"playMode":"triche"}').playMode).toBe('classic')
    expect(parsePreferences(null).playMode).toBe('classic')
  })

  it('colore les mots trouvés par ordre et grise les mots montrés', () => {
    expect(hitColor({ order: 0, revealed: false })).not.toBe(
      hitColor({ order: 1, revealed: false }),
    )
    expect(hitColor({ order: 0, revealed: true })).toBe(hitColor({ order: 5, revealed: true }))
  })
})
