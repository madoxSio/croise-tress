import type { Stats } from '@crossverse/contracts'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { api, errorMessage } from '../../src/api'
import type { AchievementList } from '../../src/api/client'
import { Button, Card, ErrorNotice, Loading, Muted, Screen, Title } from '../../src/components/ui'
import { formatDuration } from '../../src/game/labels'
import { useSession } from '../../src/session'
import { usePalette } from '../../src/theme'

interface Progress {
  readonly stats: Stats
  readonly achievements: AchievementList
}

export default function Account() {
  const palette = usePalette()
  const session = useSession()
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      // Relu à chaque visite : l'adresse a pu être confirmée depuis la boîte mail.
      await api.reloadSession()
      const [stats, achievements] = await Promise.all([api.getStats(), api.getAchievements()])
      setProgress({ stats, achievements })
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  async function logout(): Promise<void> {
    setPending(true)
    try {
      await api.logout()
      await load()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  const user = session?.user ?? null
  const unlocked = progress?.achievements.items.filter((item) => item.unlockedAt !== null) ?? []

  return (
    <Screen>
      <Title>{user && !user.isGuest ? (user.username ?? 'Mon compte') : 'Compte'}</Title>
      {error !== null ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
      {session === null && error === null ? <Loading /> : null}

      {user?.isGuest ? (
        <Card>
          <Muted>
            Vous jouez en invité. Créez un compte pour garder votre progression sur tous vos
            appareils et affronter d’autres joueurs.
          </Muted>
          <Button
            label="Se connecter"
            onPress={() => {
              router.push('/login')
            }}
          />
          <Button
            label="Créer un compte"
            variant="secondary"
            onPress={() => {
              router.push('/register')
            }}
          />
        </Card>
      ) : null}

      {user && !user.isGuest ? (
        <Card>
          <Text style={{ color: palette.fg }}>{user.email}</Text>
          {!user.emailVerified ? <Muted>Adresse en attente de confirmation.</Muted> : null}
        </Card>
      ) : null}

      {progress ? (
        <Card>
          <Text accessibilityRole="header" style={[styles.heading, { color: palette.fg }]}>
            Statistiques
          </Text>
          <View style={styles.stats}>
            <Stat label="Grilles finies" value={String(progress.stats.completed)} />
            <Stat label="Sans aide" value={String(progress.stats.withoutHelp)} />
            <Stat label="Meilleur score" value={String(progress.stats.bestScore ?? '—')} />
            <Stat
              label="Temps moyen"
              value={
                progress.stats.averageDurationMs === null
                  ? '—'
                  : formatDuration(progress.stats.averageDurationMs)
              }
            />
          </View>
          <Muted>
            Succès : {unlocked.length} sur {progress.achievements.items.length}
            {unlocked.length > 0 ? ` (${unlocked.map((item) => item.title).join(', ')})` : ''}
          </Muted>
        </Card>
      ) : null}

      {user && !user.isGuest ? (
        <Button
          label={pending ? 'Déconnexion…' : 'Se déconnecter'}
          variant="secondary"
          disabled={pending}
          onPress={() => void logout()}
        />
      ) : null}

      {user && !user.isGuest ? (
        <Button
          label="Supprimer mon compte"
          variant="danger"
          disabled={pending}
          onPress={() => {
            router.push('/delete-account')
          }}
        />
      ) : null}
    </Screen>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  const palette = usePalette()
  return (
    <View accessible accessibilityLabel={`${label} : ${value}`} style={styles.stat}>
      <Text style={[styles.value, { color: palette.fg }]}>{value}</Text>
      <Text style={{ color: palette.muted }}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  heading: { fontSize: 18, fontWeight: '700' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { minWidth: '45%', flexGrow: 1 },
  value: { fontSize: 22, fontWeight: '800' },
})
