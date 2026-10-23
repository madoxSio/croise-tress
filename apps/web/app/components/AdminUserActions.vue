<script setup lang="ts">
/**
 * Actions d'un administrateur sur un compte : suspendre (motif facultatif), réactiver, fermer
 * les sessions. Le serveur refuse ces actions sur soi-même, un administrateur ou un invité ;
 * le panneau ne s'affiche donc que pour un compte joueur.
 */
import type { AdminUserDetail } from '@crossverse/contracts'
import { adminApi } from '~/services/admin'
import { formatDateTime } from '~/utils/labels'

const props = defineProps<{ detail: AdminUserDetail }>()
const emit = defineEmits<{ changed: [message: string] }>()

type Pending = 'suspend' | 'revoke' | null
const confirming = ref<Pending>(null)
const reason = ref('')
const action = useFormAction()

const user = computed(() => props.detail.user)
const manageable = computed(() => user.value.role === 'player' && !user.value.isGuest)

async function run(task: () => Promise<void>, message: string): Promise<void> {
  confirming.value = null
  const ok = await action.run(task)
  if (ok) emit('changed', message)
}

const suspend = () =>
  run(
    () => adminApi.suspendUser(user.value.id, reason.value.trim() || undefined),
    'Compte suspendu : ses sessions sont fermées.',
  )
const reactivate = () => run(() => adminApi.reactivateUser(user.value.id), 'Compte réactivé.')
const revoke = () =>
  run(() => adminApi.revokeUserSessions(user.value.id), 'Toutes ses sessions sont fermées.')
</script>

<template>
  <section
    v-if="manageable"
    aria-labelledby="actions-title"
    class="bg-surface border-line flex flex-col gap-3 rounded-2xl border p-4"
  >
    <h2 id="actions-title" class="text-lg font-bold">Gestion du compte</h2>
    <p
      v-if="detail.suspension"
      class="bg-danger-soft text-danger rounded-xl p-3 text-sm font-medium"
    >
      Suspendu depuis le {{ formatDateTime(detail.suspension.at) }}
      <template v-if="detail.suspension.reason"> : {{ detail.suspension.reason }}</template>
    </p>
    <div v-else class="flex flex-col gap-1 sm:max-w-md">
      <label for="suspend-reason" class="text-sm font-semibold">Motif (facultatif, interne)</label>
      <input
        id="suspend-reason"
        v-model="reason"
        maxlength="200"
        class="bg-surface border-line min-h-11 rounded-xl border px-4"
      />
    </div>
    <div class="flex flex-wrap gap-2 text-sm font-semibold">
      <button
        v-if="detail.suspension"
        type="button"
        class="bg-fg text-bg min-h-11 rounded-full px-5 disabled:opacity-60"
        :disabled="action.pending.value"
        @click="reactivate"
      >
        Réactiver le compte
      </button>
      <button
        v-else
        type="button"
        class="border-danger text-danger min-h-11 rounded-full border px-5 disabled:opacity-60"
        :disabled="action.pending.value"
        @click="confirming = 'suspend'"
      >
        Suspendre le compte
      </button>
      <button
        type="button"
        class="border-line hover:bg-surface-2 min-h-11 rounded-full border px-5 disabled:opacity-60"
        :disabled="action.pending.value"
        @click="confirming = 'revoke'"
      >
        Fermer ses sessions ({{ detail.stats.activeSessions }})
      </button>
    </div>
    <p
      v-if="action.error.value"
      role="alert"
      class="bg-danger-soft text-danger rounded-xl p-3 text-sm"
    >
      {{ action.error.value }}
    </p>

    <ConfirmDialog
      :open="confirming === 'suspend'"
      :title="`Suspendre ${user.username ?? 'ce compte'} ?`"
      confirm-label="Suspendre"
      @confirm="suspend"
      @cancel="confirming = null"
    >
      Ses sessions sont fermées tout de suite et il ne peut plus se connecter ni jouer en duel
      jusqu'à la réactivation. Ses données sont conservées.
    </ConfirmDialog>
    <ConfirmDialog
      :open="confirming === 'revoke'"
      title="Fermer toutes ses sessions ?"
      confirm-label="Fermer les sessions"
      @confirm="revoke"
      @cancel="confirming = null"
    >
      Il sera déconnecté de tous ses appareils et devra se reconnecter avec son mot de passe.
    </ConfirmDialog>
  </section>
</template>
