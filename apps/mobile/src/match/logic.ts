/**
 * Logique pure du duel (testée unitairement) : horloge, camps, code d'invitation, libellés de
 * fin, et report dans la grille des mots validés par le serveur. Reprise de
 * `apps/web/app/composables/useMatch.ts`.
 */
import { inviteCodeSchema, type MatchState } from '@crossverse/contracts'
import { slotCells, type Direction } from '@crossverse/crossword-core'
import type { PublicPuzzle } from '@crossverse/crossword-core'
import { gameReducer, type GameState } from '../game/state'

export type Participant = MatchState['participants'][number]
export type MatchOutcome = 'win' | 'loss' | 'draw'

/** Clé d'un mot, identique à celle du serveur (`3-down`). */
export const matchWordKey = (direction: Direction, number: number): string =>
  `${number}-${direction}`

/** Écart (ms) entre l'horloge du serveur et l'horloge locale au moment de la réception. */
export function matchClockOffset(
  state: Pick<MatchState, 'serverTime'>,
  receivedAt: number,
): number {
  const server = Date.parse(state.serverTime)
  return Number.isNaN(server) ? 0 : server - receivedAt
}

/** Temps restant affiché, ou `null` hors match en cours. Jamais négatif. */
export function matchRemainingMs(
  state: Pick<MatchState, 'status' | 'deadlineAt'> | null,
  offsetMs: number,
  now: number,
): number | null {
  if (state?.status !== 'active' || state.deadlineAt === null) return null
  const deadline = Date.parse(state.deadlineAt)
  if (Number.isNaN(deadline)) return null
  return Math.max(0, deadline - (now + offsetMs))
}

/** Le joueur et son adversaire (absent tant qu'une invitation n'est pas acceptée). */
export function matchSides(state: MatchState | null): {
  me: Participant | undefined
  opponent: Participant | undefined
} {
  if (!state) return { me: undefined, opponent: undefined }
  return {
    me: state.participants.find((p) => p.userId === state.me.userId),
    opponent: state.participants.find((p) => p.userId !== state.me.userId),
  }
}

/** Saisie d'un code d'invitation : majuscules, sans espaces ni tirets. `null` si invalide. */
export function normalizeInviteCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '')
  return inviteCodeSchema.safeParse(code).success ? code : null
}

/** Phrase expliquant la fin d'un match, du point de vue du joueur. */
export function matchEndLabel(state: MatchState): string {
  if (state.status === 'aborted') return 'Invitation annulée.'
  const won = state.winnerId === state.me.userId
  switch (state.endReason) {
    case 'completed':
      return won
        ? 'Vous avez trouvé tous les mots en premier.'
        : 'Votre adversaire a tout trouvé en premier.'
    case 'deadline':
      return state.winnerId === null
        ? 'Temps écoulé : égalité parfaite.'
        : 'Temps écoulé : victoire au nombre de mots trouvés (puis au plus rapide).'
    case 'forfeit':
      return won ? 'Votre adversaire a abandonné.' : 'Vous avez abandonné.'
    case 'disconnect':
      return won
        ? 'Votre adversaire ne s’est pas reconnecté à temps.'
        : 'Vous avez été déconnecté trop longtemps.'
    default:
      return 'Match terminé.'
  }
}

/**
 * Réécrit dans la grille les mots validés par le serveur (lettres renvoyées à ce seul joueur)
 * et les marque justes ; la saisie libre des autres cases est conservée.
 */
export function applySolved(
  puzzle: PublicPuzzle,
  game: GameState,
  solved: MatchState['me']['solvedWords'],
): GameState {
  const grid = game.grid.map((line) => [...line])
  const cells: { row: number; col: number; result: 'correct' }[] = []
  for (const word of solved) {
    const clue = puzzle.clues.find(
      (c) => c.direction === word.direction && c.number === word.number,
    )
    if (!clue) continue
    const slot = slotCells(clue)
    // Garde-fou : une réponse dont la longueur ne correspond pas aux cases n'est pas écrite.
    if (word.answer.length !== slot.length) continue
    slot.forEach((cell, index) => {
      const line = grid[cell.row]
      if (line) line[cell.col] = word.answer.charAt(index)
      cells.push({ ...cell, result: 'correct' })
    })
  }
  const loaded = gameReducer(puzzle, game, { type: 'load', grid })
  return gameReducer(puzzle, loaded, { type: 'checked', cells })
}

/** Mots complets, pas encore validés, avec les lettres saisies (candidats à la soumission). */
export function completedWords(
  puzzle: PublicPuzzle,
  game: GameState,
  solvedKeys: ReadonlySet<string>,
): { direction: Direction; number: number; answer: string; key: string }[] {
  const words: { direction: Direction; number: number; answer: string; key: string }[] = []
  for (const clue of puzzle.clues) {
    const key = matchWordKey(clue.direction, clue.number)
    if (solvedKeys.has(key)) continue
    const letters = slotCells(clue).map((cell) => game.grid[cell.row]?.[cell.col] ?? null)
    if (letters.some((letter) => letter === null)) continue
    words.push({ direction: clue.direction, number: clue.number, answer: letters.join(''), key })
  }
  return words
}
