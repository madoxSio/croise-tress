import { useColorScheme } from 'react-native'

/** Palettes reprises du thème « minimal » du web (clair) et de son pendant sombre. */
const light = {
  bg: '#f6f6f3',
  surface: '#ffffff',
  surface2: '#efefeb',
  fg: '#17181c',
  muted: '#5c5f6a',
  line: '#d9d9d3',
  accent: '#2f4fd8',
  accentFg: '#ffffff',
  accentSoft: '#e3e8ff',
  danger: '#b42318',
  dangerSoft: '#fde4e1',
  success: '#17803d',
  cell: '#ffffff',
  block: '#1d1e23',
  word: '#dfe6ff',
  cursor: '#ffd84d',
  cursorFg: '#17181c',
  revealed: '#6d3fc4',
}

export type Palette = typeof light

const dark: Palette = {
  bg: '#111216',
  surface: '#1b1d23',
  surface2: '#252830',
  fg: '#f1f1f4',
  muted: '#a3a7b3',
  line: '#343843',
  accent: '#8fa6ff',
  accentFg: '#0d1020',
  accentSoft: '#232b4d',
  danger: '#ff8a7a',
  dangerSoft: '#3b1d1a',
  success: '#5fd68b',
  cell: '#1b1d23',
  block: '#000000',
  word: '#2a3358',
  cursor: '#e8c33a',
  cursorFg: '#111216',
  revealed: '#c3a5ff',
}

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light
}

export const radius = { card: 16, pill: 999 } as const
/** Taille minimale d'une cible tactile (WCAG 2.5.8, recommandations iOS et Android). */
export const TOUCH_TARGET = 44
