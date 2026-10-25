/**
 * Orchestration réseau d'une grille pré-remplie : chargement, soumission des mots surlignés,
 * « Où est-il ? » et nouvelle disposition. L'état de jeu vit dans `useWordSearchGame`.
 *
 * Mode d'entraînement : rien n'est enregistré côté serveur (ni score ni points). La partie en
 * cours est gardée dans le navigateur pour survivre à un rechargement, par simple confort.
 */
import {
  wordSearchHitSchema,
  type PublicPuzzleDto,
  type WordSearchClue,
  type WordSearchClueRef,
} from '@crossverse/contracts'
import type { Position } from '@crossverse/crossword-core'
import { z } from 'zod'
import { api, errorMessage, ApiRequestError } from '~/services/api'
import { checkWordSearch, getWordSearch, revealWordSearch } from '~/services/wordsearch'
import { useWordSearchGame, type WordSearchGame } from '~/composables/useWordSearchGame'
import { clueSpoken } from '~/utils/labels'

const STORAGE_PREFIX = 'crossverse:pre-remplie:'

const savedSchema = z.object({
  seed: z.int(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  words: z.array(wordSearchHitSchema.extend({ revealed: z.boolean() })).max(200),
})
type Saved = z.infer<typeof savedSchema>

function readSaved(puzzleId: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + puzzleId)
    if (raw === null) return null
    const parsed = savedSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function writeSaved(puzzleId: string, saved: Saved | null): void {
  try {
    if (saved === null) window.localStorage.removeItem(STORAGE_PREFIX + puzzleId)
    else window.localStorage.setItem(STORAGE_PREFIX + puzzleId, JSON.stringify(saved))
  } catch {
    // Stockage indisponible : la partie reste jouable, elle ne survivra pas au rechargement.
  }
}

/** « 12 horizontal », ou « ligne 4 » pour des mots croisés classiques. */
function clueName(game: WordSearchGame, hit: WordSearchClueRef & { answer: string }): string {
  const clue = game.data.clues.find((c) => c.direction === hit.direction && c.number === hit.number)
  return clue ? clueSpoken(clue, game.data.format === 'classic') : hit.answer
}

export function useWordSearch(puzzleId: string) {
  const details = shallowRef<PublicPuzzleDto | null>(null)
  const game = shallowRef<WordSearchGame | null>(null)
  const loading = ref(true)
  const loadError = ref<string | null>(null)
  const notFound = ref(false)
  const busy = ref(false)
  /** Annonce du dernier résultat (lu par les lecteurs d'écran). */
  const notice = ref<string | null>(null)
  const noticeKind = ref<'hit' | 'miss' | 'info'>('info')
  const startedAt = ref(Date.now())
  const finishedAt = ref<number | null>(null)

  function persist(): void {
    const current = game.value
    if (!current) return
    writeSaved(puzzleId, {
      seed: current.data.seed,
      startedAt: startedAt.value,
      finishedAt: finishedAt.value,
      words: [...current.found.values()].map(
        ({ direction, number, answer, start, end, revealed }) => ({
          direction,
          number,
          answer,
          start,
          end,
          revealed,
        }),
      ),
    })
  }

  async function load(options: { fresh?: boolean } = {}): Promise<void> {
    loading.value = true
    loadError.value = null
    notFound.value = false
    notice.value = null
    try {
      const saved = options.fresh ? null : readSaved(puzzleId)
      const [puzzle, data] = await Promise.all([
        details.value ? Promise.resolve(details.value) : api.getPuzzle(puzzleId),
        getWordSearch(puzzleId, saved?.seed),
      ])
      details.value = puzzle
      const next = useWordSearchGame(data)
      for (const word of saved?.words ?? []) next.addHit(word, word.revealed)
      game.value = next
      startedAt.value = saved?.startedAt ?? Date.now()
      finishedAt.value = saved?.finishedAt ?? null
      persist()
    } catch (cause) {
      notFound.value = cause instanceof ApiRequestError && cause.isNotFound
      loadError.value = notFound.value ? 'Cette grille est introuvable.' : errorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  function markFinished(): void {
    if (game.value?.complete && finishedAt.value === null) finishedAt.value = Date.now()
  }

  async function submit(from: Position, to: Position): Promise<void> {
    const current = game.value
    if (!current || busy.value) return
    busy.value = true
    try {
      const hit = await checkWordSearch(puzzleId, {
        seed: current.data.seed,
        from,
        to,
        found: current.foundRefs,
      })
      if (!hit) {
        noticeKind.value = 'miss'
        notice.value = 'Pas de mot ici. Essaie un autre tracé !'
      } else if (current.addHit(hit)) {
        noticeKind.value = 'hit'
        notice.value = `Trouvé : ${hit.answer} (${clueName(current, hit)}).`
        current.selectClue(null)
      } else {
        noticeKind.value = 'info'
        notice.value = `${hit.answer} est déjà trouvé.`
      }
      markFinished()
      persist()
    } catch (cause) {
      noticeKind.value = 'miss'
      notice.value = errorMessage(cause)
    } finally {
      busy.value = false
    }
  }

  /** Montre le mot d'une définition : il compte comme révélé, pas comme trouvé. */
  async function reveal(clue: WordSearchClue): Promise<void> {
    const current = game.value
    if (!current || busy.value || current.isFound(clue)) return
    busy.value = true
    try {
      const hit = await revealWordSearch(puzzleId, {
        seed: current.data.seed,
        direction: clue.direction,
        number: clue.number,
      })
      current.addHit(hit, true)
      noticeKind.value = 'info'
      notice.value = `Le mot était ${hit.answer}.`
      markFinished()
      persist()
    } catch (cause) {
      noticeKind.value = 'miss'
      notice.value = errorMessage(cause)
    } finally {
      busy.value = false
    }
  }

  /** Nouvelle disposition des mêmes mots : la partie repart de zéro. */
  async function reshuffle(): Promise<void> {
    writeSaved(puzzleId, null)
    await load({ fresh: true })
  }

  onMounted(() => void load())

  return {
    details,
    game,
    loading,
    loadError,
    notFound,
    busy,
    notice,
    noticeKind,
    startedAt,
    finishedAt,
    load,
    submit,
    reveal,
    reshuffle,
  }
}
