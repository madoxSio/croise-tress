import { useColorScheme } from 'react-native'

/** Palettes reprises du thème clair du web et de son pendant sombre (apps/web/app/assets/css/main.css). */
const light = {
  bg: '#f7f6fb',
  surface: '#ffffff',
  surface2: '#efedf7',
  fg: '#16132a',
  muted: '#5b5873',
  line: '#e1ddf0',
  accent: '#5634f0',
  accentFg: '#ffffff',
  accentSoft: '#ebe6ff',
  danger: '#b42318',
  dangerSoft: '#fde4e1',
  success: '#17803d',
  cell: '#ffffff',
  block: '#16132a',
  word: '#e4ddff',
  cursor: '#ffd84d',
  cursorFg: '#16132a',
  revealed: '#b4237a',
}

export type Palette = typeof light

const dark: Palette = {
  bg: '#0d0b17',
  surface: '#161323',
  surface2: '#201c31',
  fg: '#f2f0fa',
  muted: '#aaa5c2',
  line: '#2d2843',
  accent: '#a291ff',
  accentFg: '#0d0b17',
  accentSoft: '#2a2352',
  danger: '#ff8a7d',
  dangerSoft: '#4a1f1c',
  success: '#6fd394',
  cell: '#1b182a',
  block: '#05040a',
  word: '#2f2763',
  cursor: '#f2c94c',
  cursorFg: '#0d0b17',
  revealed: '#ff8fc8',
}

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light
}

export const radius = { card: 16, pill: 999 } as const
/** Taille minimale d'une cible tactile (WCAG 2.5.8, recommandations iOS et Android). */
export const TOUCH_TARGET = 44
