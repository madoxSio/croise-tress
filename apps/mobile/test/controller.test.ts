import type { PlaySessionDto, PublicPuzzleDto } from '@crossverse/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../src/api/errors'
import { AUTOSAVE_DELAY_MS, PlayController } from '../src/play/controller'
import { PUZZLE, emptyGrid } from './fixtures'

const DTO: PublicPuzzleDto = {
  ...PUZZLE,
  cells: PUZZLE.cells.map((line) => [...line]),
  clues: [...PUZZLE.clues],
  slug: 'table',
  theme: 'Test',
  difficulty: 'easy',
  estimatedMinutes: 5,
}

const playSession = (patch: Partial<PlaySessionDto> = {}): PlaySessionDto => ({
  id: '00000000-0000-4000-8000-0000000000bb',
  puzzleId: PUZZLE.id,
  status: 'in_progress',
  grid: emptyGrid(),
  revision: 0,
  hints: {
    cellChecks: 0,
    wordChecks: 0,
    lettersRevealed: 0,
    wordsRevealed: 0,
    solutionRevealed: false,
  },
  startedAt: '2026-10-20T10:00:00.000Z',
  completedAt: null,
  durationMs: null,
  score: null,
  ...patch,
})

function fakeApi(start: PlaySessionDto = playSession()) {
  return {
    ensureSession: vi.fn(() => Promise.resolve({ user: null, csrfToken: null })),
    getPuzzle: vi.fn(() => Promise.resolve(DTO)),
    startPlay: vi.fn(() => Promise.resolve(start)),
    getPlay: vi.fn(() => Promise.resolve(start)),
    saveGrid: vi.fn((_id: string, body: { grid: (string | null)[][]; revision: number }) =>
      Promise.resolve(playSession({ grid: body.grid, revision: body.revision + 1 })),
    ),
    check: vi.fn(),
    hint: vi.fn(),
  }
}

async function loaded(api = fakeApi()) {
  const controller = new PlayController(api, PUZZLE.id)
  await controller.load()
  return { api, controller }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('partie solo', () => {
  it('charge la grille et la session du serveur', async () => {
    const { controller } = await loaded()
    const snapshot = controller.getSnapshot()
    expect(snapshot.loading).toBe(false)
    expect(snapshot.puzzle?.id).toBe(PUZZLE.id)
    expect(snapshot.saveState).toBe('saved')
  })

  it('signale une grille introuvable', async () => {
    const api = fakeApi()
    api.getPuzzle.mockRejectedValueOnce(new ApiRequestError(404, 'not_found', 'Introuvable.'))
    const { controller } = await loaded(api)
    expect(controller.getSnapshot().notFound).toBe(true)
    expect(controller.getSnapshot().loadError).toBe('Cette grille est introuvable.')
  })

  it('sauvegarde la saisie après un délai, une seule fois pour plusieurs lettres', async () => {
    const { api, controller } = await loaded()
    controller.dispatch({ type: 'select', position: { row: 0, col: 0 } })
    controller.dispatch({ type: 'input', text: 'AB' })
    expect(controller.getSnapshot().saveState).toBe('pending')

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)

    expect(api.saveGrid).toHaveBeenCalledTimes(1)
    expect(api.saveGrid.mock.calls[0]?.[1].grid[0]?.slice(0, 2)).toEqual(['A', 'B'])
    expect(controller.getSnapshot().session?.revision).toBe(1)
    expect(controller.getSnapshot().saveState).toBe('saved')
  })

  it('recharge la grille du serveur en cas de conflit de révision', async () => {
    const api = fakeApi()
    const server = emptyGrid()
    server[4] = ['V', 'E', 'R', 'S', 'E']
    api.saveGrid.mockRejectedValueOnce(new ApiRequestError(409, 'conflict', 'Conflit.'))
    api.getPlay.mockResolvedValueOnce(playSession({ grid: server, revision: 7 }))
    const { controller } = await loaded(api)

    controller.dispatch({ type: 'select', position: { row: 0, col: 0 } })
    controller.dispatch({ type: 'input', text: 'A' })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)

    const snapshot = controller.getSnapshot()
    expect(snapshot.game?.grid[4]).toEqual(['V', 'E', 'R', 'S', 'E'])
    expect(snapshot.game?.grid[0]?.[0]).toBeNull()
    expect(snapshot.session?.revision).toBe(7)
    expect(snapshot.notice).toMatch(/modifiée ailleurs/)
  })

  it('verrouille la grille quand le serveur déclare la partie terminée', async () => {
    const api = fakeApi()
    api.saveGrid.mockResolvedValueOnce(playSession({ status: 'completed', score: 900 }))
    const { controller } = await loaded(api)

    controller.dispatch({ type: 'select', position: { row: 0, col: 0 } })
    controller.dispatch({ type: 'input', text: 'A' })
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS)
    controller.dispatch({ type: 'input', text: 'B' })

    expect(controller.getSnapshot().game?.locked).toBe(true)
    expect(controller.getSnapshot().session?.score).toBe(900)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(api.saveGrid).toHaveBeenCalledTimes(1)
  })

  it('vérifie le mot actif et affiche le résultat du serveur', async () => {
    const api = fakeApi()
    api.check.mockImplementation(() =>
      Promise.resolve({
        cells: [
          { row: 0, col: 0, result: 'incorrect' },
          { row: 0, col: 1, result: 'empty' },
        ],
        session: playSession({ revision: 1 }),
      }),
    )
    const { controller } = await loaded(api)
    controller.dispatch({ type: 'select', position: { row: 0, col: 0 } })
    controller.dispatch({ type: 'input', text: 'Q' })

    await controller.check('word')

    expect(api.check.mock.calls[0]?.[1]).toMatchObject({
      scope: 'word',
      word: { direction: 'across', number: 1 },
    })
    expect(api.saveGrid).not.toHaveBeenCalled()
    expect(controller.getSnapshot().game?.marks.get('0:0')).toBe('incorrect')
    expect(controller.getSnapshot().notice).toBe('1 lettre fausse, 1 case vide.')
    expect(controller.getSnapshot().game?.locked).toBe(false)
  })

  it('demande une case sélectionnée avant un indice de lettre', async () => {
    const { api, controller } = await loaded()
    await controller.hint('letter')
    expect(api.hint).not.toHaveBeenCalled()
    expect(controller.getSnapshot().notice).toBe('Sélectionnez d’abord une case.')
  })

  it('envoie la saisie en attente quand l’écran est quitté', async () => {
    const { api, controller } = await loaded()
    controller.dispatch({ type: 'select', position: { row: 0, col: 0 } })
    controller.dispatch({ type: 'input', text: 'A' })
    await controller.dispose()
    expect(api.saveGrid).toHaveBeenCalledTimes(1)
  })
})
