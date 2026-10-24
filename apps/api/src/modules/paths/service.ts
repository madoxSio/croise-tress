import {
  ERROR_CODES,
  type PathDetail,
  type PathStepState,
  type PathSummary,
} from '@crossverse/contracts'
import type { Db } from '../../db.ts'
import { AppError, notFound } from '../../http/errors.ts'
import { isConfirmedAccount } from '../session/accounts.ts'

const stepSelect = {
  position: true,
  title: true,
  puzzle: { select: { id: true, title: true, difficulty: true, estimatedMinutes: true } },
} as const

const pathSelect = {
  slug: true,
  title: true,
  description: true,
  theme: { select: { slug: true } },
  steps: {
    // Une étape dont la grille a été dépubliée disparaît du parcours au lieu de le bloquer.
    where: { puzzle: { status: 'published' } },
    orderBy: { position: 'asc' },
    select: stepSelect,
  },
} as const

interface Step {
  readonly puzzleId: string
}

/** Étape de parcours que le joueur vient de réussir, pour les récompenses. */
export interface ClearedStep {
  readonly pathId: string
  /** Vrai si toutes les étapes du parcours sont désormais réussies. */
  readonly pathCompleted: boolean
}

/**
 * États des étapes, dans l'ordre : une étape est ouverte quand toutes les précédentes sont
 * réussies. Un invité n'a accès qu'à la première (les parcours sont réservés aux comptes).
 */
export function stepStates(
  steps: readonly Step[],
  completed: ReadonlySet<string>,
  isAccount: boolean,
): PathStepState[] {
  let previousDone = true
  return steps.map((step, index) => {
    const done = completed.has(step.puzzleId)
    const open = previousDone && (isAccount || index === 0)
    previousDone &&= done
    if (done) return 'completed'
    return open ? 'available' : 'locked'
  })
}

/**
 * Parcours thématiques. Le serveur fait autorité sur le déblocage : une grille d'étape
 * verrouillée ne peut pas être démarrée, quel que soit le chemin emprunté par le client.
 * Une étape est « réussie » quand sa grille est terminée sans que la solution ait été révélée.
 */
export class PathService {
  constructor(private readonly db: Db) {}

  async list(userId: string | null): Promise<PathSummary[]> {
    const paths = await this.db.path.findMany({
      where: { status: 'published' },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
      take: 100,
      select: pathSelect,
    })
    const completed = await this.completedAmong(
      userId,
      paths.flatMap((path) => path.steps.map((step) => step.puzzle.id)),
    )
    return paths.map(({ steps, theme, ...path }) => ({
      ...path,
      theme: theme.slug,
      stepCount: steps.length,
      completedCount: steps.filter((step) => completed.has(step.puzzle.id)).length,
    }))
  }

  async detail(slug: string, userId: string | null): Promise<PathDetail> {
    const path = await this.db.path.findFirst({
      where: { slug, status: 'published' },
      select: pathSelect,
    })
    if (!path) throw notFound('Parcours introuvable.')
    const { steps, theme, ...summary } = path
    const completed = await this.completedAmong(
      userId,
      steps.map((step) => step.puzzle.id),
    )
    const states = stepStates(
      steps.map((step) => ({ puzzleId: step.puzzle.id })),
      completed,
      userId !== null && (await isConfirmedAccount(this.db, userId)),
    )
    return {
      ...summary,
      theme: theme.slug,
      stepCount: steps.length,
      completedCount: states.filter((state) => state === 'completed').length,
      steps: steps.map((step, index) => ({ ...step, state: states[index] ?? 'locked' })),
    }
  }

  /**
   * Refuse de démarrer une grille qui n'est, dans aucun parcours, une étape ouverte au joueur.
   * Une grille hors parcours reste libre.
   */
  async assertCanStart(userId: string, puzzleId: string): Promise<void> {
    const paths = await this.pathsContaining(puzzleId)
    if (paths.length === 0) return
    const completed = await this.completedAmong(
      userId,
      paths.flatMap((path) => path.steps.map((step) => step.puzzleId)),
    )
    const isAccount = await isConfirmedAccount(this.db, userId)
    const open = paths.some((path) => {
      const index = path.steps.findIndex((step) => step.puzzleId === puzzleId)
      return stepStates(path.steps, completed, isAccount)[index] !== 'locked'
    })
    if (!open) {
      throw new AppError(
        403,
        ERROR_CODES.stepLocked,
        isAccount
          ? 'Réussissez d’abord l’étape précédente du parcours.'
          : 'Créez un compte pour poursuivre ce parcours.',
      )
    }
  }

  /** Étapes réussies grâce à cette grille (appelé après une partie terminée sans solution révélée). */
  async clearedSteps(userId: string, puzzleId: string): Promise<ClearedStep[]> {
    const paths = await this.pathsContaining(puzzleId)
    if (paths.length === 0) return []
    const completed = await this.completedAmong(
      userId,
      paths.flatMap((path) => path.steps.map((step) => step.puzzleId)),
    )
    return paths.flatMap((path) => {
      const step = path.steps.find((s) => s.puzzleId === puzzleId)
      if (!step || !completed.has(puzzleId)) return []
      return [
        {
          pathId: path.id,
          pathCompleted: path.steps.every((s) => completed.has(s.puzzleId)),
        },
      ]
    })
  }

  private pathsContaining(puzzleId: string) {
    return this.db.path.findMany({
      where: { status: 'published', steps: { some: { puzzleId } } },
      select: {
        id: true,
        steps: {
          where: { puzzle: { status: 'published' } },
          orderBy: { position: 'asc' },
          select: { puzzleId: true },
        },
      },
    })
  }

  /** Grilles terminées par le joueur sans révéler la solution, parmi `puzzleIds`. */
  private async completedAmong(
    userId: string | null,
    puzzleIds: readonly string[],
  ): Promise<Set<string>> {
    if (userId === null || puzzleIds.length === 0) return new Set()
    const rows = await this.db.playSession.findMany({
      where: {
        userId,
        status: 'completed',
        solutionRevealed: false,
        puzzleId: { in: [...new Set(puzzleIds)] },
      },
      distinct: ['puzzleId'],
      select: { puzzleId: true },
    })
    return new Set(rows.map((row) => row.puzzleId))
  }
}
