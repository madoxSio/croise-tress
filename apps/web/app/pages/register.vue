<script setup lang="ts">
import { PASSWORD_MAX, PASSWORD_MIN } from '@crossverse/contracts'
import { api } from '~/services/api'
import {
  PASSWORD_HINT,
  USERNAME_HINT,
  emailError,
  newPasswordError,
  usernameError,
} from '~/utils/validation'

useHead({ title: 'Créer un compte — Crossverse' })

const { isGuest } = useSession()
const { pending, error, run } = useFormAction()
const isDev = import.meta.dev

const username = ref('')
const email = ref('')
const password = ref('')
const fieldErrors = reactive<{
  username: string | null
  email: string | null
  password: string | null
}>({ username: null, email: null, password: null })
const usernameField = ref<{ focus: () => void } | null>(null)
const emailField = ref<{ focus: () => void } | null>(null)
const passwordField = ref<{ focus: () => void } | null>(null)

/** Adresse à laquelle le lien a été envoyé : bascule vers l'écran « vérifiez vos e-mails ». */
const sentTo = ref<string | null>(null)
const sentHeading = ref<HTMLElement | null>(null)

async function submit(): Promise<void> {
  fieldErrors.username = usernameError(username.value)
  fieldErrors.email = emailError(email.value)
  fieldErrors.password = newPasswordError(password.value)
  if (fieldErrors.username) return usernameField.value?.focus()
  if (fieldErrors.email) return emailField.value?.focus()
  if (fieldErrors.password) return passwordField.value?.focus()

  const address = email.value.trim()
  const ok = await run(async () => {
    await api.register({ username: username.value, email: address, password: password.value })
  })
  if (!ok) return
  password.value = ''
  sentTo.value = address
  await nextTick()
  sentHeading.value?.focus()
}
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6">
    <h1 class="text-3xl font-extrabold tracking-tight">Créer un compte</h1>

    <p v-if="!isGuest" class="bg-surface border-line rounded-2xl border p-4">
      Vous êtes déjà connecté à un compte.
      <NuxtLink to="/account" class="text-accent font-semibold underline">Voir mon compte</NuxtLink>
    </p>

    <section
      v-else-if="sentTo"
      aria-labelledby="sent-title"
      class="bg-surface border-line flex flex-col gap-3 rounded-2xl border p-5 sm:p-6"
    >
      <h2 id="sent-title" ref="sentHeading" tabindex="-1" class="text-xl font-bold">
        Vérifiez votre boîte e-mail
      </h2>
      <p>
        Un e-mail vient d'être envoyé à <strong class="break-all">{{ sentTo }}</strong
        >. Ouvrez le lien de confirmation qu'il contient (valable 24 heures) pour activer votre
        compte.
      </p>
      <p class="text-muted text-sm">
        Rien reçu ? Vérifiez les indésirables ou recommencez dans quelques minutes.
      </p>
      <p v-if="isDev" class="bg-accent-soft rounded-xl p-3 text-sm">
        Développement : les e-mails sont capturés par Mailpit sur
        <a
          href="http://localhost:8025"
          class="font-semibold underline"
          target="_blank"
          rel="noopener"
          >http://localhost:8025</a
        >.
      </p>
      <button
        type="button"
        class="text-accent self-start text-sm font-semibold underline"
        @click="sentTo = null"
      >
        Modifier l'adresse
      </button>
    </section>

    <template v-else>
      <p class="text-muted">
        Vos parties, favoris et statistiques d'invité sont conservés : ce compte invité devient
        votre compte dès la confirmation de votre adresse e-mail.
      </p>
      <form
        novalidate
        class="bg-surface border-line flex flex-col gap-4 rounded-2xl border p-5 sm:p-6"
        @submit.prevent="submit"
      >
        <TextField
          ref="usernameField"
          v-model="username"
          label="Pseudo"
          autocomplete="username"
          required
          :maxlength="24"
          :hint="USERNAME_HINT"
          :error="fieldErrors.username"
        />
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
          autocomplete="new-password"
          required
          :minlength="PASSWORD_MIN"
          :maxlength="PASSWORD_MAX"
          :hint="PASSWORD_HINT"
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
          {{ pending ? 'Envoi…' : 'Créer mon compte' }}
        </button>
      </form>
      <p class="text-sm">
        Déjà un compte ?
        <NuxtLink to="/login" class="text-accent font-semibold underline">Se connecter</NuxtLink>
      </p>
    </template>
  </div>
</template>
