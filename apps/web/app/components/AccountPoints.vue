<script setup lang="ts">
import type { PointReason, PointTransactionPage, WalletDto } from '@crossverse/contracts'
import { api, errorMessage } from '~/services/api'
import { formatDateTime } from '~/utils/labels'

/** Solde et journal des Coumba points (lecture seule : seul le serveur crédite et débite). */
const wallet = ref<WalletDto | null>(null)
const items = ref<PointTransactionPage['items']>([])
const nextCursor = ref<string | null>(null)
const error = ref<string | null>(null)
const loadingMore = ref(false)

const REASON_LABELS: Record<PointReason, string> = {
  welcome: 'Bienvenue',
  puzzle_completed: 'Grille réussie',
  no_hint_bonus: 'Bonus sans indice',
  path_step: 'Étape de parcours',
  path_completed: 'Parcours terminé',
  daily_challenge: 'Défi du jour',
  match_result: 'Duel',
  hint_purchase: 'Indice acheté',
}

async function load(): Promise<void> {
  error.value = null
  try {
    wallet.value = await api.getWallet()
    if (!wallet.value.eligible) return
    const page = await api.getWalletTransactions()
    items.value = page.items
    nextCursor.value = page.nextCursor
  } catch (cause) {
    error.value = errorMessage(cause)
  }
}

async function more(): Promise<void> {
  if (nextCursor.value === null) return
  loadingMore.value = true
  try {
    const page = await api.getWalletTransactions(nextCursor.value)
    items.value = [...items.value, ...page.items]
    nextCursor.value = page.nextCursor
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loadingMore.value = false
  }
}

onMounted(load)
</script>

<template>
  <section v-if="wallet?.eligible || error" aria-labelledby="points-title">
    <h2 id="points-title" class="mb-1 text-xl font-bold">Coumba points</h2>
    <div v-if="error" role="alert" class="bg-danger-soft text-danger rounded-xl p-3 text-sm">
      {{ error }}
    </div>
    <template v-if="wallet?.eligible">
      <p class="text-muted mb-3 text-sm">
        Solde <strong class="text-fg text-lg tabular-nums">{{ wallet.balance }}</strong> · gagnés
        {{ wallet.earned }} · dépensés {{ wallet.spent }}.
        {{ wallet.rules.freeHintsPerGame }} indices gratuits par partie, puis
        {{ wallet.rules.hintCost.letter }} points la lettre et {{ wallet.rules.hintCost.word }} le
        mot.
      </p>
      <ul
        v-if="items.length > 0"
        class="divide-line bg-surface border-line divide-y rounded-2xl border"
      >
        <li v-for="item in items" :key="item.id" class="flex items-center gap-3 px-4 py-3">
          <div class="min-w-0 flex-1">
            <p class="font-semibold">{{ REASON_LABELS[item.reason] }}</p>
            <p class="text-muted text-xs">{{ formatDateTime(item.createdAt) }}</p>
          </div>
          <span
            class="font-extrabold tabular-nums"
            :class="item.amount > 0 ? 'text-accent' : 'text-danger'"
            >{{ item.amount > 0 ? '+' : '−' }}{{ Math.abs(item.amount) }}</span
          >
        </li>
      </ul>
      <button
        v-if="nextCursor"
        type="button"
        class="border-line hover:bg-surface-2 mt-3 min-h-11 rounded-full border px-4 text-sm font-semibold"
        :disabled="loadingMore"
        @click="more"
      >
        Voir plus
      </button>
    </template>
  </section>
</template>
