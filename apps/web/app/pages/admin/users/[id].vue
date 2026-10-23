<script setup lang="ts">
import type { AdminUserDetail, JourneyEvent } from '@crossverse/contracts'
import { adminApi } from '~/services/admin'
import { errorMessage } from '~/services/api'
import { formatDateTime, formatDuration } from '~/utils/labels'

useHead({ title: 'Parcours joueur — Administration Crossverse' })

const route = useRoute()
const { check } = useAdmin()
const detail = ref<AdminUserDetail | null>(null)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)

async function onChanged(message: string): Promise<void> {
  await load()
  notice.value = message
}

async function load(): Promise<void> {
  error.value = null
  try {
    if (await check()) detail.value = await adminApi.getUser(String(route.params['id']))
  } catch (cause) {
    error.value = errorMessage(cause)
  }
}
onMounted(load)

const RESULTS = { win: 'victoire', loss: 'défaite', draw: 'égalité' } as const

function describe(event: JourneyEvent): string {
  switch (event.type) {
    case 'account_created':
      return 'Compte créé (première visite)'
    case 'email_verified':
      return 'Adresse e-mail confirmée'
    case 'play_started':
      return `A commencé « ${event.puzzleTitle} »`
    case 'play_completed': {
      const parts = [
        event.score === null ? null : `${event.score} points`,
        event.durationMs === null ? null : formatDuration(event.durationMs),
        event.hintsUsed > 0 ? `${event.hintsUsed} aide(s)` : 'sans aide',
      ].filter(Boolean)
      return `A terminé « ${event.puzzleTitle} » (${parts.join(', ')})`
    }
    case 'match_finished':
      return `Duel ${event.mode === 'quick' ? 'rapide' : 'privé'}${event.opponent ? ` contre ${event.opponent}` : ''} : ${event.result ? RESULTS[event.result] : 'annulé'}`
    case 'achievement':
      return `Succès obtenu : ${event.code}`
  }
}

const stats = computed(() => {
  const s = detail.value?.stats
  if (!s) return []
  return [
    { label: 'Grilles terminées', value: `${s.playsCompleted} / ${s.playsStarted}` },
    { label: 'Meilleur score', value: s.bestScore ?? '—' },
    { label: 'Temps de jeu', value: formatDuration(s.totalPlayMs) },
    { label: 'Aides utilisées', value: s.hintsUsed },
    { label: 'Favoris', value: s.favorites },
    { label: 'Succès', value: s.achievements },
    { label: 'Sessions ouvertes', value: s.activeSessions },
    {
      label: 'Elo',
      value: s.rating
        ? `${s.rating.rating} (${s.rating.wins} V · ${s.rating.losses} D · ${s.rating.draws} N)`
        : '—',
    },
  ]
})
</script>

<template>
  <AdminShell :title="detail?.user.username ?? 'Parcours joueur'">
    <div v-if="error" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4 text-sm">
      {{ error }}
    </div>
    <p v-else-if="!detail" role="status" class="text-muted">Chargement…</p>
    <template v-else>
      <section class="bg-surface border-line rounded-2xl border p-4 text-sm">
        <p>
          <strong>{{ detail.user.email ?? 'Invité, sans e-mail' }}</strong>
          <span v-if="detail.user.role === 'admin'"> · administrateur</span>
          <span v-if="detail.user.suspended" class="text-danger font-semibold"> · suspendu</span>
        </p>
        <p class="text-muted">
          {{ detail.user.emailVerified ? 'E-mail confirmé' : 'E-mail non confirmé' }} · créé le
          {{ formatDateTime(detail.user.createdAt) }} · vu
          {{ detail.user.lastSeenAt ? formatDateTime(detail.user.lastSeenAt) : 'jamais' }}
        </p>
        <p class="text-muted mt-1 text-xs">
          Consultation enregistrée dans le journal d'administration.
        </p>
      </section>

      <p v-if="notice" role="status" class="text-success text-sm font-semibold">{{ notice }}</p>
      <AdminUserActions :detail="detail" @changed="onChanged" />

      <ul class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li
          v-for="stat in stats"
          :key="stat.label"
          class="bg-surface border-line flex flex-col rounded-2xl border p-4"
        >
          <span class="text-muted text-sm font-semibold">{{ stat.label }}</span>
          <span class="text-lg font-extrabold tabular-nums">{{ stat.value }}</span>
        </li>
      </ul>

      <section aria-labelledby="journey-title" class="flex flex-col gap-3">
        <h2 id="journey-title" class="text-xl font-bold">Parcours</h2>
        <ol class="border-line ml-2 flex flex-col gap-3 border-l-2 pl-4">
          <li v-for="(event, index) in detail.journey" :key="index">
            <p class="text-muted text-xs">{{ formatDateTime(event.at) }}</p>
            <p>{{ describe(event) }}</p>
          </li>
        </ol>
      </section>
    </template>
  </AdminShell>
</template>
