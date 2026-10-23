<script setup lang="ts">
import type { AdminUserSummary } from '@crossverse/contracts'
import { adminApi } from '~/services/admin'
import { errorMessage } from '~/services/api'
import { formatDateTime } from '~/utils/labels'

useHead({ title: 'Joueurs — Administration Crossverse' })

const { check } = useAdmin()
const search = ref('')
const guests = ref(false)
const suspended = ref(false)
const items = ref<AdminUserSummary[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function fetchPage(reset: boolean): Promise<void> {
  loading.value = true
  error.value = null
  try {
    if (!(await check())) return
    const page = await adminApi.listUsers({
      search: search.value.trim(),
      guests: guests.value,
      suspended: suspended.value,
      ...(reset || nextCursor.value === null ? {} : { cursor: nextCursor.value }),
    })
    items.value = reset ? page.items : [...items.value, ...page.items]
    nextCursor.value = page.nextCursor
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}
onMounted(() => fetchPage(true))
</script>

<template>
  <AdminShell title="Joueurs">
    <form role="search" class="flex flex-wrap items-end gap-3" @submit.prevent="fetchPage(true)">
      <div class="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-sm">
        <label for="user-search" class="text-sm font-semibold">Pseudo ou e-mail (début)</label>
        <input
          id="user-search"
          v-model="search"
          type="search"
          maxlength="64"
          autocomplete="off"
          class="bg-surface border-line min-h-11 rounded-xl border px-4"
        />
      </div>
      <label class="flex min-h-11 items-center gap-2 text-sm">
        <input v-model="guests" type="checkbox" class="size-5" />
        Inclure les invités
      </label>
      <label class="flex min-h-11 items-center gap-2 text-sm">
        <input v-model="suspended" type="checkbox" class="size-5" />
        Suspendus seulement
      </label>
      <button type="submit" class="bg-fg text-bg min-h-11 rounded-full px-5 text-sm font-semibold">
        Rechercher
      </button>
      <NuxtLink
        to="/admin/users/new"
        class="border-line hover:bg-surface-2 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold sm:ml-auto"
        >Créer un compte</NuxtLink
      >
    </form>

    <div v-if="error" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4 text-sm">
      {{ error }}
    </div>

    <ul
      v-if="items.length > 0"
      class="divide-line bg-surface border-line divide-y rounded-2xl border"
    >
      <li v-for="user in items" :key="user.id">
        <NuxtLink
          :to="`/admin/users/${user.id}`"
          class="hover:bg-surface-2 flex flex-wrap items-center gap-x-4 gap-y-1 p-4"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate font-bold">
              {{ user.username ?? 'Invité' }}
              <span
                v-if="user.role === 'admin'"
                class="bg-accent-soft ml-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                >admin</span
              >
              <span
                v-if="user.suspended"
                class="bg-danger-soft text-danger ml-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                >suspendu</span
              >
            </span>
            <span class="text-muted block truncate text-sm">{{ user.email ?? user.id }}</span>
          </span>
          <span class="text-muted text-sm">
            {{ user.playsCompleted }} grilles · {{ user.matchesPlayed }} duels
            <template v-if="user.rating !== null"> · Elo {{ user.rating }}</template>
            <br />
            Vu {{ user.lastSeenAt ? formatDateTime(user.lastSeenAt) : 'jamais' }}
          </span>
        </NuxtLink>
      </li>
    </ul>
    <p v-else-if="!loading && !error" class="text-muted">Aucun joueur trouvé.</p>
    <p v-if="loading" role="status" class="text-muted">Chargement…</p>
    <button
      v-if="nextCursor && !loading"
      type="button"
      class="border-line bg-surface hover:border-accent mx-auto min-h-11 rounded-full border px-6 font-semibold"
      @click="fetchPage(false)"
    >
      Afficher plus
    </button>
  </AdminShell>
</template>
