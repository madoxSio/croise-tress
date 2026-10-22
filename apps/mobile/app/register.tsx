import { router } from 'expo-router'
import { useState } from 'react'
import { api, errorMessage } from '../src/api'
import { TextField } from '../src/components/TextField'
import { Button, Card, ErrorNotice, Muted, Screen, Title } from '../src/components/ui'
import { useSession } from '../src/session'
import {
  PASSWORD_HINT,
  USERNAME_HINT,
  emailError,
  newPasswordError,
  usernameError,
} from '../src/validation'

interface FieldErrors {
  username: string | null
  email: string | null
  password: string | null
}

export default function Register() {
  const session = useSession()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({ username: null, email: null, password: null })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function submit(): Promise<void> {
    const next = {
      username: usernameError(username),
      email: emailError(email),
      password: newPasswordError(password),
    }
    setErrors(next)
    if (next.username !== null || next.email !== null || next.password !== null) return
    setPending(true)
    setError(null)
    try {
      const address = email.trim()
      await api.register({ username, email: address, password })
      setPassword('')
      setSentTo(address)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  if (session?.user && !session.user.isGuest) {
    return (
      <Screen>
        <Muted>Vous êtes déjà connecté à un compte.</Muted>
        <Button
          label="Voir mon compte"
          onPress={() => {
            router.replace('/account')
          }}
        />
      </Screen>
    )
  }

  if (sentTo !== null) {
    return (
      <Screen>
        <Title>Vérifiez vos e-mails</Title>
        <Card>
          <Muted>
            Un lien de confirmation a été envoyé à {sentTo}. Ouvrez-le pour activer votre compte :
            votre progression actuelle est conservée.
          </Muted>
        </Card>
        <Button
          label="J’ai confirmé mon adresse"
          onPress={() => {
            router.replace('/account')
          }}
        />
      </Screen>
    )
  }

  return (
    <Screen>
      <Muted>Un compte garde votre progression sur tous vos appareils et ouvre les duels.</Muted>
      <TextField
        label="Pseudo"
        value={username}
        onChangeText={setUsername}
        error={errors.username}
        hint={USERNAME_HINT}
        autoCapitalize="none"
        autoComplete="username-new"
      />
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
        hint={PASSWORD_HINT}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      {error !== null ? <ErrorNotice message={error} /> : null}
      <Button
        label={pending ? 'Création…' : 'Créer mon compte'}
        disabled={pending}
        onPress={() => void submit()}
      />
    </Screen>
  )
}
