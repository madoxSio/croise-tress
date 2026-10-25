/**
 * Partie de mots mêlés « standard » : la grille et la liste des mots viennent de l'API, tout le
 * reste se joue dans le navigateur (rien n'est secret ni officiel : ni score, ni points). Les
 * règles (mot reconnu, lettres restantes) sont celles de crossword-core, comme côté serveur.
 * La partie est gardée dans le navigateur pour survivre à un rechargement, par simple confort.
 */
import type { WordListDto, WordSearchDto } from '@crossverse/contracts'
import {
  leftoverLetters,
  matchWordList,
  normalizeAnswer,
  wordOccurrences,
  type Position,
} from '@crossverse/crossword-core'
import { z } from 'zod'
import { errorMessage, ApiRequestError } from '~/services/api'
import { getWordList } from '~/services/wordlists'
import { useWordSearchGame, type WordSearchGame } from '~/composables/useWordSearchGame'

const STORAGE_PREFIX = 'crossverse:mots-meles:'

const positionSchema = z.object({ row: z.int().min(0), col: z.int().min(0) })
const savedSchema = z.object({
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  mysterySolved: z.boolean(),
  words: z
    .array(
      z.object({
        word: z.string(),
        start: positionSchema,
        end: positionSchema,
        revealed: z.boolean(),
      }),
    )
    .max(200),
})
type Saved = z.infer<typeof savedSchema>

function readSaved(id: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + id)
    if (raw === null) return null
    const parsed = savedSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function writeSaved(id: string, saved: Saved | null): void {
  try {
    if (saved === null) window.localStorage.removeItem(STORAGE_PREFIX + id)
    else window.localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(saved))
  } catch {
    // Stockage indisponible : la partie reste jouable, elle ne survivra pas au rechargement.
  }
}

/**
 * La grille de surlignage (`WordSearchGrid`) est partagée avec le mode pré-rempli : chaque mot
 * de la liste y joue le rôle d'une « définition » numérotée dans l'ordre alphabétique.
 */
export function toGridData(list: WordListDto): WordSearchDto {
  return {
    puzzleId: list.id,
    seed: 0,
    format: 'freeform',
    size: list.size,
    rows: list.rows,
    directions: list.directions,
    clues: list.words.map((word, index) => ({
      direction: 'across',
      number: index + 1,
      text: word,
      length: word.length,
      row: 0,
      col: 0,
    })),
  }
}

/** Mot de la liste correspondant à un numéro de « définition » de la grille. */
const numberOf = (list: WordListDto, word: string): number => list.words.indexOf(word) + 1

export function useWordList(id: string) {
  const list = shallowRef<WordListDto | null>(null)
  const game = shallowRef<WordSearchGame | null>(null)
  const loading = ref(true)
  const loadError = ref<string | null>(null)
  const notFound = ref(false)
  const notice = ref<string | null>(null)
  const noticeKind = ref<'hit' | 'miss' | 'info'>('info')
  const startedAt = ref(Date.now())
  const finishedAt = ref<number | null>(null)
  /** Mot mystère proposé juste avant d'avoir rayé tous les mots. */
  const mysterySolved = ref(false)

  /** Lettres restantes une fois tous les mots rayés (chaque mot n'est qu'une fois dans la grille). */
  const mystery = computed(() => {
    const current = list.value
    if (!current) return { letters: '', cells: [] as Position[] }
    const hits = current.words.flatMap((word) => wordOccurrences(current.rows, word).slice(0, 1))
    return leftoverLetters(current.rows, hits)
  })

  const complete = computed(() => game.value?.complete === true)
  const mysteryShown = computed(() => complete.value || mysterySolved.value)

  function persist(): void {
    const current = game.value
    if (!current) return
    writeSaved(id, {
      startedAt: startedAt.value,
      finishedAt: finishedAt.value,
      mysterySolved: mysterySolved.value,
      words: [...current.found.values()].map(({ answer, start, end, revealed }) => ({
        word: answer,
        start,
        end,
        revealed,
      })),
    })
  }

  function addWord(word: string, start: Position, end: Position, revealed: boolean): boolean {
    const current = game.value
    const data = list.value
    if (!current || !data) return false
    const number = numberOf(data, word)
    if (number === 0) return false
    return current.addHit({ direction: 'across', number, answer: word, start, end }, revealed)
  }

  async function load(options: { fresh?: boolean } = {}): Promise<void> {
    loading.value = true
    loadError.value = null
    notFound.value = false
    notice.value = null
    try {
      const data = list.value ?? (await getWordList(id))
      const saved = options.fresh ? null : readSaved(id)
      list.value = data
      game.value = useWordSearchGame(toGridData(data))
      for (const word of saved?.words ?? []) addWord(word.word, word.start, word.end, word.revealed)
      startedAt.value = saved?.startedAt ?? Date.now()
      finishedAt.value = saved?.finishedAt ?? null
      mysterySolved.value = saved?.mysterySolved ?? false
      persist()
    } catch (cause) {
      notFound.value = cause instanceof ApiRequestError && cause.isNotFound
      loadError.value = notFound.value ? 'Ces mots mêlés sont introuvables.' : errorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  function markFinished(): void {
    if (complete.value && finishedAt.value === null) finishedAt.value = Date.now()
  }

  function submit(from: Position, to: Position): void {
    const current = game.value
    const data = list.value
    if (!current || !data) return
    const found = new Set([...current.found.values()].map((word) => word.answer))
    const hit = matchWordList(data, from, to, data.directions, found)
    if (hit && addWord(hit.word, hit.start, hit.end, false)) {
      noticeKind.value = 'hit'
      notice.value = `Trouvé : ${hit.word} !`
    } else if (matchWordList(data, from, to, data.directions)) {
      noticeKind.value = 'info'
      notice.value = 'Ce mot est déjà rayé.'
    } else {
      noticeKind.value = 'miss'
      notice.value = 'Pas de mot de la liste ici. Essaie un autre tracé !'
    }
    markFinished()
    persist()
  }

  /** « Où est-il ? » : montre un mot ; il compte comme montré, pas comme trouvé. */
  function reveal(word: string): void {
    const data = list.value
    const hit = data ? wordOccurrences(data.rows, word)[0] : undefined
    if (!hit || !addWord(word, hit.start, hit.end, true)) return
    noticeKind.value = 'info'
    notice.value = `Voici ${word}.`
    markFinished()
    persist()
  }

  /** Proposition du mot mystère avant la fin : comparée aux lettres restantes. */
  function guessMystery(input: string): boolean {
    const guess = normalizeAnswer(input)
    const ok = guess !== null && guess.length > 0 && guess === mystery.value.letters
    if (ok) mysterySolved.value = true
    noticeKind.value = ok ? 'hit' : 'miss'
    notice.value = ok ? 'Bravo, c’est le mot mystère !' : 'Ce n’est pas le mot mystère.'
    persist()
    return ok
  }

  function restart(): Promise<void> {
    writeSaved(id, null)
    return load({ fresh: true })
  }

  onMounted(() => void load())

  return {
    list,
    game,
    loading,
    loadError,
    notFound,
    notice,
    noticeKind,
    startedAt,
    finishedAt,
    complete,
    mystery,
    mysterySolved,
    mysteryShown,
    load,
    submit,
    reveal,
    guessMystery,
    restart,
  }
}
