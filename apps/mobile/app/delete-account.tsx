import { router } from 'expo-router'
import { useState } from 'react'
import { api, errorMessage } from '../src/api'
import { TextField } from '../src/components/TextField'
import { Button, Card, ErrorNotice, Muted, Screen } from '../src/components/ui'
import { requiredPasswordError } from '../src/validation'

/**
 * Suppression définitive du compte (exigée par l'App Store, règle 5.1.1(v)). Le mot de passe
 * est revérifié par le serveur ; une seconde pression confirme, sans boîte de dialogue système
 * (`Alert` n'existe pas sur la version web).
 */
export default function DeleteAccount() {
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function askConfirmation(): void {
    const invalid = requiredPasswordError(password)
    setPasswordError(invalid)
    if (invalid === null) setConfirming(true)
  }

  async function remove(): Promise<void> {
    setPending(true)
    setError(null)
    try {
      await api.deleteAccount(password)
      setPassword('')
      router.dismissTo('/account')
    } catch (cause) {
      setConfirming(false)
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  return (
    <Screen>
      <Muted>
        Votre compte, vos parties, votre progression, vos succès et votre classement en duel seront
        supprimés définitivement. Cette action est irréversible.
      </Muted>
      <TextField
        label="Mot de passe"
        value={password}
        onChangeText={(value) => {
          setPassword(value)
          setConfirming(false)
          setError(null)
        }}
        error={passwordError}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={askConfirmation}
      />
      {error !== null ? <ErrorNotice message={error} /> : null}
      {confirming ? (
        <Card>
          <Muted>Confirmez-vous la suppression définitive de votre compte ?</Muted>
          <Button
            label={pending ? 'Suppression…' : 'Oui, supprimer définitivement'}
            variant="danger"
            disabled={pending}
            onPress={() => void remove()}
          />
          <Button
            label="Annuler"
            variant="secondary"
            disabled={pending}
            onPress={() => {
              setConfirming(false)
            }}
          />
        </Card>
      ) : (
        <Button label="Supprimer mon compte" variant="danger" onPress={askConfirmation} />
      )}
    </Screen>
  )
}
