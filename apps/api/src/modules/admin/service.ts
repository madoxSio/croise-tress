import { parsePuzzle } from '@crossverse/crossword-core'
import type {
  AdminOverview,
  AdminPuzzle,
  AdminPuzzleBody,
  AdminPuzzleList,
  AdminPuzzleSummary,
  AdminUserDetail,
  AdminUserList,
  AdminUserSummary,
  AuditList,
  JourneyEvent,
  PuzzleStatus,
} from '@crossverse/contracts'
import { ERROR_CODES } from '@crossverse/contracts'
import type { Db } from '../../db.ts'
import { Prisma } from '../../generated/prisma/client.ts'
import { AppError, conflict, notFound } from '../../http/errors.ts'

const DAY_MS = 86_400_000
const JOURNEY_LIMIT = 100

/** Actions consignées dans `audit_log` (liste fermée : pas de texte libre). */
export type AuditAction =
  | 'user.view'
  | 'puzzle.create'
  | 'puzzle.update'
  | 'puzzle.publish'
  | 'puzzle.unpublish'
  | 'theme.create'
  | 'theme.update'
  | 'cli.account.create'
  | 'cli.role.grant'
  | 'cli.role.revoke'
  | 'user.create'
  | 'user.suspend'
  | 'user.reactivate'
  | 'user.sessions.revoke'

export const userSummarySelect = {
  id: true,
  username: true,
  email: true,
  role: true,
  passwordHash: true,
  emailVerifiedAt: true,
  suspendedAt: true,
  suspendedReason: true,
  createdAt: true,
  rating: { select: { rating: true } },
  _count: {
    select: { playSessions: { where: { status: 'completed' } }, matches: true },
  },
} as const satisfies Prisma.UserSelect

type UserSummaryRow = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>

const puzzleSummarySelect = {
  id: true,
  slug: true,
  title: true,
  theme: { select: { slug: true, name: true } },
  difficulty: true,
  status: true,
  width: true,
  height: true,
  estimatedMinutes: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { playSessions: true, matches: true } },
} as const satisfies Prisma.PuzzleSelect

type PuzzleSummaryRow = Prisma.PuzzleGetPayload<{ select: typeof puzzleSummarySelect }>

function page<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null }
}

function cursorArgs(cursor: string | undefined): { cursor?: { id: string }; skip?: number } {
  return cursor ? { cursor: { id: cursor }, skip: 1 } : {}
}

/** Contenu d'une grille stockée (déjà validé à l'écriture). */
interface StoredContent {
  readonly grid: string[]
  readonly clues: AdminPuzzleBody['clues']
}

/**
 * Espace d'administration : indicateurs, parcours des joueurs, gestion du catalogue et
 * journal d'audit. Les appels arrivent déjà filtrés par la garde de rôle (`requireAdmin`).
 * Données personnelles : seules celles nécessaires au support et au pilotage sont exposées
 * (pas d'adresse IP, pas de contenu de session) et toute consultation d'un parcours est journalisée.
 */
export class AdminService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date,
  ) {}

  /** Vrai si l'utilisateur est administrateur. Relu en base à chaque requête : un rôle retiré prend effet immédiatement. */
  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { role: true, passwordHash: true, emailVerifiedAt: true, suspendedAt: true },
    })
    return (
      user?.role === 'admin' &&
      user.passwordHash !== null &&
      user.emailVerifiedAt !== null &&
      user.suspendedAt === null
    )
  }

  async audit(
    actorUserId: string | null,
    action: AuditAction,
    target: string | null,
  ): Promise<void> {
    await this.db.auditLog.create({ data: { actorUserId, action, target } })
  }

  // --- Indicateurs -------------------------------------------------------------

  async overview(): Promise<AdminOverview> {
    const now = this.now()
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS)
    const registered = { passwordHash: { not: null } } as const
    const [
      registeredCount,
      verified,
      guests,
      admins,
      suspended,
      newLast7Days,
      activeLast7Days,
      started,
      completed,
      completedLast7Days,
      matchesByStatus,
      puzzlesByStatus,
    ] = await Promise.all([
      this.db.user.count({ where: registered }),
      this.db.user.count({ where: { ...registered, emailVerifiedAt: { not: null } } }),
      this.db.user.count({ where: { passwordHash: null } }),
      this.db.user.count({ where: { role: 'admin' } }),
      this.db.user.count({ where: { suspendedAt: { not: null } } }),
      this.db.user.count({ where: { ...registered, emailVerifiedAt: { gte: weekAgo } } }),
      this.db.user.count({ where: { sessions: { some: { lastSeenAt: { gte: weekAgo } } } } }),
      this.db.playSession.count(),
      this.db.playSession.count({ where: { status: 'completed' } }),
      this.db.playSession.count({ where: { status: 'completed', completedAt: { gte: weekAgo } } }),
      this.db.match.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.puzzle.groupBy({ by: ['status'], _count: { _all: true } }),
    ])
    const countOf = <S extends string>(rows: { status: S; _count: { _all: number } }[], s: S) =>
      rows.find((row) => row.status === s)?._count._all ?? 0

    return {
      users: {
        registered: registeredCount,
        verified,
        guests,
        admins,
        suspended,
        newLast7Days,
        activeLast7Days,
      },
      plays: { started, completed, completedLast7Days },
      matches: {
        finished: countOf(matchesByStatus, 'finished'),
        active: countOf(matchesByStatus, 'active'),
        waiting: countOf(matchesByStatus, 'waiting'),
      },
      puzzles: {
        published: countOf(puzzlesByStatus, 'published'),
        draft: countOf(puzzlesByStatus, 'draft'),
      },
      daily: await this.dailySeries(now),
    }
  }

  /**
   * Série des 30 derniers jours (UTC). L'inscription est datée par la confirmation de l'e-mail
   * (le compte invité existait avant) ; un changement d'adresse décale cette date : approximation assumée.
   */
  private async dailySeries(now: Date): Promise<AdminOverview['daily']> {
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const from = new Date(today - 29 * DAY_MS)
    // Requêtes paramétrées (gabarit Prisma) : aucune valeur n'est concaténée dans le SQL.
    const [registrations, completions] = await Promise.all([
      this.db.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT date_trunc('day', email_verified_at AT TIME ZONE 'UTC') AS day, count(*) AS count
        FROM users
        WHERE password_hash IS NOT NULL AND email_verified_at >= ${from}
        GROUP BY 1`,
      this.db.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT date_trunc('day', completed_at AT TIME ZONE 'UTC') AS day, count(*) AS count
        FROM play_sessions
        WHERE status = 'completed' AND completed_at >= ${from}
        GROUP BY 1`,
    ])
    const byDay = (rows: { day: Date; count: bigint }[]) =>
      new Map(rows.map((row) => [row.day.toISOString().slice(0, 10), Number(row.count)]))
    const reg = byDay(registrations)
    const comp = byDay(completions)
    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date(from.getTime() + index * DAY_MS).toISOString().slice(0, 10)
      return { date, registrations: reg.get(date) ?? 0, completions: comp.get(date) ?? 0 }
    })
  }

  // --- Joueurs -----------------------------------------------------------------

  async listUsers(query: {
    search?: string | undefined
    guests: 'true' | 'false'
    suspended: 'true' | 'false'
    limit: number
    cursor?: string | undefined
  }): Promise<AdminUserList> {
    const search = query.search?.trim()
    const where: Prisma.UserWhereInput = {
      ...(query.guests === 'true' ? {} : { passwordHash: { not: null } }),
      ...(query.suspended === 'true' ? { suspendedAt: { not: null } } : {}),
      ...(search
        ? {
            OR: [
              { username: { startsWith: search, mode: 'insensitive' } },
              { email: { startsWith: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }
    // uuid v7 : l'ordre décroissant des identifiants suit l'ordre de création.
    const rows = await this.db.user.findMany({
      where,
      select: userSummarySelect,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
    })
    const { items, nextCursor } = page(rows, query.limit)
    const lastSeen = await this.lastSeen(items.map((row) => row.id))
    return { items: items.map((row) => toUserSummary(row, lastSeen.get(row.id))), nextCursor }
  }

  async userDetail(id: string): Promise<AdminUserDetail> {
    const row = await this.db.user.findUnique({ where: { id }, select: userSummarySelect })
    if (!row) throw notFound('Utilisateur introuvable.')

    const [lastSeen, plays, aggregate, favorites, achievements, activeSessions, rating, matches] =
      await Promise.all([
        this.lastSeen([id]),
        this.db.playSession.findMany({
          where: { userId: id },
          orderBy: { startedAt: 'desc' },
          take: JOURNEY_LIMIT,
          select: {
            puzzleId: true,
            status: true,
            startedAt: true,
            completedAt: true,
            score: true,
            durationMs: true,
            cellChecks: true,
            wordChecks: true,
            lettersRevealed: true,
            wordsRevealed: true,
            puzzle: { select: { title: true } },
          },
        }),
        this.db.playSession.aggregate({
          where: { userId: id },
          _count: { _all: true },
          _max: { score: true },
          _sum: {
            durationMs: true,
            cellChecks: true,
            wordChecks: true,
            lettersRevealed: true,
            wordsRevealed: true,
          },
        }),
        this.db.favorite.count({ where: { userId: id } }),
        this.db.userAchievement.findMany({
          where: { userId: id },
          orderBy: { unlockedAt: 'desc' },
          take: JOURNEY_LIMIT,
          select: { code: true, unlockedAt: true },
        }),
        this.db.session.count({
          where: { userId: id, revokedAt: null, expiresAt: { gt: this.now() } },
        }),
        this.db.rating.findUnique({
          where: { userId: id },
          select: { rating: true, gamesPlayed: true, wins: true, losses: true, draws: true },
        }),
        this.db.matchParticipant.findMany({
          where: { userId: id, match: { status: { in: ['finished', 'aborted'] } } },
          orderBy: { match: { endedAt: 'desc' } },
          take: JOURNEY_LIMIT,
          select: {
            result: true,
            match: {
              select: {
                id: true,
                mode: true,
                endedAt: true,
                createdAt: true,
                participants: {
                  where: { userId: { not: id } },
                  select: { user: { select: { username: true } } },
                },
              },
            },
          },
        }),
      ])

    const sum = aggregate._sum
    const journey: JourneyEvent[] = [
      ...plays.flatMap((play): JourneyEvent[] => {
        const base = { puzzleId: play.puzzleId, puzzleTitle: play.puzzle.title }
        const events: JourneyEvent[] = [
          { type: 'play_started', at: play.startedAt.toISOString(), ...base },
        ]
        if (play.status === 'completed' && play.completedAt) {
          events.push({
            type: 'play_completed',
            at: play.completedAt.toISOString(),
            ...base,
            score: play.score,
            durationMs: play.durationMs,
            hintsUsed:
              play.cellChecks + play.wordChecks + play.lettersRevealed + play.wordsRevealed,
          })
        }
        return events
      }),
      ...matches.map((p): JourneyEvent => ({
        type: 'match_finished',
        at: (p.match.endedAt ?? p.match.createdAt).toISOString(),
        matchId: p.match.id,
        mode: p.match.mode,
        result: p.result,
        opponent: p.match.participants[0]?.user.username ?? null,
      })),
      ...achievements.map((a): JourneyEvent => ({
        type: 'achievement',
        at: a.unlockedAt.toISOString(),
        code: a.code,
      })),
      ...(row.emailVerifiedAt
        ? [{ type: 'email_verified', at: row.emailVerifiedAt.toISOString() } as const]
        : []),
      { type: 'account_created', at: row.createdAt.toISOString() },
    ]
    journey.sort((a, b) => b.at.localeCompare(a.at))

    return {
      user: toUserSummary(row, lastSeen.get(id)),
      suspension: row.suspendedAt
        ? { at: row.suspendedAt.toISOString(), reason: row.suspendedReason }
        : null,
      stats: {
        playsStarted: aggregate._count._all,
        playsCompleted: row._count.playSessions,
        bestScore: aggregate._max.score,
        totalPlayMs: sum.durationMs ?? 0,
        hintsUsed:
          (sum.cellChecks ?? 0) +
          (sum.wordChecks ?? 0) +
          (sum.lettersRevealed ?? 0) +
          (sum.wordsRevealed ?? 0),
        favorites,
        achievements: achievements.length,
        activeSessions,
        rating,
      },
      journey: journey.slice(0, JOURNEY_LIMIT),
    }
  }

  /** Dernière activité connue (dernière session utilisée), en une seule requête groupée. */
  private async lastSeen(userIds: string[]): Promise<Map<string, Date>> {
    if (userIds.length === 0) return new Map()
    const rows = await this.db.session.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _max: { lastSeenAt: true },
    })
    return new Map(
      rows.flatMap((row) => (row._max.lastSeenAt ? [[row.userId, row._max.lastSeenAt]] : [])),
    )
  }

  // --- Grilles -----------------------------------------------------------------

  async listPuzzles(query: {
    status?: PuzzleStatus | undefined
    limit: number
    cursor?: string | undefined
  }): Promise<AdminPuzzleList> {
    const rows = await this.db.puzzle.findMany({
      where: query.status ? { status: query.status } : {},
      select: puzzleSummarySelect,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
    })
    const { items, nextCursor } = page(rows, query.limit)
    const completed = await this.completedCounts(items.map((row) => row.id))
    return { items: items.map((row) => toPuzzleSummary(row, completed.get(row.id))), nextCursor }
  }

  async getPuzzle(id: string): Promise<AdminPuzzle> {
    const row = await this.db.puzzle.findUnique({
      where: { id },
      select: { ...puzzleSummarySelect, grid: true, clues: true },
    })
    if (!row) throw notFound('Grille introuvable.')
    const { grid, clues, ...summary } = row
    const content = { grid, clues } as unknown as StoredContent
    const completed = await this.completedCounts([id])
    return {
      ...toPuzzleSummary(summary, completed.get(id)),
      grid: content.grid,
      clues: content.clues,
      locked: isLocked(summary),
    }
  }

  /** Crée une grille en brouillon ; elle n'apparaît au catalogue qu'une fois publiée. */
  async createPuzzle(body: AdminPuzzleBody): Promise<AdminPuzzle> {
    const data = { ...validatedData(body), themeId: await this.themeIdOf(body.themeSlug) }
    try {
      const row = await this.db.puzzle.create({
        data: { ...data, slug: body.slug, status: 'draft' },
        select: { id: true },
      })
      return await this.getPuzzle(row.id)
    } catch (error) {
      throw uniqueSlug(error)
    }
  }

  /**
   * Modifie une grille. Dès qu'une partie ou un match l'utilise, ses lettres sont figées
   * (les grilles en cours et les scores en dépendent) : seuls les textes changent.
   */
  async updatePuzzle(id: string, body: AdminPuzzleBody): Promise<AdminPuzzle> {
    const data = { ...validatedData(body), themeId: await this.themeIdOf(body.themeSlug) }
    const current = await this.db.puzzle.findUnique({
      where: { id },
      select: { grid: true, _count: { select: { playSessions: true, matches: true } } },
    })
    if (!current) throw notFound('Grille introuvable.')
    const sameGrid = JSON.stringify(current.grid) === JSON.stringify(data.grid)
    if (isLocked(current) && !sameGrid) {
      throw conflict(
        'Grille déjà jouée : ses lettres ne peuvent plus changer (créez-en une copie).',
      )
    }
    try {
      await this.db.puzzle.update({ where: { id }, data: { ...data, slug: body.slug } })
    } catch (error) {
      throw uniqueSlug(error)
    }
    return this.getPuzzle(id)
  }

  async setPuzzleStatus(id: string, status: PuzzleStatus): Promise<AdminPuzzle> {
    const updated = await this.db.puzzle.updateMany({ where: { id }, data: { status } })
    if (updated.count === 0) throw notFound('Grille introuvable.')
    return this.getPuzzle(id)
  }

  private async themeIdOf(slug: string): Promise<string> {
    const theme = await this.db.theme.findUnique({ where: { slug }, select: { id: true } })
    if (!theme) throw new AppError(400, ERROR_CODES.validation, 'Thème inconnu.')
    return theme.id
  }

  private async completedCounts(puzzleIds: string[]): Promise<Map<string, number>> {
    if (puzzleIds.length === 0) return new Map()
    const rows = await this.db.playSession.groupBy({
      by: ['puzzleId'],
      where: { puzzleId: { in: puzzleIds }, status: 'completed' },
      _count: { _all: true },
    })
    return new Map(rows.map((row) => [row.puzzleId, row._count._all]))
  }

  // --- Journal -----------------------------------------------------------------

  async auditLog(query: { limit: number; cursor?: string | undefined }): Promise<AuditList> {
    const rows = await this.db.auditLog.findMany({
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
      select: {
        id: true,
        action: true,
        target: true,
        createdAt: true,
        actor: { select: { username: true } },
      },
    })
    const { items, nextCursor } = page(rows, query.limit)
    return {
      items: items.map((row) => ({
        id: row.id,
        actor: row.actor?.username ?? null,
        action: row.action,
        target: row.target,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor,
    }
  }
}

export function toUserSummary(row: UserSummaryRow, lastSeenAt: Date | undefined): AdminUserSummary {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    isGuest: row.passwordHash === null,
    emailVerified: row.emailVerifiedAt !== null,
    suspended: row.suspendedAt !== null,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: lastSeenAt?.toISOString() ?? null,
    playsCompleted: row._count.playSessions,
    matchesPlayed: row._count.matches,
    rating: row.rating?.rating ?? null,
  }
}

function toPuzzleSummary(row: PuzzleSummaryRow, completed = 0): AdminPuzzleSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    theme: row.theme.name,
    themeSlug: row.theme.slug,
    difficulty: row.difficulty,
    status: row.status,
    width: row.width,
    height: row.height,
    estimatedMinutes: row.estimatedMinutes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    playsStarted: row._count.playSessions,
    playsCompleted: completed,
  }
}

function isLocked(row: { _count: { playSessions: number; matches: number } }): boolean {
  return row._count.playSessions > 0 || row._count.matches > 0
}

/** Valide la grille avec le moteur (mêmes règles que le seed) et prépare les colonnes. */
function validatedData(body: AdminPuzzleBody) {
  const grid = body.grid.map((line) => line.toUpperCase())
  const clues = body.clues.map((clue) => ({ ...clue }))
  const checked = parsePuzzle({ id: body.slug, title: body.title, grid, clues })
  if (!checked.ok) {
    // Messages du moteur : ils décrivent la grille envoyée, sans donnée interne.
    const details = checked.errors
      .slice(0, 5)
      .map((error) => error.message)
      .join(' ')
    throw new AppError(400, ERROR_CODES.validation, `Grille invalide : ${details}`)
  }
  return {
    title: body.title,
    difficulty: body.difficulty,
    estimatedMinutes: body.estimatedMinutes,
    width: checked.value.width,
    height: checked.value.height,
    grid,
    clues,
  }
}

function uniqueSlug(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return conflict('Ce slug est déjà utilisé par une autre grille.')
  }
  return error
}
