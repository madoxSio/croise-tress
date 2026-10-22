<script setup lang="ts">
import { api } from '~/services/api'
import { emailError } from '~/utils/validation'

useHead({ title: 'Mot de passe oublié — Crossverse' })

const { pending, error, run } = useFormAction()
const isDev = import.meta.dev

const email = ref('')
const fieldError = ref<string | null>(null)
const emailField = ref<{ focus: () => void } | null>(null)
const sent = ref(false)
const sentHeading = ref<HTMLElement | null>(null)

async function submit(): Promise<void> {
  fieldError.value = emailError(email.value)
  if (fieldError.value) return emailField.value?.focus()
  const ok = await run(async () => {
    await api.forgotPassword(email.value.trim())
  })
  if (!ok) return
  sent.value = true
  await nextTick()
  sentHeading.value?.focus()
}
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6">
    <h1 class="text-3xl font-extrabold tracking-tight">Mot de passe oublié</h1>

    <section
      v-if="sent"
      aria-labelledby="sent-title"
      class="bg-surface border-line flex flex-col gap-3 rounded-2xl border p-5 sm:p-6"
    >
      <h2 id="sent-title" ref="sentHeading" tabindex="-1" class="text-xl font-bold">
        Demande enregistrée
      </h2>
      <!-- Message identique que l'adresse soit connue ou non (anti-énumération). -->
      <p>
        Si un compte existe pour cette adresse, un e-mail contenant un lien de réinitialisation
        vient d'être envoyé. Le lien est valable 30 minutes.
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
      <NuxtLink to="/login" class="text-accent self-start text-sm font-semibold underline"
        >Retour à la connexion</NuxtLink
      >
    </section>

    <form
      v-else
      novalidate
      class="bg-surface border-line flex flex-col gap-4 rounded-2xl border p-5 sm:p-6"
      @submit.prevent="submit"
    >
      <p class="text-muted text-sm">
        Indiquez l'adresse de votre compte : nous vous enverrons un lien pour choisir un nouveau mot
        de passe.
      </p>
      <TextField
        ref="emailField"
        v-model="email"
        label="Adresse e-mail"
        type="email"
        autocomplete="email"
        required
        :maxlength="254"
        :error="fieldError"
      />
      <div v-if="error" role="alert" class="bg-danger-soft text-danger rounded-xl p-3 text-sm">
        {{ error }}
      </div>
      <button
        type="submit"
        class="bg-fg text-bg min-h-11 rounded-full px-5 font-semibold disabled:opacity-60"
        :disabled="pending"
      >
        {{ pending ? 'Envoi…' : 'Envoyer le lien' }}
      </button>
    </form>
  </div>
</template>
