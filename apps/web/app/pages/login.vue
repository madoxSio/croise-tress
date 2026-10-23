<script setup lang="ts">
import { PASSWORD_MAX } from '@crossverse/contracts'
import { api } from '~/services/api'
import { emailError, requiredPasswordError, safeRedirect } from '~/utils/validation'

useHead({ title: 'Se connecter — Crossverse' })

const route = useRoute()
const { isGuest, apply: applySession } = useSession()
const { pending, error, run } = useFormAction()

const email = ref('')
const password = ref('')
const fieldErrors = reactive<{ email: string | null; password: string | null }>({
  email: null,
  password: null,
})
const emailField = ref<{ focus: () => void } | null>(null)
const passwordField = ref<{ focus: () => void } | null>(null)

async function submit(): Promise<void> {
  fieldErrors.email = emailError(email.value)
  fieldErrors.password = requiredPasswordError(password.value)
  if (fieldErrors.email) return emailField.value?.focus()
  if (fieldErrors.password) return passwordField.value?.focus()

  const ok = await run(async () => {
    applySession(await api.login({ email: email.value.trim(), password: password.value }))
  })
  if (ok) await navigateTo(safeRedirect(route.query['redirect'], '/account'))
}
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6">
    <h1 class="text-3xl font-extrabold tracking-tight">Se connecter</h1>

    <p v-if="!isGuest" class="bg-surface border-line rounded-2xl border p-4">
      Vous êtes déjà connecté.
      <NuxtLink to="/account" class="text-accent font-semibold underline">Voir mon compte</NuxtLink>
    </p>

    <form
      v-else
      novalidate
      class="bg-surface border-line flex flex-col gap-4 rounded-2xl border p-5 sm:p-6"
      @submit.prevent="submit"
    >
      <TextField
        ref="emailField"
        v-model="email"
        label="Adresse e-mail"
        type="email"
        autocomplete="email"
        required
        :maxlength="254"
        :error="fieldErrors.email"
      />
      <TextField
        ref="passwordField"
        v-model="password"
        label="Mot de passe"
        type="password"
        autocomplete="current-password"
        required
        :maxlength="PASSWORD_MAX"
        :error="fieldErrors.password"
      />
      <div v-if="error" role="alert" class="bg-danger-soft text-danger rounded-xl p-3 text-sm">
        {{ error }}
      </div>
      <button
        type="submit"
        class="bg-accent text-accent-fg shadow-cta min-h-11 rounded-full px-5 font-semibold disabled:opacity-60"
        :disabled="pending"
      >
        {{ pending ? 'Connexion…' : 'Se connecter' }}
      </button>
      <NuxtLink to="/forgot-password" class="text-accent self-start text-sm font-semibold underline"
        >Mot de passe oublié ?</NuxtLink
      >
    </form>

    <template v-if="isGuest">
      <p class="text-muted text-sm">
        Les parties, favoris et succès obtenus en invité sur cet appareil rejoignent le compte
        auquel vous vous connectez.
      </p>
      <p class="text-sm">
        Pas encore de compte ?
        <NuxtLink to="/register" class="text-accent font-semibold underline"
          >Créer un compte</NuxtLink
        >
      </p>
    </template>
  </div>
</template>
