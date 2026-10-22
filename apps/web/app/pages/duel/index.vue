<script setup lang="ts">
/**
 * Accueil du duel : partie rapide (file d'attente), invitation privée par code, et
 * historique des derniers duels. Dès que le serveur annonce un match en cours (appariement,
 * invitation acceptée, ou match déjà commencé avant un rechargement), on rejoint sa page.
 */
import type { MatchHistory } from '~/services/match'
import { matchApi } from '~/services/match'
import { errorMessage } from '~/services/api'
import { formatDateTime } from '~/utils/labels'

useHead({ title: 'Duel — Crossverse' })

const match = useMatch()
const { status, state, queue, busy, error } = match

const code = ref('')
const history = ref<MatchHistory | null>(null)
const historyError = ref<string | null>(null)

/** Invitation créée par ce joueur et pas encore acceptée. */
const pendingInvite = computed(() =>
  state.value?.status === 'waiting' && state.value.inviteCode !== null ? state.value : null,
)

watch(
  () => state.value,
  async (current) => {
    if (current?.status === 'active') await navigateTo(`/duel/${current.id}`)
  },
  { immediate: true },
)

async function loadHistory(): Promise<void> {
  historyError.value = null
  try {
    history.value = await matchApi.myMatches(10)
  } catch (cause) {
    historyError.value = errorMessage(cause)
  }
}

// L'historique n'a de sens que pour un compte confirmé : on attend que la connexion l'atteste.
watch(
  status,
  (current) => {
    if (current === 'connected' && history.value === null) void loadHistory()
  },
  { immediate: true },
)

async function onAccept(): Promise<void> {
  const accepted = await match.acceptInvite(code.value)
  if (accepted) await navigateTo(`/duel/${accepted.id}`)
}

const statusMessage = computed(() => {
  switch (status.value) {
    case 'idle':
    case 'connecting':
      return 'Connexion au serveur de jeu…'
    case 'reconnecting':
      return 'Connexion perdue, nouvelle tentative…'
    default:
      return ''
  }
})

const resultLabels = { win: 'Victoire', loss: 'Défaite', draw: 'Égalité' } as const
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6">
    <div class="flex flex-wrap items-end gap-3">
      <h1 class="flex-1 text-3xl font-extrabold tracking-tight">Duel</h1>
      <NuxtLink to="/leaderboard" class="text-accent min-h-11 py-2 text-sm font-semibold underline"
        >Voir le classement</NuxtLink
      >
    </div>
    <p class="text-muted -mt-4 text-sm leading-relaxed">
      Même grille pour vous deux, quinze minutes : chaque mot est validé par le serveur dès que vous
      l’avez rempli. Le premier à tout trouver gagne.
    </p>

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

    <template v-else>
      <p role="status" class="text-muted min-h-5 text-sm">{{ statusMessage }}</p>

      <p v-if="error" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4 text-sm">
        {{ error }}
      </p>

      <section
        aria-labelledby="quick-title"
        class="bg-accent text-accent-fg rounded-3xl p-6 sm:p-8"
      >
        <h2 id="quick-title" class="text-xl font-extrabold">Partie rapide</h2>
        <p class="mt-1 text-sm opacity-90">
          Affrontez le premier joueur disponible. Le résultat compte pour le classement.
        </p>
        <div aria-live="polite" class="mt-5 flex flex-wrap items-center gap-3">
          <template v-if="queue === 'queued'">
            <span class="flex items-center gap-2 font-semibold">
              <span
                aria-hidden="true"
                class="bg-accent-fg size-2 animate-pulse rounded-full"
              ></span>
              Recherche d’un adversaire…
            </span>
            <button
              type="button"
              class="border-accent-fg inline-flex min-h-11 items-center rounded-full border px-5 font-semibold"
              @click="match.leaveQueue"
            >
              Annuler
            </button>
          </template>
          <button
            v-else
            type="button"
            class="bg-accent-fg text-accent inline-flex min-h-11 items-center rounded-full px-6 font-bold disabled:opacity-60"
            :disabled="status !== 'connected' || busy || pendingInvite !== null"
            @click="match.joinQueue"
          >
            {{ queue === 'joining' ? 'Recherche…' : 'Trouver un adversaire' }}
          </button>
        </div>
      </section>

      <section aria-labelledby="invite-title" class="bg-surface border-line rounded-2xl border p-5">
        <h2 id="invite-title" class="text-lg font-bold">Défier un ami</h2>
        <template v-if="pendingInvite?.inviteCode">
          <p class="text-muted mt-1 mb-4 text-sm">
            Transmettez ce code à votre ami. Le match commence dès qu’il l’a saisi.
          </p>
          <MatchInviteCode :code="pendingInvite.inviteCode" />
          <p role="status" class="text-muted mt-4 text-sm">En attente de votre ami…</p>
          <button
            type="button"
            class="text-danger mt-2 min-h-11 text-sm font-semibold underline"
            :disabled="busy"
            @click="match.forfeit"
          >
            Annuler l’invitation
          </button>
        </template>
        <template v-else>
          <p class="text-muted mt-1 text-sm">
            Créez un code à partager. Un match entre amis ne compte pas pour le classement.
          </p>
          <button
            type="button"
            class="bg-fg text-bg mt-4 inline-flex min-h-11 items-center rounded-full px-5 font-semibold disabled:opacity-60"
            :disabled="status !== 'connected' || busy || queue !== 'idle'"
            @click="match.createInvite"
          >
            Créer une invitation
          </button>
        </template>
      </section>

      <section
        v-if="!pendingInvite"
        aria-labelledby="join-title"
        class="bg-surface border-line rounded-2xl border p-5"
      >
        <h2 id="join-title" class="text-lg font-bold">Rejoindre avec un code</h2>
        <form class="mt-3 flex flex-wrap items-end gap-3" @submit.prevent="onAccept">
          <div class="flex flex-col gap-1">
            <label for="invite-code" class="text-sm font-medium">Code reçu (6 caractères)</label>
            <input
              id="invite-code"
              v-model="code"
              type="text"
              inputmode="text"
              autocapitalize="characters"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              maxlength="9"
              class="border-line bg-bg min-h-11 w-44 rounded-xl border px-3 font-mono text-lg tracking-widest uppercase"
            />
          </div>
          <button
            type="submit"
            class="bg-fg text-bg inline-flex min-h-11 items-center rounded-full px-5 font-semibold disabled:opacity-60"
            :disabled="status !== 'connected' || busy || queue !== 'idle' || code.trim() === ''"
          >
            Rejoindre
          </button>
        </form>
      </section>

      <section v-if="status === 'connected'" aria-labelledby="recent-title">
        <h2 id="recent-title" class="mb-3 text-lg font-bold">Mes derniers duels</h2>
        <p v-if="historyError" role="alert" class="text-danger text-sm">
          {{ historyError }}
          <button type="button" class="ml-2 font-semibold underline" @click="loadHistory">
            Réessayer
          </button>
        </p>
        <p v-else-if="history === null" class="text-muted text-sm">Chargement…</p>
        <p v-else-if="history.items.length === 0" class="text-muted text-sm">
          Aucun duel terminé pour l’instant.
        </p>
        <ul v-else class="divide-line bg-surface border-line divide-y rounded-2xl border">
          <li v-for="item in history.items" :key="item.matchId" class="flex items-center gap-4 p-4">
            <div class="min-w-0 flex-1">
              <p class="truncate font-bold">
                {{ item.opponent ? `contre ${item.opponent}` : 'Adversaire inconnu' }}
              </p>
              <p class="text-muted text-sm">
                {{ item.puzzleTitle }} · {{ item.mode === 'quick' ? 'rapide' : 'entre amis' }}
                <template v-if="item.endedAt"> · {{ formatDateTime(item.endedAt) }}</template>
              </p>
            </div>
            <p class="text-right">
              <span
                class="block font-extrabold"
                :class="
                  item.result === 'win'
                    ? 'text-success'
                    : item.result === 'loss'
                      ? 'text-danger'
                      : ''
                "
                >{{ item.result ? resultLabels[item.result] : '—' }}</span
              >
              <span class="text-muted text-xs">{{ item.solvedCount }} mot(s)</span>
            </p>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
