import { describe, expect, it } from 'vitest'
import { normalizeAnswer, normalizeLetter } from '../src/index.js'

describe('normalizeAnswer', () => {
  it.each([
    ['élève', 'ELEVE'],
    ['Garçon', 'GARCON'],
    ['cœur', 'COEUR'],
    ['Ægée', 'AEGEE'],
    ["aujourd'hui", 'AUJOURDHUI'],
    ['aujourd’hui', 'AUJOURDHUI'],
    ['arc-en-ciel', 'ARCENCIEL'],
    ['pomme de terre', 'POMMEDETERRE'],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(normalizeAnswer(input)).toBe(expected)
  })

  it.each(['R2D2', 'abc!', 'привет', '<script>'])('rejette %s', (input) => {
    expect(normalizeAnswer(input)).toBeNull()
  })
})

describe('normalizeLetter', () => {
  it('accepte une seule lettre, accentuée ou non', () => {
    expect(normalizeLetter('é')).toBe('E')
    expect(normalizeLetter('z')).toBe('Z')
  })

  it.each(['', 'ab', 'œ', '1', ' '])('rejette « %s »', (input) => {
    expect(normalizeLetter(input)).toBeNull()
  })
})
