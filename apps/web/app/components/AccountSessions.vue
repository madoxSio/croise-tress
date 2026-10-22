<script setup lang="ts">
import type { SessionInfo } from '@crossverse/contracts'
import { api, errorMessage } from '~/services/api'
import { formatDateTime } from '~/utils/labels'

/** Sessions ouvertes du compte, avec révocation (le serveur vérifie la propriété). */
const sessions = ref<SessionInfo[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const busy = ref(false)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    sessions.value = (await api.listSessions()).items
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}

async function act(action: () => Promise<void>, done: string): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  notice.value = null
  try {
    await action()
    notice.value = done
    await load()
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}

const revoke = (id: string): Promise<void> => act(() => api.revokeSession(id), 'Session fermée.')
const revokeOthers = (): Promise<void> =>
  act(() => api.revokeOtherSessions(), 'Les autres sessions ont été fermées.')

const others = computed(() => sessions.value.filter((session) => !session.current))

onMounted(load)
defineExpose({ load })
</script>

<template>
  <section aria-labelledby="sessions-title" class="flex flex-col gap-3">
    <h2 id="sessions-title" class="text-xl font-bold">Sessions actives</h2>
    <p role="status" class="text-success text-sm">{{ notice }}</p>
    <div v-if="error" role="alert" class="bg-danger-soft text-danger rounded-xl p-3 text-sm">
      {{ error }}
    </div>
    <p v-if="loading && sessions.length === 0" class="text-muted">Chargement…</p>
    <ul v-else class="divide-line bg-surface border-line divide-y rounded-2xl border">
      <li v-for="session in sessions" :key="session.id" class="flex items-center gap-3 p-4">
        <div class="min-w-0 flex-1">
          <p class="font-semibold">
            {{ session.current ? 'Cet appareil' : 'Autre appareil' }}
            <span
              v-if="session.current"
              class="bg-accent-soft ml-1 rounded-full px-2 py-0.5 text-xs"
              >Session actuelle</span
            >
          </p>
          <p class="text-muted text-sm">
            Ouverte le {{ formatDateTime(session.createdAt) }} · dernière activité le
            {{ formatDateTime(session.lastSeenAt) }}
          </p>
        </div>
        <button
          v-if="!session.current"
          type="button"
          class="border-line hover:bg-surface-2 min-h-11 rounded-full border px-4 text-sm font-semibold disabled:opacity-60"
          :disabled="busy"
          @click="revoke(session.id)"
        >
          Fermer<span class="sr-only">
            la session ouverte le {{ formatDateTime(session.createdAt) }}</span
          >
        </button>
      </li>
    </ul>
    <button
      v-if="others.length > 0"
      type="button"
      class="border-line hover:bg-surface-2 min-h-11 self-start rounded-full border px-5 text-sm font-semibold disabled:opacity-60"
      :disabled="busy"
      @click="revokeOthers"
    >
      Fermer toutes les autres sessions
    </button>
  </section>
</template>
