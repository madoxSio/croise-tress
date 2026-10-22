import { describe, expect, it } from 'vitest'
import {
  activeClue,
  crossingClue,
  filledCount,
  gameReducer,
  highlightedCells,
  initialState,
  type GameAction,
  type GameState,
} from '../src/game/state'
import { PUZZLE, emptyGrid } from './fixtures'

const run = (actions: GameAction[], start: GameState = initialState(PUZZLE)): GameState =>
  actions.reduce((state, action) => gameReducer(PUZZLE, state, action), start)

describe('état de jeu — sélection et direction', () => {
  it('sélectionne une case dans la direction courante, puis bascule au second toucher', () => {
    const first = run([{ type: 'select', position: { row: 0, col: 2 } }])
    expect(first.active).toEqual({ row: 0, col: 2 })
    expect(first.direction).toBe('across')
    expect(activeClue(PUZZLE, first)?.number).toBe(1)

    const second = gameReducer(PUZZLE, first, { type: 'select', position: { row: 0, col: 2 } })
    expect(second.direction).toBe('down')
    expect(activeClue(PUZZLE, second)?.number).toBe(2)
  })

  it('prend la seule direction possible et ignore les cases noires', () => {
    const state = run([{ type: 'select', position: { row: 1, col: 0 } }])
    expect(state.direction).toBe('down')
    expect(gameReducer(PUZZLE, state, { type: 'select', position: { row: 1, col: 1 } })).toBe(state)
  })

  it('met en évidence le mot actif et donne le mot croisé', () => {
    const state = run([{ type: 'select', position: { row: 2, col: 2 } }])
    expect([...highlightedCells(PUZZLE, state)]).toEqual(['2:0', '2:1', '2:2', '2:3', '2:4'])
    expect(crossingClue(PUZZLE, state)?.number).toBe(2)
  })

  it('sélectionne un mot depuis la liste sur sa première case vide', () => {
    const grid = emptyGrid()
    grid[2] = ['A', 'B', null, null, null]
    const state = run(
      [{ type: 'selectClue', clue: { direction: 'across', number: 4 } }],
      initialState(PUZZLE, grid),
    )
    expect(state.active).toEqual({ row: 2, col: 2 })
  })

  it('parcourt les mots en boucle, horizontaux puis verticaux', () => {
    const forward = run([
      { type: 'moveToClue', delta: 1 },
      { type: 'moveToClue', delta: 1 },
    ])
    expect(activeClue(PUZZLE, forward)?.number).toBe(4)
    const backward = run([{ type: 'moveToClue', delta: -1 }])
    expect(activeClue(PUZZLE, backward)).toMatchObject({ direction: 'down', number: 3 })
  })
})

describe('état de jeu — saisie', () => {
  it('normalise la saisie (accents, ligatures) et avance automatiquement', () => {
    const state = run([
      { type: 'select', position: { row: 0, col: 0 } },
      { type: 'input', text: 'éŒ' },
    ])
    expect(state.grid[0]?.slice(0, 3)).toEqual(['E', 'O', 'E'])
    expect(state.active).toEqual({ row: 0, col: 3 })
    expect(state.editCount).toBe(3)
  })

  it('ignore les caractères non alphabétiques', () => {
    const state = run([
      { type: 'select', position: { row: 0, col: 0 } },
      { type: 'input', text: '1 -?' },
    ])
    expect(state.editCount).toBe(0)
    expect(state.active).toEqual({ row: 0, col: 0 })
  })

  it('en fin de mot, passe au mot suivant encore incomplet', () => {
    const state = run([
      { type: 'select', position: { row: 0, col: 0 } },
      { type: 'input', text: 'ABCDE' },
    ])
    expect(activeClue(PUZZLE, state)).toMatchObject({ direction: 'across', number: 4 })
  })

  it('retour arrière : efface la case pleine, sinon recule et efface', () => {
    const typed = run([
      { type: 'select', position: { row: 2, col: 0 } },
      { type: 'input', text: 'AB' },
    ])
    expect(typed.active).toEqual({ row: 2, col: 2 })
    const back = gameReducer(PUZZLE, typed, { type: 'backspace' })
    expect(back.active).toEqual({ row: 2, col: 1 })
    expect(back.grid[2]?.[1]).toBeNull()
    const again = gameReducer(PUZZLE, back, { type: 'backspace' })
    expect(again.grid[2]?.[0]).toBeNull()
    expect(filledCount(PUZZLE, again)).toBe(0)
  })

  it('bloque toute modification quand la partie est verrouillée', () => {
    const state = run([
      { type: 'select', position: { row: 0, col: 0 } },
      { type: 'lock', locked: true },
      { type: 'input', text: 'A' },
      { type: 'backspace' },
    ])
    expect(state.editCount).toBe(0)
  })

  it('un chargement serveur ne compte pas comme une édition', () => {
    const grid = emptyGrid()
    grid[0] = ['A', 'B', 'C', 'D', 'E']
    const state = run([{ type: 'load', grid }])
    expect(state.grid[0]).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(state.editCount).toBe(0)
  })

  it('ne garde pas de lettre sur une case noire venant du serveur', () => {
    const grid = emptyGrid()
    grid[1] = ['A', 'X', 'B', 'X', 'C']
    expect(initialState(PUZZLE, grid).grid[1]).toEqual(['A', null, 'B', null, 'C'])
  })
})

describe('état de jeu — résultats serveur', () => {
  it('marque les cases vérifiées et efface la marque quand la lettre change', () => {
    const state = run([
      { type: 'select', position: { row: 0, col: 0 } },
      { type: 'input', text: 'AB' },
      {
        type: 'checked',
        cells: [
          { row: 0, col: 0, result: 'correct' },
          { row: 0, col: 1, result: 'incorrect' },
        ],
      },
    ])
    expect(state.marks.get('0:1')).toBe('incorrect')
    const fixed = run(
      [
        { type: 'select', position: { row: 0, col: 1 } },
        { type: 'select', position: { row: 0, col: 1 } },
        { type: 'select', position: { row: 0, col: 1 } },
        { type: 'input', text: 'Z' },
      ],
      state,
    )
    expect(fixed.marks.has('0:1')).toBe(false)
    expect(fixed.marks.get('0:0')).toBe('correct')
  })

  it('écrit les lettres révélées et les signale', () => {
    const state = run([{ type: 'revealed', cells: [{ row: 4, col: 4, letter: 'S' }] }])
    expect(state.grid[4]?.[4]).toBe('S')
    expect(state.revealed.has('4:4')).toBe(true)
    expect(state.editCount).toBe(0)
  })
})
