import type { Db } from '../../db.ts'
import type { PlaySession } from '../../generated/prisma/client.ts'
import type { PathService } from '../paths/service.ts'
import { POINTS } from './rules.ts'
import type { PointsService } from './service.ts'

/**
 * Récompenses en Coumba points d'une partie solo terminée. Chaque gain a une clé d'idempotence
 * (grille, étape, parcours, jour) : rejouer une grille ou rappeler ce service ne rapporte rien
 * de plus. Une grille dont la solution a été révélée ne rapporte rien.
 */
export class RewardService {
  constructor(
    private readonly db: Db,
    private readonly points: PointsService,
    private readonly paths: PathService,
  ) {}

  async onPuzzleCompleted(session: PlaySession): Promise<void> {
    if (session.status !== 'completed' || !session.completedAt || session.solutionRevealed) return
    const { userId, puzzleId } = session
    if (!(await this.points.isEligible(userId))) return
    await this.points.grantWelcome(userId)

    const puzzle = await this.db.puzzle.findUnique({
      where: { id: puzzleId },
      select: { difficulty: true },
    })
    if (!puzzle) return
    const hintless = session.lettersRevealed + session.wordsRevealed === 0
    await this.db.$transaction(async (tx) => {
      const first = await this.points.apply(tx, {
        userId,
        amount: POINTS.completion[puzzle.difficulty],
        reason: 'puzzle_completed',
        key: `puzzle:${puzzleId}`,
      })
      // Le bonus n'accompagne que la première réussite : rejouer une grille déjà connue
      // sans indice ne doit rien rapporter.
      if (first && hintless) {
        await this.points.apply(tx, {
          userId,
          amount: POINTS.noHintBonus,
          reason: 'no_hint_bonus',
          key: `puzzle-bonus:${puzzleId}`,
        })
      }
    })

    const day = session.completedAt.toISOString().slice(0, 10)
    const daily = await this.db.dailyChallenge.findUnique({
      where: { date: new Date(`${day}T00:00:00Z`) },
      select: { puzzleId: true },
    })
    if (daily?.puzzleId === puzzleId) {
      await this.points.credit({
        userId,
        amount: POINTS.daily,
        reason: 'daily_challenge',
        key: `daily:${day}`,
      })
    }

    for (const step of await this.paths.clearedSteps(userId, puzzleId)) {
      await this.points.credit({
        userId,
        amount: POINTS.pathStep,
        reason: 'path_step',
        // Clé par grille et non par rang : réordonner les étapes ne redonne pas de points.
        key: `path-step:${step.pathId}:${puzzleId}`,
      })
      if (step.pathCompleted) {
        await this.points.credit({
          userId,
          amount: POINTS.pathCompleted,
          reason: 'path_completed',
          key: `path:${step.pathId}`,
        })
      }
    }
  }
}
