import { z } from 'zod'
import { directionSchema, positionSchema, uuidSchema } from './common.js'
import { publicPuzzleSchema } from './puzzles.js'

/** Chemin Socket.IO, servi par l'API sous la même origine que le web. */
export const SOCKET_PATH = '/ws'
export const MATCH_DURATION_MS = 15 * 60 * 1000
export const RECONNECT_GRACE_MS = 30 * 1000
export const MAX_SOCKET_MESSAGE_BYTES = 4096

/** Identifiant fourni par le client pour chaque action : rejouer la même action n'a aucun effet. */
const clientEventIdSchema = z.string().min(8).max(64)

export const inviteCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/)

// --- Client → serveur -------------------------------------------------------

export const queueJoinSchema = z.strictObject({ clientEventId: clientEventIdSchema })
export const inviteCreateSchema = z.strictObject({ clientEventId: clientEventIdSchema })
export const inviteAcceptSchema = z.strictObject({
  clientEventId: clientEventIdSchema,
  code: inviteCodeSchema,
})
export const submitWordSchema = z.strictObject({
  clientEventId: clientEventIdSchema,
  matchId: uuidSchema,
  direction: directionSchema,
  number: z.int().positive(),
  answer: z.string().min(1).max(30),
})
/** Indice payant en duel : révèle la lettre d'une case, au seul joueur qui l'achète. */
export const matchHintSchema = z.strictObject({
  clientEventId: clientEventIdSchema,
  matchId: uuidSchema,
  cell: positionSchema,
})
export const matchHintResultSchema = z.strictObject({
  row: z.int(),
  col: z.int(),
  letter: z.string(),
  /** Solde de Coumba points après l'achat. */
  balance: z.int().min(0),
})
export type MatchHintResult = z.infer<typeof matchHintResultSchema>

export const matchRefSchema = z.strictObject({
  clientEventId: clientEventIdSchema,
  matchId: uuidSchema,
})

// --- Serveur → client -------------------------------------------------------

export const participantViewSchema = z.strictObject({
  userId: uuidSchema,
  username: z.string().nullable(),
  solvedCount: z.int(),
  connected: z.boolean(),
  result: z.enum(['win', 'loss', 'draw']).nullable(),
})

export const solvedWordSchema = z.strictObject({
  direction: directionSchema,
  number: z.int(),
  answer: z.string(),
})

/**
 * Vue d'un match pour un joueur : ses propres mots trouvés (avec les lettres) et,
 * pour l'adversaire, uniquement le nombre de mots trouvés.
 */
export const matchStateSchema = z.strictObject({
  id: uuidSchema,
  mode: z.enum(['quick', 'private']),
  status: z.enum(['waiting', 'active', 'finished', 'aborted']),
  inviteCode: z.string().nullable(),
  puzzle: publicPuzzleSchema.nullable(),
  totalWords: z.int(),
  startedAt: z.iso.datetime().nullable(),
  deadlineAt: z.iso.datetime().nullable(),
  serverTime: z.iso.datetime(),
  endReason: z.string().nullable(),
  winnerId: uuidSchema.nullable(),
  me: z.strictObject({ userId: uuidSchema, solvedWords: z.array(solvedWordSchema) }),
  participants: z.array(participantViewSchema),
})
export type MatchState = z.infer<typeof matchStateSchema>

/** Réponse (accusé de réception Socket.IO) à chaque événement client. */
export type Ack<T = undefined> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export interface ClientToServerEvents {
  'queue:join': (
    payload: z.input<typeof queueJoinSchema>,
    ack: (res: Ack<{ status: 'queued' | 'matched' }>) => void,
  ) => void
  'queue:leave': (payload: Record<string, never>, ack: (res: Ack) => void) => void
  'invite:create': (
    payload: z.input<typeof inviteCreateSchema>,
    ack: (res: Ack<MatchState>) => void,
  ) => void
  'invite:accept': (
    payload: z.input<typeof inviteAcceptSchema>,
    ack: (res: Ack<MatchState>) => void,
  ) => void
  'match:submit-word': (
    payload: z.input<typeof submitWordSchema>,
    ack: (res: Ack<{ correct: boolean; state: MatchState }>) => void,
  ) => void
  'match:hint': (
    payload: z.input<typeof matchHintSchema>,
    ack: (res: Ack<MatchHintResult>) => void,
  ) => void
  'match:forfeit': (
    payload: z.input<typeof matchRefSchema>,
    ack: (res: Ack<MatchState>) => void,
  ) => void
  'match:resync': (
    payload: z.input<typeof matchRefSchema>,
    ack: (res: Ack<MatchState>) => void,
  ) => void
}

export interface ServerToClientEvents {
  /** État complet, envoyé au démarrage, à la reconnexion et à chaque changement notable. */
  'match:state': (state: MatchState) => void
}
