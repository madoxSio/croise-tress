import type { MatchState } from '@crossverse/contracts'
import { describe, expect, it } from 'vitest'
import { MatchConnection, type SocketLike } from '../src/match/connection'
import { DuelController } from '../src/match/controller'
import { normalizeInviteCode } from '../src/match/logic'
import { PUZZLE } from './fixtures'

const ME = '00000000-0000-4000-8000-0000000000a1'
const OTHER = '00000000-0000-4000-8000-0000000000a2'
const MATCH = '00000000-0000-4000-8000-0000000000c1'
/** Solution de la grille de test, connue du seul faux serveur. */
const ANSWERS: Record<string, string> = {
  '1-across': 'TABLE',
  '4-across': 'BALLE',
  '5-across': 'ELEVE',
  '1-down': 'TABLE',
  '2-down': 'BALLE',
  '3-down': 'ELEVE',
}

function matchState(solved: { direction: 'across' | 'down'; number: number; answer: string }[]) {
  const state: MatchState = {
    id: MATCH,
    mode: 'private',
    status: 'active',
    inviteCode: null,
    puzzle: {
      ...PUZZLE,
      slug: 'table',
      theme: 'Test',
      themeSlug: 'test',
      parentThemeSlug: null,
      skin: 'default',
      difficulty: 'easy',
      format: 'freeform',
      estimatedMinutes: 5,
      cells: PUZZLE.cells.map((line) => [...line]),
      clues: [...PUZZLE.clues],
    },
    totalWords: 6,
    startedAt: '2026-10-20T10:00:00.000Z',
    deadlineAt: '2026-10-20T10:15:00.000Z',
    serverTime: new Date(Date.now()).toISOString(),
    endReason: null,
    winnerId: null,
    me: { userId: ME, solvedWords: solved },
    participants: [
      { userId: ME, username: 'moi', solvedCount: solved.length, connected: true, result: null },
      { userId: OTHER, username: 'toi', solvedCount: 0, connected: true, result: null },
    ],
  }
  return state
}

/** Faux serveur Socket.IO : connecté d'emblée, juge les mots avec `ANSWERS`. */
function fakeSocket() {
  const handlers = new Map<string, (...args: never[]) => void>()
  const emitted: { event: string; payload: Record<string, unknown> }[] = []
  let solved: { direction: 'across' | 'down'; number: number; answer: string }[] = []
  const socket: SocketLike = {
    connected: true,
    active: true,
    connect: () => undefined,
    disconnect: () => undefined,
    on(event, listener) {
      handlers.set(event, listener)
    },
    emit(event, payload, ack) {
      const body = payload as Record<string, unknown>
      emitted.push({ event, payload: body })
      if (event === 'match:submit-word') {
        const key = `${String(body['number'])}-${String(body['direction'])}`
        const correct = ANSWERS[key] === body['answer']
        if (correct) {
          solved = [
            ...solved,
            {
              direction: body['direction'] as 'across' | 'down',
              number: body['number'] as number,
              answer: body['answer'] as string,
            },
          ]
        }
        ack({ ok: true, data: { correct, state: matchState(solved) } })
      } else if (event === 'match:resync') {
        ack({ ok: true, data: matchState(solved) })
      } else if (event === 'queue:join') {
        ack({ ok: true, data: { status: 'queued' } })
      }
    },
  }
  return { socket, emitted }
}

async function setup() {
  const { socket, emitted } = fakeSocket()
  let id = 0
  const connection = new MatchConnection({
    factory: () => socket,
    newId: () => `evt-${String(++id).padStart(8, '0')}`,
  })
  const duel = new DuelController(connection)
  duel.connect()
  await duel.resync(MATCH)
  return { duel, emitted }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('duel', () => {
  it('construit la grille du match reçu du serveur', async () => {
    const { duel } = await setup()
    const snapshot = duel.getSnapshot()
    expect(snapshot.state?.id).toBe(MATCH)
    expect(snapshot.puzzle?.width).toBe(5)
    expect(snapshot.game?.locked).toBe(false)
  })

  it('soumet un mot dès qu’il est complet et réécrit le mot validé', async () => {
    const { duel, emitted } = await setup()
    duel.dispatch({ type: 'select', position: { row: 0, col: 0 } })
    duel.dispatch({ type: 'input', text: 'TABLE' })
    await flush()

    const submits = emitted.filter((e) => e.event === 'match:submit-word')
    expect(submits).toHaveLength(1)
    expect(submits[0]?.payload).toMatchObject({ direction: 'across', number: 1, answer: 'TABLE' })
    expect(typeof submits[0]?.payload['clientEventId']).toBe('string')
    const snapshot = duel.getSnapshot()
    expect(snapshot.notice).toBe('Mot trouvé : 1 horizontal.')
    expect(snapshot.game?.marks.get('0:4')).toBe('correct')
    expect(snapshot.state?.me.solvedWords).toHaveLength(1)
  })

  it('marque faux un mot refusé sans le resoumettre tel quel', async () => {
    const { duel, emitted } = await setup()
    duel.dispatch({ type: 'select', position: { row: 2, col: 0 } })
    duel.dispatch({ type: 'input', text: 'BALLS' })
    await flush()
    expect(duel.getSnapshot().notice).toBe('4 horizontal : ce n’est pas le bon mot.')
    expect(duel.getSnapshot().game?.marks.get('2:4')).toBe('incorrect')

    // Une autre saisie ailleurs ne renvoie pas la même proposition.
    duel.dispatch({ type: 'select', position: { row: 4, col: 0 } })
    duel.dispatch({ type: 'input', text: 'E' })
    await flush()
    expect(emitted.filter((e) => e.event === 'match:submit-word')).toHaveLength(1)
  })

  it('rétablit une case déjà validée si le joueur l’efface', async () => {
    const { duel } = await setup()
    duel.dispatch({ type: 'select', position: { row: 0, col: 0 } })
    duel.dispatch({ type: 'input', text: 'TABLE' })
    await flush()
    duel.dispatch({ type: 'select', position: { row: 0, col: 4 } })
    duel.dispatch({ type: 'backspace' })
    expect(duel.getSnapshot().game?.grid[0]?.[4]).toBe('E')
  })

  it('rejoint la file d’attente', async () => {
    const { duel } = await setup()
    await duel.joinQueue()
    expect(duel.getSnapshot().queue).toBe('queued')
  })

  it('normalise un code d’invitation et refuse les caractères ambigus', () => {
    expect(normalizeInviteCode(' abc-def ')).toBe('ABCDEF')
    expect(normalizeInviteCode('ABCDE0')).toBeNull()
  })
})
