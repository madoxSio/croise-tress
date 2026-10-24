import { z } from 'zod'
import { emailSchema, passwordSchema, usernameSchema } from './auth.js'
import { difficultySchema, directionSchema, uuidSchema } from './common.js'

/**
 * Contrats de l'espace d'administration (`/admin/*`). Ces routes sont réservées au rôle
 * `admin`, vérifié par le serveur à chaque requête ; un joueur reçoit une 404.
 * Contrairement aux contrats publics, `adminPuzzleSchema` contient la solution.
 */

const isoDateTime = z.iso.datetime()

/** `GET /admin/me` : sert au client à savoir s'il doit afficher l'entrée « Administration ». */
export const adminMeSchema = z.strictObject({ isAdmin: z.literal(true) })

export const adminOverviewSchema = z.strictObject({
  users: z.strictObject({
    registered: z.int(),
    verified: z.int(),
    guests: z.int(),
    admins: z.int(),
    suspended: z.int(),
    /** Comptes complets créés sur les 7 derniers jours. */
    newLast7Days: z.int(),
    /** Utilisateurs (invités compris) dont une session a servi sur les 7 derniers jours. */
    activeLast7Days: z.int(),
  }),
  plays: z.strictObject({
    started: z.int(),
    completed: z.int(),
    completedLast7Days: z.int(),
  }),
  matches: z.strictObject({
    finished: z.int(),
    active: z.int(),
    waiting: z.int(),
  }),
  puzzles: z.strictObject({ published: z.int(), draft: z.int() }),
  /** Inscriptions et parties terminées par jour (UTC), 30 derniers jours, jours vides inclus. */
  daily: z.array(
    z.strictObject({ date: z.iso.date(), registrations: z.int(), completions: z.int() }),
  ),
})
export type AdminOverview = z.infer<typeof adminOverviewSchema>

export const adminUserListQuerySchema = z.strictObject({
  /** Recherche par début de pseudo ou d'e-mail (insensible à la casse). */
  search: z.string().trim().max(64).optional(),
  /** Inclure les invités (sans compte) : exclus par défaut, ils sont très nombreux. */
  guests: z.enum(['true', 'false']).default('false'),
  /** Seulement les comptes suspendus. */
  suspended: z.enum(['true', 'false']).default('false'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: uuidSchema.optional(),
})

export const adminUserSummarySchema = z.strictObject({
  id: uuidSchema,
  username: z.string().nullable(),
  email: z.string().nullable(),
  role: z.enum(['player', 'admin']),
  isGuest: z.boolean(),
  emailVerified: z.boolean(),
  suspended: z.boolean(),
  createdAt: isoDateTime,
  lastSeenAt: isoDateTime.nullable(),
  playsCompleted: z.int(),
  matchesPlayed: z.int(),
  rating: z.int().nullable(),
})
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>

export const adminUserListSchema = z.strictObject({
  items: z.array(adminUserSummarySchema),
  nextCursor: uuidSchema.nullable(),
})
export type AdminUserList = z.infer<typeof adminUserListSchema>

/** Étape du parcours d'un joueur, du plus récent au plus ancien. */
export const journeyEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('account_created'), at: isoDateTime }),
  z.strictObject({ type: z.literal('email_verified'), at: isoDateTime }),
  z.strictObject({
    type: z.literal('play_started'),
    at: isoDateTime,
    puzzleId: uuidSchema,
    puzzleTitle: z.string(),
  }),
  z.strictObject({
    type: z.literal('play_completed'),
    at: isoDateTime,
    puzzleId: uuidSchema,
    puzzleTitle: z.string(),
    score: z.int().nullable(),
    durationMs: z.int().nullable(),
    hintsUsed: z.int(),
  }),
  z.strictObject({
    type: z.literal('match_finished'),
    at: isoDateTime,
    matchId: uuidSchema,
    mode: z.enum(['quick', 'private']),
    result: z.enum(['win', 'loss', 'draw']).nullable(),
    opponent: z.string().nullable(),
  }),
  z.strictObject({ type: z.literal('achievement'), at: isoDateTime, code: z.string() }),
])
export type JourneyEvent = z.infer<typeof journeyEventSchema>

export const adminUserDetailSchema = z.strictObject({
  user: adminUserSummarySchema,
  suspension: z.strictObject({ at: isoDateTime, reason: z.string().nullable() }).nullable(),
  stats: z.strictObject({
    playsStarted: z.int(),
    playsCompleted: z.int(),
    bestScore: z.int().nullable(),
    totalPlayMs: z.int(),
    hintsUsed: z.int(),
    favorites: z.int(),
    achievements: z.int(),
    activeSessions: z.int(),
    rating: z
      .strictObject({
        rating: z.int(),
        gamesPlayed: z.int(),
        wins: z.int(),
        losses: z.int(),
        draws: z.int(),
      })
      .nullable(),
  }),
  /** Derniers événements (au plus 100), du plus récent au plus ancien. */
  journey: z.array(journeyEventSchema),
})
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>

// --- Gestion des comptes ----------------------------------------------------

/** Suspension : sessions fermées, connexion refusée jusqu'à la réactivation. */
export const adminSuspendBodySchema = z.strictObject({
  reason: z.string().trim().min(1).max(200).optional(),
})

/**
 * Création d'un compte joueur confirmé. Sans mot de passe, le titulaire reçoit un e-mail pour
 * choisir le sien (l'administrateur ne le connaît jamais). Le rôle admin ne se donne pas ici.
 */
export const adminCreateUserBodySchema = z.strictObject({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema.optional(),
})
export type AdminCreateUserBody = z.infer<typeof adminCreateUserBodySchema>

export const adminCreatedUserSchema = z.strictObject({
  user: adminUserSummarySchema,
  /** Vrai si un e-mail de choix du mot de passe a été envoyé. */
  passwordEmailSent: z.boolean(),
})
export type AdminCreatedUser = z.infer<typeof adminCreatedUserSchema>

// --- Grilles ---------------------------------------------------------------

export const puzzleStatusSchema = z.enum(['draft', 'published'])
export type PuzzleStatus = z.infer<typeof puzzleStatusSchema>

export const adminClueSchema = z.strictObject({
  direction: directionSchema,
  number: z.int().positive().max(999),
  text: z.string().trim().min(1).max(200),
  explanation: z.string().trim().min(1).max(500).optional(),
})
export type AdminClue = z.infer<typeof adminClueSchema>

/**
 * Corps de création / modification d'une grille. La cohérence grille ↔ définitions
 * (mots, numérotation, connexité) est vérifiée par le moteur `crossword-core` côté serveur.
 */
export const adminPuzzleBodySchema = z.strictObject({
  slug: z
    .string()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'minuscules, chiffres et tirets'),
  title: z.string().trim().min(1).max(80),
  theme: z.string().trim().min(1).max(40),
  difficulty: difficultySchema,
  estimatedMinutes: z.int().min(1).max(180),
  /** Une chaîne par ligne : `#` pour une case noire, une lettre A–Z sinon. */
  grid: z.array(z.string().min(3).max(25)).min(3).max(25),
  clues: z.array(adminClueSchema).min(1).max(400),
})
export type AdminPuzzleBody = z.infer<typeof adminPuzzleBodySchema>

export const adminPuzzleStatusBodySchema = z.strictObject({ status: puzzleStatusSchema })

export const adminPuzzleSummarySchema = z.strictObject({
  id: uuidSchema,
  slug: z.string(),
  title: z.string(),
  theme: z.string(),
  difficulty: difficultySchema,
  status: puzzleStatusSchema,
  width: z.int(),
  height: z.int(),
  estimatedMinutes: z.int(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  playsStarted: z.int(),
  playsCompleted: z.int(),
})
export type AdminPuzzleSummary = z.infer<typeof adminPuzzleSummarySchema>

export const adminPuzzleListQuerySchema = z.strictObject({
  status: puzzleStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: uuidSchema.optional(),
})

export const adminPuzzleListSchema = z.strictObject({
  items: z.array(adminPuzzleSummarySchema),
  nextCursor: uuidSchema.nullable(),
})
export type AdminPuzzleList = z.infer<typeof adminPuzzleListSchema>

/** Grille complète, solution incluse : réservée à l'administration. */
export const adminPuzzleSchema = adminPuzzleSummarySchema.extend({
  grid: z.array(z.string()),
  clues: z.array(adminClueSchema),
  /** Vrai dès qu'une partie ou un match l'utilise : la grille (lettres) n'est plus modifiable. */
  locked: z.boolean(),
})
export type AdminPuzzle = z.infer<typeof adminPuzzleSchema>

// --- Journal d'audit ---------------------------------------------------------

export const auditEntrySchema = z.strictObject({
  id: uuidSchema,
  actor: z.string().nullable(),
  action: z.string(),
  target: z.string().nullable(),
  createdAt: isoDateTime,
})

export const auditListQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: uuidSchema.optional(),
})

export const auditListSchema = z.strictObject({
  items: z.array(auditEntrySchema),
  nextCursor: uuidSchema.nullable(),
})
export type AuditList = z.infer<typeof auditListSchema>
