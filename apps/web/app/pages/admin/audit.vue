<script setup lang="ts">
import type { AuditList } from '@crossverse/contracts'
import { adminApi } from '~/services/admin'
import { errorMessage } from '~/services/api'
import { formatDateTime } from '~/utils/labels'

useHead({ title: 'Journal — Administration Crossverse' })

const ACTIONS: Record<string, string> = {
  'user.view': 'Consultation d’un parcours joueur',
  'puzzle.create': 'Grille créée',
  'puzzle.update': 'Grille modifiée',
  'puzzle.publish': 'Grille publiée',
  'puzzle.unpublish': 'Grille dépubliée',
  'cli.account.create': 'Compte créé en ligne de commande',
  'cli.role.grant': 'Rôle admin accordé (ligne de commande)',
  'cli.role.revoke': 'Rôle admin retiré (ligne de commande)',
  'user.create': 'Compte créé',
  'user.suspend': 'Compte suspendu',
  'user.reactivate': 'Compte réactivé',
  'user.sessions.revoke': 'Sessions d’un joueur fermées',
}

const { check } = useAdmin()
const items = ref<AuditList['items']>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function fetchPage(reset: boolean): Promise<void> {
  loading.value = true
  error.value = null
  try {
    if (!(await check())) return
    const page = await adminApi.auditLog(reset ? undefined : (nextCursor.value ?? undefined))
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
  <AdminShell title="Journal d’administration">
    <div v-if="error" role="alert" class="bg-danger-soft text-danger rounded-2xl p-4 text-sm">
      {{ error }}
    </div>
    <ul
      v-if="items.length > 0"
      class="divide-line bg-surface border-line divide-y rounded-2xl border text-sm"
    >
      <li v-for="entry in items" :key="entry.id" class="flex flex-wrap gap-x-4 p-3">
        <span class="text-muted w-40 shrink-0">{{ formatDateTime(entry.createdAt) }}</span>
        <span class="min-w-0 flex-1">
          {{ ACTIONS[entry.action] ?? entry.action }}
          <span class="text-muted break-all">{{ entry.target }}</span>
        </span>
        <span class="font-semibold">{{ entry.actor ?? 'serveur' }}</span>
      </li>
    </ul>
    <p v-else-if="!loading && !error" class="text-muted">Aucune action enregistrée.</p>
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
