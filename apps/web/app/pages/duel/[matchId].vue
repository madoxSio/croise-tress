<script setup lang="ts">
/**
 * Match en direct. Le joueur remplit la grille librement ; dès qu'un mot est complet, il est
 * soumis au serveur, seul juge. Les mots validés (lettres renvoyées par le serveur, pour ce
 * joueur uniquement) sont réécrits dans la grille ; de l'adversaire on ne connaît que le
 * nombre de mots trouvés.
 */
import { slotCells } from '@crossverse/crossword-core'
import type { PublicClue } from '@crossverse/crossword-core'
import { uuidSchema, type MatchState } from '@crossverse/contracts'
import { useCrosswordGame } from '~/composables/useCrosswordGame'
import type { ReactiveCrosswordGame } from '~/composables/useCrosswordGame'
import { matchWordKey } from '~/composables/useMatch'
import { api } from '~/services/api'
import { matchApi, type Rating } from '~/services/match'
import { clueTag, directionLabel, difficultyLabel } from '~/utils/labels'
import { toEnginePuzzle } from '~/utils/puzzle'

const route = useRoute()
const rawId = route.params['matchId']
const matchId = (Array.isArray(rawId) ? rawId[0] : rawId) ?? ''
const validId = uuidSchema.safeParse(matchId).success

const match = useMatch()
const { status, state, busy, error, remainingMs, opponentGraceMs, me, opponent, outcome } = match
const solvedKeys = match.solvedKeys

const loadState = ref<'loading' | 'ready' | 'not-found' | 'error'>(
  validId ? 'loading' : 'not-found',
)
const loadError = ref<string | null>(null)
const game = shallowRef<ReactiveCrosswordGame | null>(null)
/** Mots croisés classiques : repères de lignes et colonnes au lieu des numéros. */
const classic = computed(() => current.value?.puzzle?.format === 'classic')
const notice = ref('')
/** Annonces pour lecteurs d'écran : progression de l'adversaire, temps, connexion. */
const announcement = ref('')
const confirmForfeit = ref(false)
const confirmHint = ref(false)
/** Prix d'une lettre en duel et solde, lus dans le portefeuille (affichage seulement). */
const hintCost = ref<number | null>(null)
const balance = ref<number | null>(null)
const gridRef = ref<{ focus: () => void } | null>(null)
const resultRef = ref<{ focus: () => void } | null>(null)
/** Dernière proposition envoyée par mot : on ne soumet pas deux fois les mêmes lettres. */
const attempts = new Map<string, string>()

const rating = ref<Rating | null>(null)
const ratingBefore = ref<number | null>(null)

useHead({
  title: () =>
    state.value?.puzzle ? `Duel · ${state.value.puzzle.title} — Crossverse` : 'Duel — Crossverse',
})

async function load(): Promise<void> {
  if (!validId) return
  loadState.value = 'loading'
  const ack = await match.resync(matchId)
  if (ack.ok) loadState.value = 'ready'
  else if (ack.error.code === 'not_found' || ack.error.code === 'validation_error') {
    loadState.value = 'not-found'
  } else {
    loadState.value = 'error'
    loadError.value = ack.error.message
  }
}

// Premier chargement dès que la connexion est établie ; ensuite, la connexion resynchronise seule.
watch(
  status,
  (current) => {
    if (current === 'connected' && loadState.value === 'loading') void load()
  },
  { immediate: true },
)

/** État du match affiché : uniquement celui demandé par l'URL. */
const current = computed<MatchState | null>(() =>
  state.value?.id === matchId ? state.value : null,
)
const isActive = computed(() => current.value?.status === 'active')
const isOver = computed(
  () => current.value?.status === 'finished' || current.value?.status === 'aborted',
)

// --- Grille ---------------------------------------------------------------------

/** Réécrit les mots validés par le serveur et les marque justes ; la saisie libre est conservée. */
function applySolved(target: ReactiveCrosswordGame, solved: MatchState['me']['solvedWords']): void {
  const grid = target.snapshot()
  const marks: { row: number; col: number; result: 'correct' }[] = []
  for (const word of solved) {
    const clue = target.puzzle.clues.find(
      (c) => c.direction === word.direction && c.number === word.number,
    )
    if (!clue) continue
    const cells = slotCells(clue)
    // Garde-fou : une réponse dont la longueur ne correspond pas aux cases n'est pas écrite.
    // Les réponses normalisées par le serveur ne contiennent que des lettres A-Z.
    if (word.answer.length !== cells.length) continue
    cells.forEach((cell, index) => {
      const line = grid[cell.row]
      if (line) line[cell.col] = word.answer.charAt(index)
      marks.push({ ...cell, result: 'correct' })
    })
  }
  target.loadGrid(grid)
  target.applyChecks(marks)
}

watch(
  current,
  (next) => {
    if (!next?.puzzle) return
    game.value ??= reactive(useCrosswordGame(toEnginePuzzle(next.puzzle)))
    applySolved(game.value, next.me.solvedWords)
    game.value.locked = next.status !== 'active'
  },
  { immediate: true },
)

const wordName = (clue: PublicClue): string =>
  classic.value
    ? clueTag(clue, true)
    : `${clue.number} ${directionLabel(clue.direction).toLowerCase()}`

/** Soumet chaque mot nouvellement complet (et pas encore validé) : course au mot. */
async function submitCompletedWords(): Promise<void> {
  const target = game.value
  if (!target || !isActive.value) return
  for (const clue of target.puzzle.clues) {
    const key = matchWordKey(clue.direction, clue.number)
    if (solvedKeys.value.has(key)) continue
    const letters = slotCells(clue).map((cell) => target.letterAt(cell))
    if (letters.some((letter) => letter === null)) {
      attempts.delete(key)
      continue
    }
    const answer = letters.join('')
    if (attempts.get(key) === answer) continue
    attempts.set(key, answer)
    const correct = await match.submitWord(clue.direction, clue.number, answer)
    if (correct === true) notice.value = `Mot trouvé : ${wordName(clue)}.`
    else if (correct === false) {
      notice.value = `${wordName(clue)} : ce n’est pas le bon mot.`
      // Le mot reste modifiable : seules ses cases non validées sont marquées fausses.
      target.applyChecks(
        slotCells(clue)
          .filter((cell) => !target.marks.has(`${cell.row}:${cell.col}`))
          .map((cell) => ({ ...cell, result: 'incorrect' as const })),
      )
    } else {
      // Action refusée (hors ligne…) : on pourra la retenter avec les mêmes lettres.
      attempts.delete(key)
    }
  }
}

watch(
  () => game.value?.editCount,
  () => {
    // Une case déjà validée par le serveur ne se modifie pas : on la rétablit aussitôt.
    if (game.value && current.value) applySolved(game.value, current.value.me.solvedWords)
    void submitCompletedWords()
  },
)

function onSelectClue(clue: PublicClue): void {
  game.value?.selectClue(clue)
  gridRef.value?.focus()
}

const gridLabel = computed(() =>
  current.value?.puzzle
    ? `Grille du duel, ${current.value.puzzle.width} colonnes sur ${current.value.puzzle.height} lignes. Chaque mot complet est envoyé automatiquement. Flèches pour se déplacer, Tab pour changer de mot, Espace pour changer de sens, Échap pour quitter la grille.`
    : 'Grille du duel',
)

// --- Annonces et classement --------------------------------------------------------

watch(
  () => opponent.value?.solvedCount,
  (count, previous) => {
    if (count === undefined || previous === undefined || count === previous) return
    const name = opponent.value?.username ?? 'Votre adversaire'
    announcement.value = `${name} a trouvé ${count} mot(s) sur ${current.value?.totalWords ?? 0}.`
  },
)

watch(
  () => opponent.value?.connected,
  (connected, previous) => {
    if (connected === undefined || previous === undefined || !isActive.value) return
    const name = opponent.value?.username ?? 'Votre adversaire'
    announcement.value = connected ? `${name} est de retour.` : `${name} s’est déconnecté.`
  },
)

watch(remainingMs, (left, previous) => {
  if (left === null || previous === null) return
  if (previous > 60_000 && left <= 60_000) announcement.value = 'Plus qu’une minute.'
  else if (previous > 10_000 && left <= 10_000) announcement.value = 'Dix secondes.'
})

async function fetchRating(): Promise<Rating | null> {
  try {
    return await matchApi.myRating()
  } catch {
    // Information secondaire : un échec ne bloque pas l'écran de résultat.
    return null
  }
}

// Classement mesuré avant puis après un match rapide : le contrat ne fournit pas l'écart.
watch(
  () => current.value?.status,
  async (next) => {
    const live = current.value
    if (live?.mode !== 'quick') return
    if (next === 'active' && ratingBefore.value === null) {
      ratingBefore.value = (await fetchRating())?.rating ?? null
    }
    if (next === 'finished') rating.value = await fetchRating()
  },
  { immediate: true },
)

watch(isOver, async (over, before) => {
  if (!over || before) return
  await nextTick()
  resultRef.value?.focus()
})

const ratingDelta = computed(() =>
  rating.value && ratingBefore.value !== null ? rating.value.rating - ratingBefore.value : null,
)

onMounted(async () => {
  try {
    const wallet = await api.getWallet()
    if (!wallet.eligible) return
    hintCost.value = wallet.rules.duelHintCost
    balance.value = wallet.balance
  } catch {
    // Sans portefeuille, le bouton d'indice reste masqué : le duel continue normalement.
  }
})

/** Lettre de la case active, achetée en Coumba points puis soumise comme une saisie. */
async function onBuyHint(): Promise<void> {
  confirmHint.value = false
  const target = game.value
  const cell = target?.active
  if (!target || !cell) return
  const result = await match.buyHint({ row: cell.row, col: cell.col })
  if (!result) return
  balance.value = result.balance
  target.applyRevealed([result])
  notice.value = `Lettre révélée. Solde : ${String(result.balance)} Coumba points.`
  void submitCompletedWords()
  gridRef.value?.focus()
}

async function onForfeit(): Promise<void> {
  confirmForfeit.value = false
  await match.forfeit()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <header class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <NuxtLink
        to="/duel"
        class="text-muted hover:text-fg -ml-2 inline-flex min-h-11 items-center rounded-full px-2 text-sm"
      >
        <span aria-hidden="true">←&nbsp;</span>Duel
      </NuxtLink>
      <h1 class="min-w-0 flex-1 truncate text-lg font-extrabold sm:text-xl">
        <template v-if="current?.puzzle">
          {{ current.puzzle.title }}
          <span class="text-muted ml-1 text-sm font-medium">{{
            difficultyLabel(current.puzzle.difficulty)
          }}</span>
        </template>
        <template v-else>Duel</template>
      </h1>
      <button
        v-if="isActive"
        type="button"
        class="border-line hover:bg-surface-2 text-danger inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold"
        :disabled="busy"
        @click="confirmForfeit = true"
      >
        Abandonner
      </button>
    </header>

    <p class="sr-only" aria-live="polite">{{ announcement }}</p>

    <MatchAccountNotice v-if="status === 'account_required'" />

    <div
      v-else-if="status === 'disconnected'"
      role="alert"
      class="bg-danger-soft text-danger rounded-2xl p-4 text-sm"
    >
      Connexion au serveur de jeu interrompue.
      <button type="button" class="ml-2 font-semibold underline" @click="match.connect">
        Se reconnecter
      </button>
    </div>

    <div
      v-else-if="loadState === 'not-found'"
      role="alert"
      class="bg-danger-soft text-danger rounded-2xl p-4 text-sm"
    >
      Ce match est introuvable.
      <NuxtLink to="/duel" class="ml-2 font-semibold underline">Retour au duel</NuxtLink>
    </div>

    <div
      v-else-if="loadState === 'error'"
      role="alert"
      class="bg-danger-soft text-danger rounded-2xl p-4 text-sm"
    >
      {{ loadError }}
      <button type="button" class="ml-2 font-semibold underline" @click="load">Réessayer</button>
    </div>

    <MeyronLoader v-else-if="!current" label="Chargement du match…" />

    <template v-else>
      <p
        v-if="status === 'reconnecting'"
        role="status"
        class="bg-danger-soft text-danger rounded-2xl px-4 py-3 text-sm"
      >
        Connexion perdue, reconnexion en cours… Revenez vite : après 30 secondes d’absence, le match
        est perdu.
      </p>

      <section
        v-if="current.status === 'waiting'"
        aria-labelledby="waiting-title"
        class="bg-surface border-line rounded-2xl border p-5"
      >
        <h2 id="waiting-title" class="text-lg font-bold">En attente de votre ami</h2>
        <p class="text-muted mt-1 mb-4 text-sm">
          Transmettez ce code. Le match commence dès qu’il l’a saisi.
        </p>
        <MatchInviteCode v-if="current.inviteCode" :code="current.inviteCode" />
        <button
          type="button"
          class="text-danger mt-4 min-h-11 text-sm font-semibold underline"
          :disabled="busy"
          @click="match.forfeit"
        >
          Annuler l’invitation
        </button>
      </section>

      <MatchResult
        v-if="isOver"
        ref="resultRef"
        :state="current"
        :outcome="outcome"
        :rating="rating"
        :rating-delta="ratingDelta"
      />

      <div
        v-if="game"
        class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] lg:items-start"
      >
        <div class="flex min-w-0 flex-col gap-3">
          <MatchScoreboard
            :me="me"
            :opponent="opponent"
            :total-words="current.totalWords"
            :remaining-ms="remainingMs"
            :opponent-grace-ms="opponentGraceMs"
          />

          <p
            v-if="game.activeClue"
            class="bg-surface border-line rounded-2xl border px-3 py-2 text-sm leading-snug sm:text-base"
          >
            <span class="text-accent mr-2 font-extrabold">
              {{ clueTag(game.activeClue, classic) }}
            </span>
            {{ game.activeClue.text }}
          </p>

          <CrosswordGrid ref="gridRef" :game="game" :label="gridLabel" :classic="classic" />

          <p role="status" aria-live="polite" class="min-h-5 text-center text-sm">
            <span v-if="error" class="text-danger">{{ error }}</span>
            <span v-else-if="notice">{{ notice }}</span>
          </p>

          <div v-if="isActive && hintCost !== null" class="flex items-center justify-center gap-3">
            <button
              type="button"
              class="border-line hover:bg-surface-2 inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold"
              :disabled="busy || !game.active"
              @click="confirmHint = true"
            >
              Révéler la lettre · {{ hintCost }} pts
            </button>
            <span class="text-muted text-xs tabular-nums">{{ balance }} Coumba points</span>
          </div>
        </div>

        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <ClueList :game="game" direction="across" :classic="classic" @select="onSelectClue" />
          <ClueList :game="game" direction="down" :classic="classic" @select="onSelectClue" />
        </div>
      </div>
    </template>

    <ConfirmDialog
      :open="confirmHint"
      :title="`Utiliser ${hintCost ?? 0} Coumba points ?`"
      :confirm-label="`Payer ${hintCost ?? 0} points`"
      @confirm="onBuyHint"
      @cancel="confirmHint = false"
    >
      La lettre de la case sélectionnée vous sera révélée, à vous seul. Solde actuel :
      {{ balance ?? 0 }} points.
    </ConfirmDialog>

    <ConfirmDialog
      :open="confirmForfeit"
      title="Abandonner le duel ?"
      confirm-label="Abandonner"
      cancel-label="Continuer à jouer"
      @confirm="onForfeit"
      @cancel="confirmForfeit = false"
    >
      Votre adversaire remportera le match
      <template v-if="current?.mode === 'quick'">et votre classement baissera</template>. Cette
      action est définitive.
    </ConfirmDialog>
  </div>
</template>
