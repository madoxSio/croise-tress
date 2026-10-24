import type { CatalogTheme } from '@crossverse/contracts'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LOOK, findTheme, levelOf, lookOf, parentTheme } from '../src/game/catalog'

const counts = { discovery: 0, easy: 1, intermediate: 0, hard: 0, expert: 0 }
const node = (slug: string, accent: string) => ({
  slug,
  name: slug,
  description: '',
  skin: slug,
  icon: '⚽',
  accent,
  accentAlt: '#000000',
  puzzleCount: 1,
  counts,
})
const THEMES: CatalogTheme[] = [
  { ...node('football', '#118a3a'), children: [node('ligue-des-champions', '#1d2a8f')] },
]

describe('catalogue (mobile)', () => {
  it('regroupe les cinq difficultés en trois niveaux', () => {
    expect(levelOf('discovery').id).toBe('simple')
    expect(levelOf('intermediate').id).toBe('medium')
    expect(levelOf('expert').id).toBe('hard')
  })

  it('trouve un sous-thème et son thème principal', () => {
    expect(findTheme(THEMES, 'ligue-des-champions')?.accent).toBe('#1d2a8f')
    expect(parentTheme(THEMES, 'ligue-des-champions')?.slug).toBe('football')
    expect(parentTheme(THEMES, 'football')?.slug).toBe('football')
  })

  it('retombe sur l’habillage par défaut pour un thème inconnu', () => {
    expect(lookOf(THEMES, 'inconnu')).toEqual(DEFAULT_LOOK)
    expect(lookOf(THEMES, 'football').accent).toBe('#118a3a')
  })
})
