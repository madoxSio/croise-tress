<script setup lang="ts">
import { PASSWORD_MAX } from '@crossverse/contracts'
import { api } from '~/services/api'
import { requiredPasswordError } from '~/utils/validation'

useHead({ title: 'Mon compte — Crossverse' })

const { user, status, isGuest, ensure, apply: applySession } = useSession()

const admin = useAdmin()
onMounted(async () => {
  if (await ensure()) await admin.check(true)
})

const sessionsPanel = ref<{ load: () => Promise<void> } | null>(null)

// --- Déconnexion ---
const logoutAction = useFormAction()

async function logout(): Promise<void> {
  const ok = await logoutAction.run(async () => {
    applySession(await api.logout())
    admin.reset()
  })
  if (ok) await navigateTo('/')
}

// --- Suppression du compte : mot de passe saisi d'abord, puis confirmation explicite. ---
const deleteAction = useFormAction()
const deletePassword = ref('')
const deleteFieldError = ref<string | null>(null)
const deleteField = ref<{ focus: () => void } | null>(null)
const confirmingDelete = ref(false)

function askDelete(): void {
  deleteFieldError.value = requiredPasswordError(deletePassword.value)
  if (deleteFieldError.value) return deleteField.value?.focus()
  confirmingDelete.value = true
}

async function confirmDelete(): Promise<void> {
  confirmingDelete.value = false
  const ok = await deleteAction.run(async () => {
    applySession(await api.deleteAccount(deletePassword.value))
    admin.reset()
  })
  deletePassword.value = ''
  if (ok) await navigateTo('/')
  else deleteField.value?.focus()
}
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-10">
    <h1 class="text-3xl font-extrabold tracking-tight">Mon compte</h1>

    <MeyronLoader v-if="status !== 'ready'" />

    <section
      v-else-if="isGuest"
      aria-labelledby="guest-title"
      class="bg-surface border-line rounded-2xl border p-5"
    >
      <h2 id="guest-title" class="text-lg font-bold">Vous jouez en invité</h2>
      <p class="text-muted mt-1">
        Créez un compte pour retrouver vos parties sur tous vos appareils, ou connectez-vous.
      </p>
      <div class="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
        <NuxtLink
          to="/register"
          class="bg-accent text-accent-fg shadow-cta inline-flex min-h-11 items-center rounded-full px-4"
          >Créer un compte</NuxtLink
        >
        <NuxtLink
          to="/login"
          class="border-line inline-flex min-h-11 items-center rounded-full border px-4"
          >Se connecter</NuxtLink
        >
      </div>
    </section>

    <template v-else>
      <section
        aria-labelledby="profile-title"
        class="bg-surface border-line flex flex-wrap items-center gap-4 rounded-2xl border p-5"
      >
        <div class="min-w-0 flex-1">
          <h2 id="profile-title" class="text-muted text-sm font-semibold">Profil</h2>
          <p class="truncate text-2xl font-extrabold">{{ user?.username }}</p>
          <p v-if="user?.email" class="truncate text-sm">{{ user.email }}</p>
          <p class="text-muted text-sm">
            {{ user?.emailVerified ? 'Adresse e-mail confirmée' : 'Adresse e-mail non confirmée' }}
          </p>
        </div>
        <NuxtLink
          v-if="admin.access.value === 'granted'"
          to="/admin"
          class="bg-accent text-accent-fg inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold"
          >Administration</NuxtLink
        >
        <button
          type="button"
          class="border-line hover:bg-surface-2 min-h-11 rounded-full border px-5 text-sm font-semibold disabled:opacity-60"
          :disabled="logoutAction.pending.value"
          @click="logout"
        >
          {{ logoutAction.pending.value ? 'Déconnexion…' : 'Se déconnecter' }}
        </button>
        <p
          v-if="logoutAction.error.value"
          role="alert"
          class="bg-danger-soft text-danger w-full rounded-xl p-3 text-sm"
        >
          {{ logoutAction.error.value }}
        </p>
      </section>

      <AccountProgress />

      <AccountSecurity @password-changed="sessionsPanel?.load()" />

      <AccountSessions ref="sessionsPanel" />

      <section aria-labelledby="delete-title" class="border-danger rounded-2xl border p-5">
        <h2 id="delete-title" class="text-danger text-xl font-bold">Supprimer mon compte</h2>
        <p class="text-muted mt-1 mb-4 text-sm">
          Action définitive : votre compte, vos parties, vos favoris et vos succès sont effacés.
        </p>
        <form novalidate class="flex flex-col gap-4 sm:max-w-sm" @submit.prevent="askDelete">
          <TextField
            ref="deleteField"
            v-model="deletePassword"
            label="Mot de passe actuel"
            type="password"
            autocomplete="current-password"
            required
            :maxlength="PASSWORD_MAX"
            :error="deleteFieldError"
          />
          <div
            v-if="deleteAction.error.value"
            role="alert"
            class="bg-danger-soft text-danger rounded-xl p-3 text-sm"
          >
            {{ deleteAction.error.value }}
          </div>
          <button
            type="submit"
            class="bg-danger text-danger-fg min-h-11 self-start rounded-full px-5 text-sm font-semibold disabled:opacity-60"
            :disabled="deleteAction.pending.value"
          >
            {{ deleteAction.pending.value ? 'Suppression…' : 'Supprimer mon compte' }}
          </button>
        </form>
      </section>
    </template>

    <ConfirmDialog
      :open="confirmingDelete"
      title="Supprimer définitivement votre compte ?"
      confirm-label="Supprimer définitivement"
      @confirm="confirmDelete"
      @cancel="confirmingDelete = false"
    >
      Toutes vos données seront effacées. Cette action ne peut pas être annulée.
    </ConfirmDialog>
  </div>
</template>
