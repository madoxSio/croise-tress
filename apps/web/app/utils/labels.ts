import type { Difficulty } from '@crossverse/contracts'
import { classicLabel, type Direction, type PublicClue } from '@crossverse/crossword-core'

export const DIFFICULTIES: readonly Difficulty[] = [
  'discovery',
  'easy',
  'intermediate',
  'hard',
  'expert',
]

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  discovery: 'Découverte',
  easy: 'Facile',
  intermediate: 'Intermédiaire',
  hard: 'Difficile',
  expert: 'Expert',
}

const isDifficulty = (value: string): value is Difficulty =>
  (DIFFICULTIES as readonly string[]).includes(value)

/** Libellé français d'un niveau ; une valeur inconnue est affichée telle quelle. */
export function difficultyLabel(value: string): string {
  return isDifficulty(value) ? DIFFICULTY_LABELS[value] : value
}

export function directionLabel(direction: Direction): string {
  return direction === 'across' ? 'Horizontal' : 'Vertical'
}

type LocatedClue = Pick<PublicClue, 'direction' | 'number' | 'row' | 'col'>

/**
 * Repère court d'une définition : « 3H » pour une grille en croix, « Ligne III » ou
 * « Col. 4 » pour des mots croisés classiques (numérotation par ligne et par colonne).
 */
export function clueTag(clue: LocatedClue, classic: boolean): string {
  if (classic) return `${clue.direction === 'across' ? 'Ligne' : 'Col.'} ${classicLabel(clue)}`
  return `${String(clue.number)}${clue.direction === 'across' ? 'H' : 'V'}`
}

/** Même repère, en toutes lettres pour les lecteurs d'écran (pas de chiffres romains). */
export function clueSpoken(clue: LocatedClue, classic: boolean): string {
  if (classic) {
    return clue.direction === 'across'
      ? `ligne ${String(clue.row + 1)}`
      : `colonne ${String(clue.col + 1)}`
  }
  return `${String(clue.number)} ${clue.direction === 'across' ? 'horizontal' : 'vertical'}`
}

/** Durée lisible : « 4 min 05 s », « 1 h 02 min ». */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`
  return `${minutes} min ${String(seconds).padStart(2, '0')} s`
}

/** Chronomètre compact « 04:05 » (affichage seulement : le temps officiel vient du serveur). */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : dateFormatter.format(date)
}
