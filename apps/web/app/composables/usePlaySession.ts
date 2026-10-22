/**
 * Orchestration réseau d'une partie solo : chargement/reprise, sauvegarde automatique
 * débouncée avec révision, vérifications et indices. L'état de jeu lui-même vit dans
 * `useCrosswordGame` ; le score et la fin de partie viennent exclusivement du serveur.
 */
import type { CheckBody, HintBody, PlaySessionDto, PublicPuzzleDto } from '@crossverse/contracts'
import type { PublicPuzzle } from '@crossverse/crossword-core'
import { ApiRequestError, api, errorMessage } from '~/services/api'
import { useCrosswordGame } from '~/composables/useCrosswordGame'
import type { ReactiveCrosswordGame } from '~/composables/useCrosswordGame'
import { gridMatches, toEnginePuzzle } from '~/utils/puzzle'

export const AUTOSAVE_DELAY_MS = 800
const RETRY_DELAY_MS = 4000

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'
export type CheckScope = 'cell' | 'word' | 'grid'
export type HintKind = 'letter' | 'word' | 'explain' | 'solution'

export function usePlaySession(puzzleId: string) {
  const details = shallowRef<PublicPuzzleDto | null>(null)
  const puzzle = shallowRef<PublicPuzzle | null>(null)
  const session = shallowRef<PlaySessionDto | null>(null)
  const game = shallowRef<ReactiveCrosswordGame | null>(null)

  const loading = ref(true)
  const loadError = ref<string | null>(null)
  const notFound = ref(false)
  const saveState = ref<SaveState>('idle')
  /** Message d'état annoncé aux lecteurs d'écran (résultat de vérification, conflit…). */
  const notice = ref<string | null>(null)
  const actionError = ref<string | null>(null)
  const explanation = ref<{ label: string; text: string } | null>(null)
  const busy = ref(false)

  const completed = computed(() => session.value?.status === 'completed')

  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> | null = null
  let dirty = false
  // Lu via une fonction : `dirty` peut changer pendant un `await` (saisie concurrente).
  const isDirty = (): boolean => dirty
  let stopWatch: (() => void) | undefined

  function adopt(next: PlaySessionDto, options: { replaceGrid: boolean }): void {
    session.value = next
    const current = game.value
    if (!current) return
    if (options.replaceGrid || next.status === 'completed') current.loadGrid(next.grid)
    if (next.status === 'completed') {
      current.locked = true
      dirty = false
      clearTimer()
    }
  }

  function clearTimer(): void {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  function schedule(delay = AUTOSAVE_DELAY_MS): void {
    if (completed.value) return
    dirty = true
    saveState.value = 'pending'
    clearTimer()
    timer = setTimeout(() => {
      void flush()
    }, delay)
  }

  /** Recharge la session serveur après un conflit de révision (autre onglet, partie terminée). */
  async function reload(message: string): Promise<void> {
    const current = session.value
    if (!current) return
    try {
      adopt(await api.getPlay(current.id), { replaceGrid: true })
      dirty = false
      saveState.value = 'saved'
      notice.value = message
    } catch (error) {
      saveState.value = 'error'
      actionError.value = errorMessage(error)
    }
  }

  /** Envoie immédiatement la sauvegarde en attente (et attend celle déjà en cours). */
  async function flush(options: { keepalive?: boolean } = {}): Promise<void> {
    clearTimer()
    if (inFlight) await inFlight
    const current = session.value
    const currentGame = game.value
    if (!dirty || !current || !currentGame || completed.value) return
    dirty = false
    saveState.value = 'saving'
    inFlight = (async () => {
      try {
        const next = await api.saveGrid(
          current.id,
          { grid: currentGame.snapshot(), revision: current.revision },
          options,
        )
        // La grille locale peut être plus récente que celle envoyée : on ne garde que la révision.
        adopt(next, { replaceGrid: false })
        saveState.value = isDirty() ? 'pending' : 'saved'
      } catch (error) {
        if (error instanceof ApiRequestError && error.isConflict) {
          await reload('La partie a été modifiée ailleurs : la grille a été rechargée.')
          return
        }
        saveState.value = 'error'
        actionError.value = errorMessage(error)
        schedule(RETRY_DELAY_MS)
      } finally {
        inFlight = null
      }
    })()
    await inFlight
  }

  async function load(): Promise<void> {
    loading.value = true
    loadError.value = null
    notFound.value = false
    try {
      await api.ensureSession()
      const [dto, play] = await Promise.all([api.getPuzzle(puzzleId), api.startPlay(puzzleId)])
      const engine = toEnginePuzzle(dto)
      if (!gridMatches(engine, play.grid)) {
        throw new ApiRequestError(0, 'invalid_response', 'La partie enregistrée est illisible.')
      }
      details.value = dto
      puzzle.value = engine
      const created = reactive(useCrosswordGame(engine, { initialGrid: play.grid }))
      game.value = created
      adopt(play, { replaceGrid: false })
      stopWatch?.()
      stopWatch = watch(
        () => created.editCount,
        () => {
          schedule()
        },
      )
      saveState.value = 'saved'
    } catch (error) {
      notFound.value = error instanceof ApiRequestError && error.isNotFound
      loadError.value = notFound.value ? 'Cette grille est introuvable.' : errorMessage(error)
    } finally {
      loading.value = false
    }
  }

  /** Exécute une action serveur en bloquant la saisie pour garder grille et révision cohérentes. */
  async function withLock(action: () => Promise<void>): Promise<void> {
    const currentGame = game.value
    if (!currentGame || busy.value || completed.value) return
    busy.value = true
    currentGame.locked = true
    actionError.value = null
    try {
      await action()
    } catch (error) {
      if (error instanceof ApiRequestError && error.isConflict) {
        await reload('La partie a été modifiée ailleurs : la grille a été rechargée.')
      } else {
        actionError.value = errorMessage(error)
      }
    } finally {
      busy.value = false
      currentGame.locked = completed.value
    }
  }

  function check(scope: CheckScope): Promise<void> {
    return withLock(async () => {
      const currentGame = game.value
      // Une vérification enregistre aussi la grille : on attend la sauvegarde en cours.
      clearTimer()
      if (inFlight) await inFlight
      const current = session.value
      if (!currentGame || !current) return
      const base = { grid: currentGame.snapshot(), revision: current.revision }
      const active = currentGame.active
      const clue = currentGame.activeClue
      let body: CheckBody
      if (scope === 'cell') {
        if (!active) return void (notice.value = 'Sélectionnez d’abord une case.')
        body = { scope, ...base, cell: { row: active.row, col: active.col } }
      } else if (scope === 'word') {
        if (!clue) return void (notice.value = 'Sélectionnez d’abord un mot.')
        body = { scope, ...base, word: { direction: clue.direction, number: clue.number } }
      } else {
        body = { scope, ...base }
      }
      const response = await api.check(current.id, body)
      dirty = false
      adopt(response.session, { replaceGrid: false })
      currentGame.applyChecks(response.cells)
      saveState.value = 'saved'
      notice.value = describeCheck(response.cells)
    })
  }

  function hint(kind: HintKind): Promise<void> {
    return withLock(async () => {
      const currentGame = game.value
      // Les indices s'appliquent à la grille stockée : on envoie d'abord la saisie en attente.
      await flush()
      const current = session.value
      if (!currentGame || !current) return
      const active = currentGame.active
      const clue = currentGame.activeClue
      let body: HintBody
      if (kind === 'letter') {
        if (!active) return void (notice.value = 'Sélectionnez d’abord une case.')
        body = { type: 'letter', cell: { row: active.row, col: active.col } }
      } else if (kind === 'word' || kind === 'explain') {
        if (!clue) return void (notice.value = 'Sélectionnez d’abord un mot.')
        body = { type: kind, word: { direction: clue.direction, number: clue.number } }
      } else {
        body = { type: 'solution', confirm: true }
      }
      const response = await api.hint(current.id, body)
      adopt(response.session, { replaceGrid: true })
      currentGame.applyRevealed(response.revealed)
      if (response.explanation !== null && clue) {
        explanation.value = {
          label: `${clue.number} ${clue.direction === 'across' ? 'horizontal' : 'vertical'}`,
          text: response.explanation,
        }
      } else if (kind === 'explain') {
        notice.value = 'Aucune explication n’est disponible pour ce mot.'
      }
      if (response.revealed.length > 0) {
        notice.value =
          response.revealed.length === 1
            ? 'Une lettre a été révélée.'
            : `${response.revealed.length} lettres ont été révélées.`
      }
      saveState.value = 'saved'
    })
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden' && dirty) void flush({ keepalive: true })
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onVisibilityChange)
    void load()
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', onVisibilityChange)
    stopWatch?.()
    // Navigation interne : on n'abandonne pas la saisie en attente.
    if (dirty) void flush({ keepalive: true })
  })

  return {
    details,
    puzzle,
    session,
    game,
    loading,
    loadError,
    notFound,
    saveState,
    notice,
    actionError,
    explanation,
    busy,
    completed,
    load,
    flush,
    check,
    hint,
  }
}

function describeCheck(cells: readonly { result: 'correct' | 'incorrect' | 'empty' }[]): string {
  const wrong = cells.filter((cell) => cell.result === 'incorrect').length
  const empty = cells.filter((cell) => cell.result === 'empty').length
  if (wrong === 0 && empty === 0) return 'Tout est juste.'
  const parts: string[] = []
  if (wrong > 0) parts.push(wrong === 1 ? '1 lettre fausse' : `${wrong} lettres fausses`)
  if (empty > 0) parts.push(empty === 1 ? '1 case vide' : `${empty} cases vides`)
  return parts.join(', ') + '.'
}
