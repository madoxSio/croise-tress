import {
  preferencesSchema,
  type Achievement,
  type Preferences,
  type PuzzleSummary,
  type Stats,
} from '@crossverse/contracts'
import type { Db } from '../../db.ts'
import type { PlaySession } from '../../generated/prisma/client.ts'
import { notFound } from '../../http/errors.ts'

interface AchievementDefinition {
  readonly code: string
  readonly title: string
  readonly description: string
}

/** Succès non punitifs : ils récompensent, rien n'est perdu. Ordre d'affichage. */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { code: 'first_grid', title: 'Première grille', description: 'Terminer une grille.' },
  { code: 'five_grids', title: 'Habitué', description: 'Terminer cinq grilles.' },
  {
    code: 'no_help',
    title: 'Sans filet',
    description: 'Terminer une grille sans vérification ni indice.',
  },
  {
    code: 'speedster',
    title: 'Plume rapide',
    description: 'Terminer une grille dans le temps estimé.',
  },
  {
    code: 'daily',
    title: 'Rendez-vous quotidien',
    description: 'Terminer le défi du jour le jour même.',
  },
]

const summarySelect = {
  id: true,
  slug: true,
  title: true,
  theme: true,
  difficulty: true,
  width: true,
  height: true,
  estimatedMinutes: true,
} as const

export class ProgressService {
  constructor(private readonly db: Db) {}

  /**
   * Attribue les succès après une partie terminée. Idempotent : la clé primaire
   * (user_id, code) et `skipDuplicates` empêchent toute double attribution.
   */
  async onCompleted(session: PlaySession): Promise<void> {
    if (session.status !== 'completed' || !session.completedAt || session.durationMs === null)
      return
    // Une grille dont la solution a été révélée ne rapporte aucun succès.
    if (session.solutionRevealed) return
    const codes: string[] = []
    const completed = await this.db.playSession.count({
      where: { userId: session.userId, status: 'completed' },
    })
    if (completed >= 1) codes.push('first_grid')
    if (completed >= 5) codes.push('five_grids')

    const helped =
      session.cellChecks + session.wordChecks + session.lettersRevealed + session.wordsRevealed > 0
    if (!helped) codes.push('no_help')

    const puzzle = await this.db.puzzle.findUnique({
      where: { id: session.puzzleId },
      select: { estimatedMinutes: true },
    })
    if (puzzle && session.durationMs <= puzzle.estimatedMinutes * 60_000) {
      codes.push('speedster')
    }

    const day = new Date(
      Date.UTC(
        session.completedAt.getUTCFullYear(),
        session.completedAt.getUTCMonth(),
        session.completedAt.getUTCDate(),
      ),
    )
    const daily = await this.db.dailyChallenge.findUnique({
      where: { date: day },
      select: { puzzleId: true },
    })
    if (daily?.puzzleId === session.puzzleId) codes.push('daily')

    await this.db.userAchievement.createMany({
      data: codes.map((code) => ({ userId: session.userId, code })),
      skipDuplicates: true,
    })
  }

  async achievements(userId: string): Promise<Achievement[]> {
    const unlocked = await this.db.userAchievement.findMany({
      where: { userId },
      select: { code: true, unlockedAt: true },
    })
    const byCode = new Map(unlocked.map((row) => [row.code, row.unlockedAt]))
    return ACHIEVEMENTS.map((def) => ({
      ...def,
      unlockedAt: byCode.get(def.code)?.toISOString() ?? null,
    }))
  }

  /** Statistiques dérivées des parties terminées (rien n'est stocké en double). */
  async stats(userId: string): Promise<Stats> {
    const where = { userId, status: 'completed' as const }
    const [aggregate, withoutHelp, perDifficulty, daily] = await Promise.all([
      this.db.playSession.aggregate({
        where,
        _count: true,
        _max: { score: true },
        _avg: { durationMs: true },
      }),
      this.db.playSession.count({
        where: {
          ...where,
          cellChecks: 0,
          wordChecks: 0,
          lettersRevealed: 0,
          wordsRevealed: 0,
          solutionRevealed: false,
        },
      }),
      this.db.playSession.findMany({ where, select: { puzzle: { select: { difficulty: true } } } }),
      this.db.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count
        FROM play_sessions ps
        JOIN daily_challenges dc
          ON dc.puzzle_id = ps.puzzle_id AND dc.date = (ps.completed_at AT TIME ZONE 'UTC')::date
        WHERE ps.user_id = ${userId}::uuid AND ps.status = 'completed' AND ps.solution_revealed = false`,
    ])
    const byDifficulty: Record<string, number> = {}
    for (const row of perDifficulty)
      byDifficulty[row.puzzle.difficulty] = (byDifficulty[row.puzzle.difficulty] ?? 0) + 1
    return {
      completed: aggregate._count,
      withoutHelp,
      dailyCompleted: Number(daily[0]?.count ?? 0n),
      bestScore: aggregate._max.score,
      averageDurationMs:
        aggregate._avg.durationMs === null ? null : Math.round(aggregate._avg.durationMs),
      byDifficulty,
    }
  }

  async favorites(userId: string): Promise<PuzzleSummary[]> {
    const rows = await this.db.favorite.findMany({
      where: { userId, puzzle: { status: 'published' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { puzzle: { select: summarySelect } },
    })
    return rows.map((row) => row.puzzle)
  }

  async addFavorite(userId: string, puzzleId: string): Promise<void> {
    const puzzle = await this.db.puzzle.findFirst({
      where: { id: puzzleId, status: 'published' },
      select: { id: true },
    })
    if (!puzzle) throw notFound('Puzzle introuvable.')
    await this.db.favorite.createMany({ data: [{ userId, puzzleId }], skipDuplicates: true })
  }

  async removeFavorite(userId: string, puzzleId: string): Promise<void> {
    await this.db.favorite.deleteMany({ where: { userId, puzzleId } })
  }

  async preferences(userId: string): Promise<Preferences> {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferences: true },
    })
    // Valeurs invalides ou absentes remplacées par les valeurs par défaut.
    const parsed = preferencesSchema.safeParse(user.preferences)
    return parsed.success ? parsed.data : preferencesSchema.parse({})
  }

  async savePreferences(userId: string, preferences: Preferences): Promise<Preferences> {
    await this.db.user.update({ where: { id: userId }, data: { preferences } })
    return preferences
  }
}
