<script setup lang="ts">
import { PASSWORD_MAX, PASSWORD_MIN } from '@crossverse/contracts'
import { api } from '~/services/api'
import {
  PASSWORD_HINT,
  emailError,
  newPasswordError,
  requiredPasswordError,
} from '~/utils/validation'

/** Changement de mot de passe et d'adresse e-mail (mot de passe actuel exigé). */
const emit = defineEmits<{ 'password-changed': [] }>()

type Focusable = { focus: () => void } | null

// --- Mot de passe ---
const passwordAction = useFormAction()
const currentPassword = ref('')
const newPassword = ref('')
const passwordErrors = reactive<{ current: string | null; next: string | null }>({
  current: null,
  next: null,
})
const passwordNotice = ref<string | null>(null)
const currentField = ref<Focusable>(null)
const newField = ref<Focusable>(null)

async function changePassword(): Promise<void> {
  passwordNotice.value = null
  passwordErrors.current = requiredPasswordError(currentPassword.value)
  passwordErrors.next = newPasswordError(newPassword.value)
  if (passwordErrors.current) return currentField.value?.focus()
  if (passwordErrors.next) return newField.value?.focus()
  const ok = await passwordAction.run(() =>
    api.changePassword({ currentPassword: currentPassword.value, newPassword: newPassword.value }),
  )
  if (!ok) return
  currentPassword.value = ''
  newPassword.value = ''
  passwordNotice.value = 'Mot de passe modifié. Vos autres sessions ont été fermées.'
  emit('password-changed')
}

// --- Adresse e-mail ---
const emailAction = useFormAction()
const newEmail = ref('')
const emailPassword = ref('')
const emailErrors = reactive<{ email: string | null; password: string | null }>({
  email: null,
  password: null,
})
const emailNotice = ref<string | null>(null)
const newEmailField = ref<Focusable>(null)
const emailPasswordField = ref<Focusable>(null)

async function changeEmail(): Promise<void> {
  emailNotice.value = null
  emailErrors.email = emailError(newEmail.value)
  emailErrors.password = requiredPasswordError(emailPassword.value)
  if (emailErrors.email) return newEmailField.value?.focus()
  if (emailErrors.password) return emailPasswordField.value?.focus()
  const ok = await emailAction.run(async () => {
    await api.changeEmail({ newEmail: newEmail.value.trim(), password: emailPassword.value })
  })
  if (!ok) return
  emailPassword.value = ''
  // Réponse générique : l'API ne révèle pas si l'adresse appartient déjà à un compte.
  emailNotice.value = `Si l'adresse ${newEmail.value.trim()} est disponible, un lien de confirmation (valable 24 heures) vient d'y être envoyé. L'adresse actuelle reste active jusque-là.`
  newEmail.value = ''
}
</script>

<template>
  <div class="grid gap-6 md:grid-cols-2">
    <section aria-labelledby="password-title">
      <h2 id="password-title" class="mb-3 text-xl font-bold">Changer de mot de passe</h2>
      <form
        novalidate
        class="bg-surface border-line flex flex-col gap-4 rounded-2xl border p-5"
        @submit.prevent="changePassword"
      >
        <TextField
          ref="currentField"
          v-model="currentPassword"
          label="Mot de passe actuel"
          type="password"
          autocomplete="current-password"
          required
          :maxlength="PASSWORD_MAX"
          :error="passwordErrors.current"
        />
        <TextField
          ref="newField"
          v-model="newPassword"
          label="Nouveau mot de passe"
          type="password"
          autocomplete="new-password"
          required
          :minlength="PASSWORD_MIN"
          :maxlength="PASSWORD_MAX"
          :hint="PASSWORD_HINT"
          :error="passwordErrors.next"
        />
        <div
          v-if="passwordAction.error.value"
          role="alert"
          class="bg-danger-soft text-danger rounded-xl p-3 text-sm"
        >
          {{ passwordAction.error.value }}
        </div>
        <p role="status" class="text-success text-sm">{{ passwordNotice }}</p>
        <button
          type="submit"
          class="bg-fg text-bg min-h-11 rounded-full px-5 font-semibold disabled:opacity-60"
          :disabled="passwordAction.pending.value"
        >
          {{ passwordAction.pending.value ? 'Enregistrement…' : 'Changer le mot de passe' }}
        </button>
      </form>
    </section>

    <section aria-labelledby="email-title">
      <h2 id="email-title" class="mb-3 text-xl font-bold">Changer d'adresse e-mail</h2>
      <form
        novalidate
        class="bg-surface border-line flex flex-col gap-4 rounded-2xl border p-5"
        @submit.prevent="changeEmail"
      >
        <TextField
          ref="newEmailField"
          v-model="newEmail"
          label="Nouvelle adresse e-mail"
          type="email"
          autocomplete="email"
          required
          :maxlength="254"
          :error="emailErrors.email"
        />
        <TextField
          ref="emailPasswordField"
          v-model="emailPassword"
          label="Mot de passe actuel"
          type="password"
          autocomplete="current-password"
          required
          :maxlength="PASSWORD_MAX"
          :error="emailErrors.password"
        />
        <div
          v-if="emailAction.error.value"
          role="alert"
          class="bg-danger-soft text-danger rounded-xl p-3 text-sm"
        >
          {{ emailAction.error.value }}
        </div>
        <p role="status" class="text-success text-sm">{{ emailNotice }}</p>
        <button
          type="submit"
          class="bg-fg text-bg min-h-11 rounded-full px-5 font-semibold disabled:opacity-60"
          :disabled="emailAction.pending.value"
        >
          {{ emailAction.pending.value ? 'Envoi…' : 'Changer d’adresse' }}
        </button>
      </form>
    </section>
  </div>
</template>
