import {
  checkCell,
  checkGrid,
  checkSlot,
  computeScore,
  createEmptyGrid,
  findSlot,
  isSolved,
  openCells,
  revealSlot,
  sanitizeGrid,
  solutionAt,
  type CheckedCell,
  type PlayerGrid,
  type Puzzle,
} from '@crossverse/crossword-core'
import type { CheckBody, HintBody, PlaySessionDto } from '@crossverse/contracts'
import type { Db } from '../../db.ts'
import type { PlaySession, Prisma } from '../../generated/prisma/client.ts'
import { AppError, conflict, notFound } from '../../http/errors.ts'
import type { PuzzleRepository } from '../puzzles/repository.ts'

type Counter = 'cellChecks' | 'wordChecks' | 'lettersRevealed' | 'wordsRevealed'

interface Loaded {
  readonly session: PlaySession
  readonly puzzle: Puzzle
  readonly targetMs: number
}

export function toDto(session: PlaySession): PlaySessionDto {
  return {
    id: session.id,
    puzzleId: session.puzzleId,
    status: session.status,
    grid: session.grid as (string | null)[][],
    revision: session.revision,
    hints: {
      cellChecks: session.cellChecks,
      wordChecks: session.wordChecks,
      lettersRevealed: session.lettersRevealed,
      wordsRevealed: session.wordsRevealed,
      solutionRevealed: session.solutionRevealed,
    },
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    durationMs: session.durationMs,
    score: session.score,
  }
}

/**
 * Parties solo. Le serveur fait autorité : il conserve la grille, compte les aides,
 * détecte la fin de partie et calcule la durée et le score à partir de ses propres horodatages.
 * Toutes les requêtes filtrent par `userId` (aucun accès à la partie d'un autre joueur).
 */
export class PlayService {
  constructor(
    private readonly db: Db,
    private readonly puzzles: PuzzleRepository,
    private readonly now: () => Date,
    /** Appelé après chaque partie terminée (succès, statistiques). */
    private readonly onCompleted: (session: PlaySession) => Promise<void> = () => Promise.resolve(),
  ) {}

  async start(
    userId: string,
    puzzleId: string,
  ): Promise<{ session: PlaySession; created: boolean }> {
    const loaded = await this.puzzles.findPublished(puzzleId)
    if (!loaded) throw notFound('Puzzle introuvable.')
    const existing = await this.findInProgress(userId, puzzleId)
    if (existing) return { session: existing, created: false }
    try {
      const session = await this.db.playSession.create({
        data: {
          userId,
          puzzleId,
          grid: createEmptyGrid(loaded.puzzle),
          startedAt: this.now(),
        },
      })
      return { session, created: true }
    } catch (error) {
      // Deux démarrages simultanés : l'index unique partiel en laisse passer un seul.
      const raced = await this.findInProgress(userId, puzzleId)
      if (raced) return { session: raced, created: false }
      throw error
    }
  }

  async get(userId: string, sessionId: string): Promise<PlaySession> {
    const session = await this.db.playSession.findFirst({ where: { id: sessionId, userId } })
    if (!session) throw notFound('Partie introuvable.')
    return session
  }

  async saveGrid(
    userId: string,
    sessionId: string,
    grid: unknown,
    revision: number,
  ): Promise<PlaySession> {
    const loaded = await this.load(userId, sessionId)
    return this.write(loaded, revision, { grid: this.sanitize(loaded.puzzle, grid) })
  }

  async check(
    userId: string,
    sessionId: string,
    body: CheckBody,
  ): Promise<{ cells: CheckedCell[]; session: PlaySession }> {
    const loaded = await this.load(userId, sessionId)
    const { puzzle } = loaded
    const grid = this.sanitize(puzzle, body.grid)
    let cells: CheckedCell[]
    let counter: Counter
    switch (body.scope) {
      case 'cell':
        this.assertOpen(puzzle, body.cell)
        cells = [{ ...body.cell, result: checkCell(puzzle, grid, body.cell) }]
        counter = 'cellChecks'
        break
      case 'word':
        cells = checkSlot(puzzle, grid, this.slot(puzzle, body.word))
        counter = 'wordChecks'
        break
      case 'grid':
        // Une vérification de grille est comptée comme une vérification de mot (règle de score v1).
        cells = checkGrid(puzzle, grid)
        counter = 'wordChecks'
        break
    }
    const updated = await this.write(loaded, body.revision, { grid, increment: counter })
    return { cells, session: updated }
  }

  async hint(
    userId: string,
    sessionId: string,
    body: HintBody,
  ): Promise<{
    revealed: { row: number; col: number; letter: string }[]
    explanation: string | null
    session: PlaySession
  }> {
    const loaded = await this.load(userId, sessionId)
    const { session, puzzle } = loaded
    const current = this.sanitize(puzzle, session.grid)

    if (body.type === 'explain') {
      const clue = puzzle.clues.find(
        (c) => c.direction === body.word.direction && c.number === body.word.number,
      )
      if (!clue) throw notFound('Définition introuvable.')
      return { revealed: [], explanation: clue.explanation ?? null, session }
    }

    let revealed: { row: number; col: number; letter: string }[]
    let counter: Counter | undefined
    if (body.type === 'letter') {
      this.assertOpen(puzzle, body.cell)
      revealed = [{ ...body.cell, letter: solutionAt(puzzle, body.cell) }]
      counter = 'lettersRevealed'
    } else if (body.type === 'word') {
      revealed = revealSlot(puzzle, this.slot(puzzle, body.word))
      counter = 'wordsRevealed'
    } else {
      revealed = openCells(puzzle).map((cell) => ({ ...cell, letter: solutionAt(puzzle, cell) }))
    }

    const grid = current.map((line, row) =>
      line.map(
        (value, col) =>
          revealed.find((cell) => cell.row === row && cell.col === col)?.letter ?? value,
      ),
    )
    const updated = await this.write(loaded, session.revision, {
      grid,
      ...(counter ? { increment: counter } : {}),
      ...(body.type === 'solution' ? { solutionRevealed: true } : {}),
    })
    return { revealed, explanation: null, session: updated }
  }

  async history(userId: string, limit: number, cursor: string | undefined) {
    const rows = await this.db.playSession.findMany({
      where: { userId, status: 'completed' },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        puzzleId: true,
        completedAt: true,
        durationMs: true,
        score: true,
        puzzle: { select: { title: true } },
      },
    })
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    return {
      items: page.map((row) => ({
        sessionId: row.id,
        puzzleId: row.puzzleId,
        puzzleTitle: row.puzzle.title,
        completedAt: (row.completedAt ?? new Date(0)).toISOString(),
        durationMs: row.durationMs ?? 0,
        score: row.score ?? 0,
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    }
  }

  async resume(userId: string) {
    return this.db.playSession.findFirst({
      where: { userId, status: 'in_progress', puzzle: { status: 'published' } },
      orderBy: { updatedAt: 'desc' },
      include: {
        puzzle: {
          select: { id: true, title: true, difficulty: true, theme: { select: { name: true } } },
        },
      },
    })
  }

  private findInProgress(userId: string, puzzleId: string): Promise<PlaySession | null> {
    return this.db.playSession.findFirst({ where: { userId, puzzleId, status: 'in_progress' } })
  }

  private async load(userId: string, sessionId: string): Promise<Loaded> {
    const session = await this.get(userId, sessionId)
    if (session.status !== 'in_progress') throw conflict('Cette partie est terminée.')
    const loaded = await this.puzzles.findPublished(session.puzzleId)
    if (!loaded) throw notFound('Puzzle introuvable.')
    return { session, puzzle: loaded.puzzle, targetMs: loaded.summary.estimatedMinutes * 60_000 }
  }

  private sanitize(puzzle: Puzzle, grid: unknown): PlayerGrid {
    const sanitized = sanitizeGrid(puzzle, grid)
    if (!sanitized) throw new AppError(400, 'validation_error', 'Grille invalide pour ce puzzle.')
    return sanitized
  }

  private assertOpen(puzzle: Puzzle, cell: { row: number; col: number }): void {
    if (puzzle.cells[cell.row]?.[cell.col]?.block !== false) {
      throw new AppError(400, 'validation_error', 'Case non jouable.')
    }
  }

  private slot(puzzle: Puzzle, word: { direction: 'across' | 'down'; number: number }) {
    const slot = findSlot(puzzle, word.direction, word.number)
    if (!slot) throw notFound('Mot introuvable.')
    return slot
  }

  /**
   * Écriture optimiste : n'aboutit que si la révision attendue est toujours la révision stockée
   * et que la partie est en cours. Termine la partie si la grille est résolue.
   */
  private async write(
    { session, puzzle, targetMs }: Loaded,
    expectedRevision: number,
    change: { grid: PlayerGrid; increment?: Counter; solutionRevealed?: boolean },
  ): Promise<PlaySession> {
    const now = this.now()
    const counters = {
      cellChecks: session.cellChecks,
      wordChecks: session.wordChecks,
      lettersRevealed: session.lettersRevealed,
      wordsRevealed: session.wordsRevealed,
    }
    if (change.increment) counters[change.increment] += 1
    const solutionRevealed = session.solutionRevealed || change.solutionRevealed === true

    const completion: Prisma.PlaySessionUpdateManyMutationInput = {}
    if (isSolved(puzzle, change.grid)) {
      const durationMs = Math.max(0, now.getTime() - session.startedAt.getTime())
      completion.status = 'completed'
      completion.completedAt = now
      completion.durationMs = durationMs
      completion.score = computeScore({
        durationMs,
        targetMs,
        ...counters,
        solutionRevealed,
      })
    }

    const result = await this.db.playSession.updateMany({
      where: {
        id: session.id,
        userId: session.userId,
        revision: expectedRevision,
        status: 'in_progress',
      },
      data: {
        grid: change.grid,
        revision: { increment: 1 },
        ...counters,
        solutionRevealed,
        ...completion,
      },
    })
    if (result.count === 0) throw conflict('La partie a été modifiée ailleurs : rechargez-la.')
    const updated = await this.get(session.userId, session.id)
    if (updated.status === 'completed') await this.onCompleted(updated)
    return updated
  }
}
