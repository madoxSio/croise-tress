import { describe, expect, it } from 'vitest'
import { clueSpoken, clueTag } from '../src/game/labels'

const across = { direction: 'across', number: 12, row: 3, col: 4 } as const
const down = { direction: 'down', number: 7, row: 0, col: 3 } as const

describe('repères de définition', () => {
  it('grille en croix : numéro et sens', () => {
    expect(clueTag(across, false)).toBe('12 horizontal')
    expect(clueSpoken(down, false)).toBe('vertical 7')
  })

  it('mots croisés classiques : ligne en chiffres romains, colonne en chiffres arabes', () => {
    expect(clueTag(across, true)).toBe('Ligne IV')
    expect(clueTag(down, true)).toBe('Colonne 4')
    expect(clueSpoken(across, true)).toBe('ligne 4')
  })
})
