import { describe, expect, it } from 'vitest'
import type { PublicPuzzle } from '@crossverse/crossword-core'
import { useCrosswordGame } from '../app/composables/useCrosswordGame'

/**
 * Structure publique (sans solution) d'une grille 5×5 :
 *
 *   1 . 2 . 3
 *   . # . # .
 *   4 . . . .
 *   . # . # .
 *   5 . . . .
 */
const BLOCKS = new Set(['1:1', '1:3', '3:1', '3:3'])
const NUMBERS: Record<string, number> = { '0:0': 1, '0:2': 2, '0:4': 3, '2:0': 4, '4:0': 5 }

const PUZZLE: PublicPuzzle = {
  id: 'test',
  title: 'Table',
  width: 5,
  height: 5,
  cells: Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 5 }, (_, col) => {
      const key = `${row}:${col}`
      if (BLOCKS.has(key)) return { block: true as const }
      const number = NUMBERS[key]
      return number === undefined ? { block: false as const } : { block: false as const, number }
    }),
  ),
  clues: [
    { direction: 'down', number: 1, text: 'D1', row: 0, col: 0, length: 5 },
    { direction: 'across', number: 1, text: 'A1', row: 0, col: 0, length: 5 },
    { direction: 'across', number: 4, text: 'A4', row: 2, col: 0, length: 5 },
    { direction: 'across', number: 5, text: 'A5', row: 4, col: 0, length: 5 },
    { direction: 'down', number: 2, text: 'D2', row: 0, col: 2, length: 5 },
    { direction: 'down', number: 3, text: 'D3', row: 0, col: 4, length: 5 },
  ],
}

const setup = (initialGrid?: (string | null)[][]) =>
  useCrosswordGame(PUZZLE, initialGrid ? { initialGrid } : {})

describe('useCrosswordGame — sélection et direction', () => {
  it('sélectionne une case dans la direction préférée, puis bascule au re-clic', () => {
    const game = setup()
    game.select({ row: 0, col: 2 })
    expect(game.active.value).toEqual({ row: 0, col: 2 })
    expect(game.direction.value).toBe('across')
    expect(game.activeClue.value?.number).toBe(1)

    game.select({ row: 0, col: 2 })
    expect(game.direction.value).toBe('down')
    expect(game.activeClue.value?.number).toBe(2)
  })

  it('prend la seule direction possible et ignore les cases noires', () => {
    const game = setup()
    game.select({ row: 1, col: 0 })
    expect(game.direction.value).toBe('down')

    game.select({ row: 1, col: 1 })
    expect(game.active.value).toEqual({ row: 1, col: 0 })

    // Pas de mot horizontal ici : la bascule ne change rien.
    game.toggleDirection()
    expect(game.direction.value).toBe('down')
  })

  it('met en évidence les cases du mot actif et donne le mot croisé', () => {
    const game = setup()
    game.select({ row: 2, col: 2 })
    expect([...game.highlighted.value].sort()).toEqual(['2:0', '2:1', '2:2', '2:3', '2:4'])
    expect(game.crossingClue.value?.number).toBe(2)
  })

  it('sélectionne un mot depuis la liste sur sa première case vide', () => {
    const game = setup([
      [null, null, 'X', null, null],
      [null, null, 'Y', null, null],
      [null, null, null, null, null],
      [null, null, null, null, null],
      [null, null, null, null, null],
    ])
    game.selectClue({ direction: 'down', number: 2 })
    expect(game.active.value).toEqual({ row: 2, col: 2 })
    expect(game.direction.value).toBe('down')
  })
})

describe('useCrosswordGame — navigation clavier', () => {
  it('les flèches sautent les cases noires et alignent la direction', () => {
    const game = setup()
    game.select({ row: 0, col: 1 })
    game.move(1, 0)
    // (1,1) est noire : on arrive en (2,1), qui n'a qu'un mot horizontal.
    expect(game.active.value).toEqual({ row: 2, col: 1 })
    expect(game.direction.value).toBe('across')

    game.select({ row: 2, col: 0 })
    game.move(1, 0)
    expect(game.active.value).toEqual({ row: 3, col: 0 })
    expect(game.direction.value).toBe('down')
  })

  it('reste sur place au bord de la grille', () => {
    const game = setup()
    game.select({ row: 0, col: 0 })
    game.move(-1, 0)
    expect(game.active.value).toEqual({ row: 0, col: 0 })
    expect(game.direction.value).toBe('down')
  })

  it('Tab et Maj+Tab parcourent les mots en boucle (horizontaux puis verticaux)', () => {
    const game = setup()
    expect(game.clues.map((c) => `${c.number}${c.direction[0] ?? ''}`)).toEqual([
      '1a',
      '4a',
      '5a',
      '1d',
      '2d',
      '3d',
    ])
    game.selectClue({ direction: 'across', number: 5 })
    game.moveToClue(1)
    expect(game.activeClue.value).toMatchObject({ direction: 'down', number: 1 })

    game.selectClue({ direction: 'across', number: 1 })
    game.moveToClue(-1)
    expect(game.activeClue.value).toMatchObject({ direction: 'down', number: 3 })
  })
})

describe('useCrosswordGame — saisie', () => {
  it('normalise la saisie (accents, ligatures) et avance automatiquement', () => {
    const game = setup()
    game.select({ row: 0, col: 0 })
    expect(game.input('é')).toBe(1)
    expect(game.letterAt({ row: 0, col: 0 })).toBe('E')
    expect(game.active.value).toEqual({ row: 0, col: 1 })

    expect(game.input('œ')).toBe(2)
    expect(game.letterAt({ row: 0, col: 1 })).toBe('O')
    expect(game.letterAt({ row: 0, col: 2 })).toBe('E')
    expect(game.active.value).toEqual({ row: 0, col: 3 })
  })

  it('ignore les caractères non alphabétiques', () => {
    const game = setup()
    game.select({ row: 0, col: 0 })
    expect(game.input('4 ?-')).toBe(0)
    expect(game.letterAt({ row: 0, col: 0 })).toBeNull()
    expect(game.editCount.value).toBe(0)
  })

  it('en fin de mot, passe au mot suivant encore incomplet', () => {
    const game = setup()
    game.selectClue({ direction: 'across', number: 1 })
    game.input('table')
    expect(game.letterAt({ row: 0, col: 4 })).toBe('E')
    // 4 horizontal est le mot suivant et il est vide : curseur sur sa première case.
    expect(game.activeClue.value).toMatchObject({ direction: 'across', number: 4 })
    expect(game.active.value).toEqual({ row: 2, col: 0 })
  })

  it('accepte un collage de plusieurs lettres', () => {
    const game = setup()
    game.selectClue({ direction: 'down', number: 3 })
    game.input("l'é-lè ve")
    expect([0, 1, 2, 3, 4].map((row) => game.letterAt({ row, col: 4 }))).toEqual([
      'L',
      'E',
      'L',
      'E',
      'V',
    ])
  })

  it('Retour arrière efface la case pleine, sinon recule et efface', () => {
    const game = setup()
    game.select({ row: 0, col: 0 })
    game.input('ta')
    expect(game.active.value).toEqual({ row: 0, col: 2 })

    // Case active vide : recule sur (0,1) et l'efface.
    game.backspace()
    expect(game.active.value).toEqual({ row: 0, col: 1 })
    expect(game.letterAt({ row: 0, col: 1 })).toBeNull()

    game.select({ row: 0, col: 0 })
    game.select({ row: 0, col: 0 }) // bascule en vertical
    game.select({ row: 0, col: 0 }) // et revient en horizontal
    game.backspace()
    // Case pleine : effacée sur place.
    expect(game.letterAt({ row: 0, col: 0 })).toBeNull()
    expect(game.active.value).toEqual({ row: 0, col: 0 })

    // Début de mot vide : rien ne bouge.
    game.backspace()
    expect(game.active.value).toEqual({ row: 0, col: 0 })
  })

  it('bloque toute modification quand la partie est verrouillée', () => {
    const game = setup()
    game.select({ row: 0, col: 0 })
    game.locked.value = true
    expect(game.input('a')).toBe(0)
    game.backspace()
    game.clearActive()
    expect(game.editCount.value).toBe(0)
  })

  it('compte les éditions réelles, pas les chargements serveur', () => {
    const game = setup()
    game.select({ row: 0, col: 0 })
    game.input('a')
    game.select({ row: 0, col: 0 })
    game.select({ row: 0, col: 0 })
    game.input('a') // même lettre au même endroit : pas de changement
    expect(game.editCount.value).toBe(1)
    game.loadGrid(Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 'Z')))
    expect(game.editCount.value).toBe(1)
    // Les cases noires restent vides même si le serveur envoie une valeur.
    expect(game.letterAt({ row: 1, col: 1 })).toBeNull()
    expect(game.isFull.value).toBe(true)
  })
})

describe('useCrosswordGame — tracé', () => {
  it('sélectionne le mot couvert par un glissement aligné', () => {
    const game = setup()
    game.pointerStart({ row: 0, col: 4 })
    game.pointerMove({ row: 1, col: 4 })
    game.pointerMove({ row: 4, col: 4 })
    expect(game.dragPreview.value.size).toBe(5)
    expect(game.pointerEnd()).toBe(true)
    expect(game.active.value).toEqual({ row: 0, col: 4 })
    expect(game.direction.value).toBe('down')
    expect(game.activeClue.value?.number).toBe(3)
    expect(game.dragPreview.value.size).toBe(0)
  })

  it('ignore un tracé qui ne suit pas un mot', () => {
    const game = setup()
    game.select({ row: 2, col: 2 })
    game.pointerStart({ row: 0, col: 0 })
    game.pointerMove({ row: 2, col: 2 })
    expect(game.pointerEnd()).toBe(false)
    expect(game.active.value).toEqual({ row: 2, col: 2 })
  })

  it('un toucher sans glissement sélectionne, un second toucher change de direction', () => {
    const game = setup()
    game.pointerStart({ row: 2, col: 2 })
    game.pointerEnd()
    expect(game.direction.value).toBe('across')
    game.pointerStart({ row: 2, col: 2 })
    game.pointerMove({ row: 2, col: 2 })
    game.pointerEnd()
    expect(game.direction.value).toBe('down')
  })

  it('un geste commencé sur une case noire ne fait rien', () => {
    const game = setup()
    game.pointerStart({ row: 1, col: 1 })
    game.pointerMove({ row: 1, col: 2 })
    expect(game.pointerEnd()).toBe(false)
    expect(game.active.value).toBeNull()
  })
})

describe('useCrosswordGame — résultats serveur', () => {
  it('affiche les cases fausses et efface la marque quand la lettre change', () => {
    const game = setup()
    game.applyChecks([
      { row: 0, col: 0, result: 'incorrect' },
      { row: 0, col: 1, result: 'correct' },
      { row: 0, col: 2, result: 'empty' },
    ])
    expect(game.marks.value.get('0:0')).toBe('incorrect')
    expect(game.marks.value.get('0:1')).toBe('correct')
    expect(game.marks.value.has('0:2')).toBe(false)

    game.select({ row: 0, col: 0 })
    game.input('b')
    expect(game.marks.value.has('0:0')).toBe(false)
  })

  it('écrit les lettres révélées et les signale', () => {
    const game = setup()
    game.applyRevealed([
      { row: 4, col: 0, letter: 'E' },
      { row: 1, col: 1, letter: 'X' }, // case noire : ignorée
    ])
    expect(game.letterAt({ row: 4, col: 0 })).toBe('E')
    expect(game.revealed.value.has('4:0')).toBe(true)
    expect(game.letterAt({ row: 1, col: 1 })).toBeNull()
    expect(game.filledCount.value).toBe(1)
  })
})
