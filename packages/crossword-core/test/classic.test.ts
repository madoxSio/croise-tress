import { describe, expect, it } from 'vitest'
import { classicLabel, classicLines, toPublicPuzzle, toRoman } from '../src/index.js'
import { gridSlots, parsePuzzle } from '../src/index.js'

describe('toRoman', () => {
  it('écrit les numéros de ligne en chiffres romains', () => {
    expect([1, 2, 4, 9, 10, 14, 19, 25].map(toRoman)).toEqual([
      'I',
      'II',
      'IV',
      'IX',
      'X',
      'XIV',
      'XIX',
      'XXV',
    ])
  })

  it('renvoie le nombre tel quel hors des valeurs représentables', () => {
    expect(toRoman(0)).toBe('0')
    expect(toRoman(1.5)).toBe('1.5')
  })
})

describe('classicLines', () => {
  // Grille dense : deux mots sur la ligne II, deux mots dans la colonne 3.
  const grid = ['SALUER', 'E#ANGE', 'ARC#AU', 'NE#ILS', 'CIEL#S', 'ENNEMI']
  const parsed = parsePuzzle({
    id: 'classique',
    title: 'Classique',
    grid,
    clues: gridSlots(grid).map((slot) => ({
      direction: slot.direction,
      number: slot.number,
      text: slot.answer,
    })),
  })
  if (!parsed.ok) throw new Error(parsed.errors.map((error) => error.message).join(' '))
  const { clues } = toPublicPuzzle(parsed.value)

  it('regroupe les horizontaux par ligne, dans l’ordre de lecture', () => {
    const lines = classicLines(clues, 'across')
    expect(lines.map((line) => line.label)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI'])
    expect(lines[2]?.clues.map((clue) => clue.col)).toEqual([0, 4])
    expect(lines.every((line) => line.clues.every((clue) => clue.direction === 'across'))).toBe(
      true,
    )
  })

  it('regroupe les verticaux par colonne, de haut en bas', () => {
    const lines = classicLines(clues, 'down')
    expect(lines.map((line) => line.label)).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(lines[2]?.clues.map((clue) => clue.row)).toEqual([0, 4])
    expect(lines[3]?.clues.map((clue) => clue.row)).toEqual([0, 3])
  })

  it('donne le repère de ligne ou de colonne d’une définition', () => {
    expect(classicLabel({ direction: 'across', row: 3, col: 2 })).toBe('IV')
    expect(classicLabel({ direction: 'down', row: 3, col: 2 })).toBe('3')
  })
})
