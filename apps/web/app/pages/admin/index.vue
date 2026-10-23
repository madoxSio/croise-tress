<script setup lang="ts">
import type { AdminOverview } from '@crossverse/contracts'
import { adminApi } from '~/services/admin'
import { errorMessage } from '~/services/api'

useHead({ title: 'Administration — Crossverse' })

const { check } = useAdmin()
const overview = ref<AdminOverview | null>(null)
const error = ref<string | null>(null)

async function load(): Promise<void> {
  error.value = null
  try {
    if (await check()) overview.value = await adminApi.overview()
  } catch (cause) {
    error.value = errorMessage(cause)
  }
}
onMounted(load)

const tiles = computed(() => {
  const o = overview.value
  if (!o) return []
  return [
    { label: 'Comptes', value: o.users.registered, detail: `${o.users.verified} confirmés` },
    { label: 'Nouveaux (7 j)', value: o.users.newLast7Days, detail: 'comptes confirmés' },
    { label: 'Actifs (7 j)', value: o.users.activeLast7Days, detail: 'invités compris' },
    { label: 'Invités', value: o.users.guests, detail: 'sans compte' },
    {
      label: 'Parties terminées',
      value: o.plays.completed,
      detail: `${o.plays.started} commencées`,
    },
    { label: 'Terminées (7 j)', value: o.plays.completedLast7Days, detail: 'parties solo' },
    {
      label: 'Duels',
      value: o.matches.finished,
      detail: `${o.matches.active} en cours, ${o.matches.waiting} en attente`,
    },
    { label: 'Grilles', value: o.puzzles.published, detail: `${o.puzzles.draft} brouillons` },
  ]
})

const days = computed(() => [...(overview.value?.daily ?? [])].reverse())
const maxDaily = computed(() =>
  Math.max(1, ...days.value.map((day) => Math.max(day.registrations, day.completions))),
)
const dayFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const formatDay = (date: string): string => dayFormatter.format(new Date(`${date}T00:00:00Z`))
</script>

<template>
  <AdminShell title="Vue d’ensemble">
    <div v-if="error" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4 text-sm">
      {{ error }}
      <button type="button" class="ml-2 font-semibold underline" @click="load">Réessayer</button>
    </div>
    <p v-else-if="!overview" role="status" class="text-muted">Chargement…</p>
    <template v-else>
      <ul class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li
          v-for="tile in tiles"
          :key="tile.label"
          class="bg-surface border-line flex flex-col rounded-2xl border p-4"
        >
          <span class="text-muted text-sm font-semibold">{{ tile.label }}</span>
          <span class="text-3xl font-extrabold tabular-nums">{{ tile.value }}</span>
          <span class="text-muted text-xs">{{ tile.detail }}</span>
        </li>
      </ul>

      <section aria-labelledby="daily-title" class="bg-surface border-line rounded-2xl border p-4">
        <h2 id="daily-title" class="mb-3 text-lg font-bold">30 derniers jours (UTC)</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-muted text-left">
              <tr>
                <th scope="col" class="py-1 pr-3 font-semibold">Jour</th>
                <th scope="col" class="py-1 pr-3 font-semibold">Inscriptions</th>
                <th scope="col" class="py-1 font-semibold">Parties terminées</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="day in days" :key="day.date" class="border-line border-t">
                <th scope="row" class="py-1 pr-3 font-medium whitespace-nowrap">
                  {{ formatDay(day.date) }}
                </th>
                <td class="py-1 pr-3">
                  <span class="flex items-center gap-2">
                    <span class="w-6 text-right tabular-nums">{{ day.registrations }}</span>
                    <span
                      aria-hidden="true"
                      class="bg-accent h-2 rounded-full"
                      :style="{ width: `${(day.registrations / maxDaily) * 8}rem` }"
                    />
                  </span>
                </td>
                <td class="py-1">
                  <span class="flex items-center gap-2">
                    <span class="w-6 text-right tabular-nums">{{ day.completions }}</span>
                    <span
                      aria-hidden="true"
                      class="bg-success h-2 rounded-full"
                      :style="{ width: `${(day.completions / maxDaily) * 8}rem` }"
                    />
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </AdminShell>
</template>
