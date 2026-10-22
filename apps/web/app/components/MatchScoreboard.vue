<script setup lang="ts">
/**
 * Scores du duel (mots trouvés, chiffres officiels du serveur), temps restant et présence
 * de l'adversaire. Les changements notables sont annoncés par une région `aria-live`
 * distincte, pour ne pas relire tout le tableau à chaque seconde.
 */
import type { Participant } from '~/composables/useMatch'
import { formatClock, formatDuration } from '~/utils/labels'

const props = defineProps<{
  me: Participant | undefined
  opponent: Participant | undefined
  totalWords: number
  remainingMs: number | null
  opponentGraceMs: number | null
}>()

const opponentName = computed(() => props.opponent?.username ?? 'Adversaire')
const percent = (count: number): number =>
  props.totalWords === 0 ? 0 : Math.round((count / props.totalWords) * 100)

const rows = computed(() => [
  { key: 'me', label: 'Vous', count: props.me?.solvedCount ?? 0, accent: true },
  {
    key: 'opponent',
    label: opponentName.value,
    count: props.opponent?.solvedCount ?? 0,
    accent: false,
  },
])

const urgent = computed(() => props.remainingMs !== null && props.remainingMs <= 60_000)
</script>

<template>
  <section aria-label="Scores du duel" class="bg-surface border-line rounded-2xl border p-4">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-muted text-xs font-semibold tracking-wider uppercase">Mots trouvés</h2>
      <p
        v-if="remainingMs !== null"
        class="text-lg font-extrabold tabular-nums"
        :class="urgent ? 'text-danger' : ''"
        :aria-label="`Temps restant ${formatDuration(remainingMs)}`"
      >
        {{ formatClock(remainingMs) }}
      </p>
    </div>
    <ul class="mt-3 space-y-3">
      <li v-for="row in rows" :key="row.key">
        <div class="flex items-baseline justify-between gap-2 text-sm">
          <span class="min-w-0 truncate font-semibold">
            {{ row.label }}
            <span
              v-if="row.key === 'opponent' && opponent && !opponent.connected"
              class="text-danger ml-1 text-xs font-medium"
              >déconnecté</span
            >
          </span>
          <span class="font-bold tabular-nums">{{ row.count }} / {{ totalWords }}</span>
        </div>
        <div
          class="bg-surface-2 mt-1 h-2 overflow-hidden rounded-full"
          role="progressbar"
          :aria-label="`${row.label} : ${row.count} mots sur ${totalWords}`"
          :aria-valuenow="row.count"
          aria-valuemin="0"
          :aria-valuemax="totalWords"
        >
          <div
            class="h-full rounded-full transition-[width] duration-300"
            :class="row.accent ? 'bg-accent' : 'bg-fg'"
            :style="{ width: `${percent(row.count)}%` }"
          ></div>
        </div>
      </li>
    </ul>
    <p v-if="opponentGraceMs !== null" class="text-muted mt-3 text-xs">
      {{ opponentName }} s’est déconnecté. Sans retour dans environ
      {{ Math.ceil(opponentGraceMs / 1000) }} s, vous gagnez par forfait (décision du serveur).
    </p>
  </section>
</template>
