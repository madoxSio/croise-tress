import type { Difficulty } from '@crossverse/contracts'
import type { Direction } from '@crossverse/crossword-core'

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
