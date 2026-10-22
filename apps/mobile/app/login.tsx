import { router } from 'expo-router'
import { useState } from 'react'
import { api, errorMessage } from '../src/api'
import { TextField } from '../src/components/TextField'
import { Button, ErrorNotice, Muted, Screen, StatusNotice } from '../src/components/ui'
import { emailError, requiredPasswordError } from '../src/validation'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email: string | null; password: string | null }>({
    email: null,
    password: null,
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(): Promise<void> {
    const next = { email: emailError(email), password: requiredPasswordError(password) }
    setErrors(next)
    if (next.email !== null || next.password !== null) return
    setPending(true)
    setError(null)
    try {
      await api.login({ email: email.trim(), password })
      setPassword('')
      router.back()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  async function forgot(): Promise<void> {
    const invalid = emailError(email)
    setErrors((current) => ({ ...current, email: invalid }))
    if (invalid !== null) return
    setError(null)
    try {
      await api.forgotPassword(email.trim())
      // Réponse identique que l'adresse existe ou non (anti-énumération).
      setNotice('Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé.')
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  return (
    <Screen>
      <Muted>Vos parties en invité rejoignent votre compte à la connexion.</Muted>
      <TextField
        label="Adresse e-mail"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={() => void submit()}
      />
      {error !== null ? <ErrorNotice message={error} /> : null}
      {notice !== null ? <StatusNotice message={notice} /> : null}
      <Button
        label={pending ? 'Connexion…' : 'Se connecter'}
        disabled={pending}
        onPress={() => void submit()}
      />
      <Button label="Mot de passe oublié" variant="secondary" onPress={() => void forgot()} />
      <Button
        label="Créer un compte"
        variant="secondary"
        onPress={() => {
          router.replace('/register')
        }}
      />
    </Screen>
  )
}
