<script setup lang="ts">
import { PASSWORD_MIN } from '@crossverse/contracts'
import { adminApi } from '~/services/admin'

useHead({ title: 'Créer un compte — Administration Crossverse' })

const email = ref('')
const username = ref('')
const password = ref('')
const action = useFormAction()
const result = ref<{ id: string; message: string } | null>(null)

async function submit(): Promise<void> {
  result.value = null
  await action.run(async () => {
    const created = await adminApi.createUser({
      email: email.value.trim(),
      username: username.value.trim(),
      ...(password.value === '' ? {} : { password: password.value }),
    })
    result.value = {
      id: created.user.id,
      message:
        password.value !== ''
          ? 'Compte créé avec le mot de passe saisi.'
          : created.passwordEmailSent
            ? 'Compte créé : un e-mail lui permet de choisir son mot de passe.'
            : 'Compte créé, mais l’e-mail n’a pas pu partir : il peut utiliser « Mot de passe oublié ».',
    }
    email.value = ''
    username.value = ''
    password.value = ''
  })
}
</script>

<template>
  <AdminShell title="Créer un compte">
    <p class="text-muted max-w-prose text-sm">
      Compte joueur confirmé d'emblée (compte de test, partenaire…). Laissez le mot de passe vide :
      la personne reçoit un lien pour choisir le sien et vous ne le connaissez jamais. Le rôle
      administrateur ne se donne pas ici.
    </p>
    <form novalidate class="flex max-w-md flex-col gap-4" @submit.prevent="submit">
      <TextField v-model="email" label="Adresse e-mail" type="email" autocomplete="off" required />
      <TextField
        v-model="username"
        label="Pseudo"
        autocomplete="off"
        hint="3 à 24 caractères : lettres sans accent, chiffres, _ ou -."
        required
        :maxlength="24"
      />
      <TextField
        v-model="password"
        label="Mot de passe (facultatif)"
        type="password"
        autocomplete="new-password"
        :hint="`Vide : lien envoyé par e-mail. Sinon ${PASSWORD_MIN} caractères minimum.`"
      />
      <p
        v-if="action.error.value"
        role="alert"
        class="bg-danger-soft text-danger rounded-xl p-3 text-sm"
      >
        {{ action.error.value }}
      </p>
      <p v-if="result" role="status" class="text-success text-sm font-semibold">
        {{ result.message }}
        <NuxtLink :to="`/admin/users/${result.id}`" class="ml-1 underline">Voir la fiche</NuxtLink>
      </p>
      <button
        type="submit"
        class="bg-fg text-bg min-h-11 self-start rounded-full px-6 font-semibold disabled:opacity-60"
        :disabled="action.pending.value"
      >
        {{ action.pending.value ? 'Création…' : 'Créer le compte' }}
      </button>
    </form>
  </AdminShell>
</template>
