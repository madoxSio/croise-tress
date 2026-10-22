import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { api, errorMessage } from '../../src/api'
import type { Leaderboard, MatchHistory } from '../../src/api/client'
import { TextField } from '../../src/components/TextField'
import { Button, Card, ErrorNotice, Loading, Muted, Screen, Title } from '../../src/components/ui'
import { duel } from '../../src/match'
import { useDuel } from '../../src/match/useDuel'
import { radius, usePalette } from '../../src/theme'

const RESULTS = { win: 'Victoire', loss: 'Défaite', draw: 'Égalité' } as const

export default function DuelLobby() {
  const palette = usePalette()
  const snapshot = useDuel()
  const { status, state, queue, busy, error } = snapshot
  const [code, setCode] = useState('')
  const [history, setHistory] = useState<MatchHistory | null>(null)
  const [leaders, setLeaders] = useState<Leaderboard | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Dès que le serveur annonce un match en cours (appariement, invitation acceptée…), on y va.
  useEffect(() => {
    if (state?.status === 'active') router.push(`/duel/${state.id}`)
  }, [state?.status, state?.id])

  const loadLists = useCallback(async () => {
    try {
      const [mine, top] = await Promise.all([api.myMatches(10), api.leaderboard(10)])
      setHistory(mine)
      setLeaders(top)
    } catch (cause) {
      setLoadError(errorMessage(cause))
    }
  }, [])

  // L'historique n'a de sens que pour un compte confirmé : la connexion l'atteste.
  useFocusEffect(
    useCallback(() => {
      if (status === 'connected') void loadLists()
    }, [status, loadLists]),
  )

  const pendingInvite =
    state?.status === 'waiting' && state.inviteCode !== null ? state.inviteCode : null

  if (status === 'account_required') {
    return (
      <Screen>
        <Title>Duel</Title>
        <Card>
          <Muted>
            Les duels sont réservés aux comptes confirmés : créez un compte ou connectez-vous.
          </Muted>
          <Button
            label="Aller au compte"
            onPress={() => {
              router.push('/account')
            }}
          />
        </Card>
      </Screen>
    )
  }

  return (
    <Screen>
      <Title>Duel</Title>
      <Muted>
        Même grille pour vous deux, quinze minutes : chaque mot est validé par le serveur dès que
        vous l’avez rempli. Le premier à tout trouver gagne.
      </Muted>

      {status === 'disconnected' ? (
        <ErrorNotice
          message="Connexion au serveur de jeu interrompue."
          onRetry={() => {
            duel.connect()
          }}
        />
      ) : status === 'connected' ? null : (
        <Loading
          label={
            status === 'reconnecting'
              ? 'Connexion perdue, nouvelle tentative…'
              : 'Connexion au serveur de jeu…'
          }
        />
      )}
      {error !== null ? <ErrorNotice message={error} /> : null}

      <View style={[styles.quick, { backgroundColor: palette.accent }]}>
        <Text style={[styles.heading, { color: palette.accentFg }]}>Partie rapide</Text>
        <Text style={{ color: palette.accentFg }}>
          Affrontez le premier joueur disponible. Le résultat compte pour le classement.
        </Text>
        {queue === 'queued' ? (
          <>
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: palette.accentFg, fontWeight: '700' }}
            >
              Recherche d’un adversaire…
            </Text>
            <Button label="Annuler" variant="secondary" onPress={() => void duel.leaveQueue()} />
          </>
        ) : (
          <Button
            label="Trouver un adversaire"
            variant="secondary"
            disabled={status !== 'connected' || busy || pendingInvite !== null}
            onPress={() => void duel.joinQueue()}
          />
        )}
      </View>

      <Card>
        <Text style={[styles.heading, { color: palette.fg }]}>Défier un ami</Text>
        {pendingInvite !== null ? (
          <>
            <Muted>Donnez ce code à votre ami. Le match commence dès qu’il l’a saisi.</Muted>
            <Text
              selectable
              accessibilityLabel={`Code d’invitation ${pendingInvite.split('').join(' ')}`}
              style={[styles.code, { color: palette.fg }]}
            >
              {pendingInvite}
            </Text>
          </>
        ) : (
          <Button
            label="Créer une invitation"
            variant="secondary"
            disabled={status !== 'connected' || busy || queue !== 'idle'}
            onPress={() => void duel.createInvite()}
          />
        )}
        <TextField
          label="Code reçu"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
        />
        <Button
          label="Rejoindre"
          disabled={status !== 'connected' || busy || code.trim() === ''}
          onPress={() => {
            // Le match accepté arrive aussi par diffusion : l'effet ci-dessus ouvre son écran.
            void duel.acceptInvite(code)
          }}
        />
      </Card>

      {loadError !== null ? (
        <ErrorNotice message={loadError} onRetry={() => void loadLists()} />
      ) : null}

      {history && history.items.length > 0 ? (
        <Card>
          <Text style={[styles.heading, { color: palette.fg }]}>Mes derniers duels</Text>
          {history.items.map((item) => (
            <Text key={item.matchId} style={{ color: palette.fg }}>
              {item.result ? RESULTS[item.result] : 'En cours'} contre{' '}
              {item.opponent ?? 'adversaire'} · {item.puzzleTitle} · {item.solvedCount} mots
            </Text>
          ))}
        </Card>
      ) : null}

      {leaders && leaders.items.length > 0 ? (
        <Card>
          <Text style={[styles.heading, { color: palette.fg }]}>Classement</Text>
          {leaders.items.map((row) => (
            <Text key={row.rank} style={{ color: palette.fg }}>
              {row.rank}. {row.username} · {row.rating} ({row.wins} victoires)
            </Text>
          ))}
        </Card>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  quick: { borderRadius: radius.card + 8, padding: 20, gap: 10 },
  heading: { fontSize: 20, fontWeight: '800' },
  code: { fontSize: 34, fontWeight: '800', letterSpacing: 6, fontVariant: ['tabular-nums'] },
})
