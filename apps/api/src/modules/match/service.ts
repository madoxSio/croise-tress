import { randomInt } from 'node:crypto'
import {
  normalizeAnswer,
  revealSlot,
  toPublicPuzzle,
  findSlot,
  type Direction,
  type Puzzle,
} from '@crossverse/crossword-core'
import { ERROR_CODES, MATCH_DURATION_MS, type MatchState } from '@crossverse/contracts'
import type { Db } from '../../db.ts'
import { Prisma } from '../../generated/prisma/client.ts'
import { AppError, conflict, notFound } from '../../http/errors.ts'
import type { PuzzleRepository } from '../puzzles/repository.ts'
import { ELO_INITIAL, eloUpdate } from './elo.ts'

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** Clé arbitraire du verrou consultatif de matchmaking. */
const MATCHMAKING_LOCK_KEY = 4_242_001

type Tx = Prisma.TransactionClient

export type EndReason = 'completed' | 'deadline' | 'forfeit' | 'disconnect'

export interface FinishResult {
  readonly matchId: string
  readonly userIds: readonly string[]
}

const wordKey = (direction: Direction, number: number): string => `${number}-${direction}`

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/**
 * Règles du duel (décision D6) : même grille pour les deux joueurs, chaque mot est soumis
 * puis validé par le serveur, le premier à tout trouver gagne. À l'échéance : plus de mots
 * trouvés, puis le dernier mot trouvé le plus tôt ; sinon égalité. L'état officiel est en base,
 * les transitions sont protégées par des contraintes et des mises à jour conditionnelles.
 */
export class MatchService {
  constructor(
    private readonly db: Db,
    private readonly puzzles: PuzzleRepository,
    private readonly now: () => Date,
  ) {}

  /** Entre dans la file ; renvoie le match créé si un adversaire attendait. */
  async joinQueue(userId: string): Promise<string | null> {
    await this.assertAvailable(userId)
    await this.db.matchQueueEntry.createMany({
      data: [{ userId, mode: 'quick' }],
      skipDuplicates: true,
    })
    return this.tryPair()
  }

  async leaveQueue(userId: string): Promise<void> {
    await this.db.matchQueueEntry.deleteMany({ where: { userId } })
  }

  /**
   * Apparie les deux joueurs qui attendent depuis le plus longtemps. Un verrou consultatif
   * PostgreSQL sérialise les appariements (y compris entre plusieurs instances de l'API) :
   * aucune entrée n'est prise deux fois et aucun couple disponible n'est oublié.
   */
  async tryPair(): Promise<string | null> {
    const puzzleId = await this.randomPuzzleId()
    if (!puzzleId) return null
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MATCHMAKING_LOCK_KEY})`
        const rows = await tx.$queryRaw<{ user_id: string }[]>`
          SELECT user_id FROM match_queue WHERE mode = 'quick'
          ORDER BY enqueued_at, user_id
          LIMIT 2 FOR UPDATE`
        if (rows.length < 2) return null
        const userIds = rows.map((row) => row.user_id)
        await tx.matchQueueEntry.deleteMany({ where: { userId: { in: userIds } } })
        const now = this.now()
        const match = await tx.match.create({
          data: {
            mode: 'quick',
            status: 'active',
            puzzleId,
            startedAt: now,
            deadlineAt: new Date(now.getTime() + MATCH_DURATION_MS),
            participants: { create: userIds.map((id, slot) => ({ userId: id, slot })) },
          },
          select: { id: true },
        })
        return match.id
      })
    } catch (error) {
      // Un des joueurs est entré dans un autre match entre-temps (index unique partiel).
      if (isUniqueViolation(error)) return null
      throw error
    }
  }

  async createInvite(userId: string): Promise<string> {
    await this.assertAvailable(userId)
    await this.leaveQueue(userId)
    const puzzleId = await this.randomPuzzleId()
    if (!puzzleId) throw notFound('Aucun puzzle disponible.')
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Array.from(
        { length: 6 },
        () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)],
      ).join('')
      try {
        const match = await this.db.match.create({
          data: {
            mode: 'private',
            puzzleId,
            inviteCode: code,
            participants: { create: [{ userId, slot: 0 }] },
          },
          select: { id: true },
        })
        return match.id
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
        // Collision de code (ou joueur déjà engagé) : nouvelle tentative, puis refus.
        await this.assertAvailable(userId)
      }
    }
    throw conflict('Impossible de créer l’invitation, réessayez.')
  }

  async acceptInvite(userId: string, code: string): Promise<string> {
    await this.assertAvailable(userId)
    await this.leaveQueue(userId)
    try {
      return await this.db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM matches WHERE invite_code = ${code} AND status = 'waiting' FOR UPDATE`
        const matchId = rows[0]?.id
        if (!matchId) throw notFound('Invitation introuvable ou expirée.')
        const host = await tx.matchParticipant.findFirst({
          where: { matchId, slot: 0 },
          select: { userId: true },
        })
        if (host?.userId === userId)
          throw conflict('Vous ne pouvez pas accepter votre propre invitation.')
        const now = this.now()
        await tx.matchParticipant.create({ data: { matchId, userId, slot: 1 } })
        await tx.match.update({
          where: { id: matchId },
          data: {
            status: 'active',
            inviteCode: null,
            startedAt: now,
            deadlineAt: new Date(now.getTime() + MATCH_DURATION_MS),
          },
        })
        return matchId
      })
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('Vous participez déjà à un match.')
      throw error
    }
  }

  /** Soumet un mot. Idempotent par `clientEventId` ; seul le serveur décide si le mot est juste. */
  async submitWord(input: {
    userId: string
    matchId: string
    clientEventId: string
    direction: Direction
    number: number
    answer: string
  }): Promise<{ correct: boolean; finished: FinishResult | null }> {
    const previous = await this.findEvent(input.matchId, input.userId, input.clientEventId)
    if (previous) return { correct: previous.correct, finished: null }

    const match = await this.loadActive(input.userId, input.matchId)
    const slot = findSlot(match.puzzle, input.direction, input.number)
    if (!slot) throw new AppError(400, ERROR_CODES.validation, 'Mot inexistant.')
    const expected = revealSlot(match.puzzle, slot)
      .map((cell) => cell.letter)
      .join('')
    const correct = normalizeAnswer(input.answer) === expected
    const key = wordKey(input.direction, input.number)

    try {
      return await this.db.$transaction(async (tx) => {
        await tx.matchEvent.create({
          data: {
            matchId: input.matchId,
            userId: input.userId,
            clientEventId: input.clientEventId,
            type: 'submit-word',
            payload: { word: key, correct },
          },
        })
        if (!correct) return { correct, finished: null }

        // Verrou sur la ligne du participant : les soumissions d'un même joueur sont sérialisées.
        const locked = await tx.$queryRaw<{ solved_words: string[] }[]>`
          SELECT mp.solved_words FROM match_participants mp
          JOIN matches m ON m.id = mp.match_id
          WHERE mp.match_id = ${input.matchId}::uuid AND mp.user_id = ${input.userId}::uuid
            AND m.status = 'active' AND m.deadline_at > ${this.now()}
          FOR UPDATE OF mp`
        const current = locked[0]
        if (!current) throw conflict('Le match est terminé.')
        if (current.solved_words.includes(key)) return { correct, finished: null }

        const solved = [...current.solved_words, key]
        await tx.matchParticipant.update({
          where: { matchId_userId: { matchId: input.matchId, userId: input.userId } },
          data: { solvedWords: solved, lastSolvedAt: this.now() },
        })
        if (solved.length < match.puzzle.clues.length) return { correct, finished: null }
        const finished = await this.finish(tx, input.matchId, input.userId, 'completed')
        return { correct, finished }
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Même action reçue deux fois en parallèle : on renvoie le résultat déjà enregistré.
        const stored = await this.findEvent(input.matchId, input.userId, input.clientEventId)
        return { correct: stored?.correct ?? false, finished: null }
      }
      throw error
    }
  }

  async forfeit(
    userId: string,
    matchId: string,
    reason: 'forfeit' | 'disconnect' = 'forfeit',
  ): Promise<FinishResult | null> {
    const match = await this.db.match.findFirst({
      where: { id: matchId, participants: { some: { userId } } },
      select: { status: true, participants: { select: { userId: true } } },
    })
    if (!match) throw notFound('Match introuvable.')
    if (match.status === 'waiting') {
      // Invitation non acceptée : elle est simplement annulée.
      return this.db.$transaction((tx) => this.finish(tx, matchId, null, 'forfeit', 'aborted'))
    }
    const opponent = match.participants.find((p) => p.userId !== userId)?.userId ?? null
    return this.db.$transaction((tx) => this.finish(tx, matchId, opponent, reason))
  }

  /** Clôt un match arrivé à échéance en départageant les joueurs. */
  async expire(matchId: string): Promise<FinishResult | null> {
    const match = await this.db.match.findUnique({
      where: { id: matchId },
      select: {
        status: true,
        deadlineAt: true,
        participants: { select: { userId: true, solvedWords: true, lastSolvedAt: true } },
      },
    })
    if (match?.status !== 'active' || !match.deadlineAt || match.deadlineAt > this.now())
      return null
    const [a, b] = [...match.participants].sort((x, y) => {
      if (y.solvedWords.length !== x.solvedWords.length)
        return y.solvedWords.length - x.solvedWords.length
      return (x.lastSolvedAt?.getTime() ?? Infinity) - (y.lastSolvedAt?.getTime() ?? Infinity)
    })
    let winner: string | null = null
    if (a && b) {
      const sameCount = a.solvedWords.length === b.solvedWords.length
      const sameTime = (a.lastSolvedAt?.getTime() ?? null) === (b.lastSolvedAt?.getTime() ?? null)
      winner = sameCount && sameTime ? null : a.userId
    }
    return this.db.$transaction((tx) => this.finish(tx, matchId, winner, 'deadline'))
  }

  async activeMatchId(userId: string): Promise<string | null> {
    const row = await this.db.matchParticipant.findFirst({
      where: { userId, active: true },
      select: { matchId: true },
    })
    return row?.matchId ?? null
  }

  async markDisconnected(userId: string): Promise<string | null> {
    await this.leaveQueue(userId)
    const matchId = await this.activeMatchId(userId)
    if (!matchId) return null
    await this.db.matchParticipant.updateMany({
      where: { matchId, userId, active: true },
      data: { disconnectedAt: this.now() },
    })
    return matchId
  }

  async markConnected(userId: string): Promise<string | null> {
    const matchId = await this.activeMatchId(userId)
    if (!matchId) return null
    await this.db.matchParticipant.updateMany({
      where: { matchId, userId },
      data: { disconnectedAt: null },
    })
    return matchId
  }

  /** Vrai si le joueur est toujours déconnecté depuis au moins `graceMs`. */
  async stillDisconnected(userId: string, matchId: string, graceMs: number): Promise<boolean> {
    const row = await this.db.matchParticipant.findUnique({
      where: { matchId_userId: { matchId, userId } },
      select: { disconnectedAt: true, active: true },
    })
    return (
      !!row?.active &&
      !!row.disconnectedAt &&
      this.now().getTime() - row.disconnectedAt.getTime() >= graceMs - 50
    )
  }

  /** Au démarrage : matchs actifs à reprendre (échéance et délai de grâce repartent de maintenant). */
  async recoverActive(): Promise<{ id: string; deadlineAt: Date; userIds: string[] }[]> {
    const matches = await this.db.match.findMany({
      where: { status: 'active' },
      select: { id: true, deadlineAt: true, participants: { select: { userId: true } } },
    })
    await this.db.matchParticipant.updateMany({
      where: { active: true, match: { status: 'active' } },
      data: { disconnectedAt: this.now() },
    })
    return matches.map((m) => ({
      id: m.id,
      deadlineAt: m.deadlineAt ?? this.now(),
      userIds: m.participants.map((p) => p.userId),
    }))
  }

  async rating(userId: string) {
    const row = await this.db.rating.findUnique({ where: { userId } })
    return {
      rating: row?.rating ?? ELO_INITIAL,
      gamesPlayed: row?.gamesPlayed ?? 0,
      wins: row?.wins ?? 0,
      losses: row?.losses ?? 0,
      draws: row?.draws ?? 0,
    }
  }

  async leaderboard(limit: number) {
    const rows = await this.db.rating.findMany({
      where: { gamesPlayed: { gt: 0 }, user: { username: { not: null } } },
      orderBy: [{ rating: 'desc' }, { gamesPlayed: 'desc' }],
      take: limit,
      select: { rating: true, gamesPlayed: true, wins: true, user: { select: { username: true } } },
    })
    return rows.map((row, index) => ({
      rank: index + 1,
      username: row.user.username ?? '',
      rating: row.rating,
      gamesPlayed: row.gamesPlayed,
      wins: row.wins,
    }))
  }

  async history(userId: string, limit: number) {
    const rows = await this.db.matchParticipant.findMany({
      where: { userId, match: { status: 'finished' } },
      orderBy: { finishedAt: 'desc' },
      take: limit,
      select: {
        result: true,
        solvedWords: true,
        match: {
          select: {
            id: true,
            mode: true,
            endedAt: true,
            endReason: true,
            puzzle: { select: { title: true } },
            participants: {
              where: { NOT: { userId } },
              select: { user: { select: { username: true } } },
            },
          },
        },
      },
    })
    return rows.map((row) => ({
      matchId: row.match.id,
      mode: row.match.mode,
      puzzleTitle: row.match.puzzle.title,
      opponent: row.match.participants[0]?.user.username ?? null,
      result: row.result,
      endReason: row.match.endReason,
      solvedCount: row.solvedWords.length,
      endedAt: row.match.endedAt?.toISOString() ?? null,
    }))
  }

  async deadlineOf(matchId: string): Promise<Date | null> {
    const row = await this.db.match.findUnique({
      where: { id: matchId },
      select: { deadlineAt: true },
    })
    return row?.deadlineAt ?? null
  }

  async participants(matchId: string): Promise<string[]> {
    const rows = await this.db.matchParticipant.findMany({
      where: { matchId },
      select: { userId: true },
    })
    return rows.map((row) => row.userId)
  }

  /** Vue du match pour `userId`. Un non-participant obtient une 404 (pas de fuite d'existence). */
  async state(
    userId: string,
    matchId: string,
    connected: (userId: string) => boolean,
  ): Promise<MatchState> {
    const match = await this.db.match.findFirst({
      where: { id: matchId, participants: { some: { userId } } },
      include: {
        participants: {
          orderBy: { slot: 'asc' },
          include: { user: { select: { username: true } } },
        },
      },
    })
    if (!match) throw notFound('Match introuvable.')
    const loaded = await this.puzzles.findPublished(match.puzzleId)
    if (!loaded) throw notFound('Puzzle introuvable.')
    const me = match.participants.find((p) => p.userId === userId)
    const started = match.status !== 'waiting'
    const { cells, clues } = toPublicPuzzle(loaded.puzzle)

    return {
      id: match.id,
      mode: match.mode,
      status: match.status,
      inviteCode: match.inviteCode,
      // La grille n'est envoyée qu'au démarrage : mêmes conditions pour les deux joueurs.
      puzzle: started
        ? { ...loaded.summary, cells: cells.map((l) => [...l]), clues: [...clues] }
        : null,
      totalWords: loaded.puzzle.clues.length,
      startedAt: match.startedAt?.toISOString() ?? null,
      deadlineAt: match.deadlineAt?.toISOString() ?? null,
      serverTime: this.now().toISOString(),
      endReason: match.endReason,
      winnerId: match.winnerId,
      me: {
        userId,
        solvedWords: (me?.solvedWords ?? []).map((key) => this.solvedWord(loaded.puzzle, key)),
      },
      participants: match.participants.map((p) => ({
        userId: p.userId,
        username: p.user.username,
        solvedCount: p.solvedWords.length,
        connected: connected(p.userId),
        result: p.result,
      })),
    }
  }

  private solvedWord(puzzle: Puzzle, key: string) {
    const [numberText, direction] = key.split('-') as [string, Direction]
    const number = Number(numberText)
    const slot = findSlot(puzzle, direction, number)
    const answer = slot
      ? revealSlot(puzzle, slot)
          .map((c) => c.letter)
          .join('')
      : ''
    return { direction, number, answer }
  }

  /**
   * Termine le match si et seulement s'il n'est pas déjà terminé : la mise à jour conditionnelle
   * garantit un résultat unique même si plusieurs fins sont déclenchées en même temps.
   */
  private async finish(
    tx: Tx,
    matchId: string,
    winnerId: string | null,
    reason: EndReason,
    status: 'finished' | 'aborted' = 'finished',
  ): Promise<FinishResult | null> {
    const now = this.now()
    const updated = await tx.match.updateMany({
      where: { id: matchId, status: { in: ['waiting', 'active'] } },
      data: { status, endedAt: now, winnerId, endReason: reason, inviteCode: null },
    })
    if (updated.count !== 1) return null
    const participants = await tx.matchParticipant.findMany({
      where: { matchId },
      select: { userId: true },
    })
    for (const { userId } of participants) {
      const result =
        status === 'aborted'
          ? null
          : winnerId === null
            ? 'draw'
            : winnerId === userId
              ? 'win'
              : 'loss'
      await tx.matchParticipant.update({
        where: { matchId_userId: { matchId, userId } },
        data: { active: false, finishedAt: now, result },
      })
    }
    const match = await tx.match.findUniqueOrThrow({
      where: { id: matchId },
      select: { mode: true },
    })
    if (status === 'finished' && match.mode === 'quick' && participants.length === 2) {
      await this.updateRatings(
        tx,
        participants.map((p) => p.userId),
        winnerId,
      )
    }
    return { matchId, userIds: participants.map((p) => p.userId) }
  }

  /** Classement Elo, dans la transaction de clôture : appliqué une seule fois par match. */
  private async updateRatings(tx: Tx, userIds: string[], winnerId: string | null): Promise<void> {
    const [a, b] = userIds
    if (!a || !b) return
    const rows = await tx.rating.findMany({ where: { userId: { in: userIds } } })
    const current = (id: string): number => rows.find((r) => r.userId === id)?.rating ?? ELO_INITIAL
    for (const [me, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const score = winnerId === null ? 0.5 : winnerId === me ? 1 : 0
      const rating = eloUpdate(current(me), current(other), score)
      const counters = {
        wins: score === 1 ? 1 : 0,
        losses: score === 0 ? 1 : 0,
        draws: score === 0.5 ? 1 : 0,
      }
      await tx.rating.upsert({
        where: { userId: me },
        create: { userId: me, rating, gamesPlayed: 1, ...counters },
        update: {
          rating,
          gamesPlayed: { increment: 1 },
          wins: { increment: counters.wins },
          losses: { increment: counters.losses },
          draws: { increment: counters.draws },
        },
      })
    }
  }

  private async loadActive(userId: string, matchId: string): Promise<{ puzzle: Puzzle }> {
    const match = await this.db.match.findFirst({
      where: { id: matchId, participants: { some: { userId } } },
      select: { status: true, puzzleId: true, deadlineAt: true },
    })
    if (!match) throw notFound('Match introuvable.')
    if (match.status !== 'active' || !match.deadlineAt || match.deadlineAt <= this.now()) {
      throw conflict('Le match n’est pas en cours.')
    }
    const loaded = await this.puzzles.findPublished(match.puzzleId)
    if (!loaded) throw notFound('Puzzle introuvable.')
    return { puzzle: loaded.puzzle }
  }

  private async findEvent(
    matchId: string,
    userId: string,
    clientEventId: string,
  ): Promise<{ correct: boolean } | null> {
    const event = await this.db.matchEvent.findUnique({
      where: { matchId_userId_clientEventId: { matchId, userId, clientEventId } },
      select: { payload: true },
    })
    if (!event) return null
    const payload = event.payload as { correct?: unknown }
    return { correct: payload.correct === true }
  }

  private async assertAvailable(userId: string): Promise<void> {
    if (await this.activeMatchId(userId)) throw conflict('Vous participez déjà à un match.')
  }

  private async randomPuzzleId(): Promise<string | null> {
    const ids = await this.db.puzzle.findMany({
      where: { status: 'published' },
      select: { id: true },
    })
    if (ids.length === 0) return null
    return ids[randomInt(ids.length)]?.id ?? null
  }
}
