import { RECONNECT_GRACE_MS, uuidSchema } from '@crossverse/contracts'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ActionSheet } from '../../src/components/ActionSheet'
import { ClueBar } from '../../src/components/ClueBar'
import { CrosswordGrid } from '../../src/components/CrosswordGrid'
import { GameKeyboard } from '../../src/components/GameKeyboard'
import { Button, Card, ErrorNotice, Loading, StatusNotice } from '../../src/components/ui'
import { formatClock } from '../../src/game/labels'
import { activeClue } from '../../src/game/state'
import { duel } from '../../src/match'
import { matchEndLabel, matchRemainingMs, matchSides } from '../../src/match/logic'
import { useDuel } from '../../src/match/useDuel'
import { usePalette } from '../../src/theme'
import { useNow } from '../../src/useNow'

type LoadState = 'loading' | 'ready' | 'not-found' | 'error'

export default function DuelMatch() {
  const palette = usePalette()
  const { matchId } = useLocalSearchParams<{ matchId: string }>()
  const validId = uuidSchema.safeParse(matchId).success
  const snapshot = useDuel()
  const [load, setLoad] = useState<{ state: LoadState; error: string | null }>({
    state: validId ? 'loading' : 'not-found',
    error: null,
  })
  const [confirmForfeit, setConfirmForfeit] = useState(false)

  // Premier chargement dès que la connexion est établie ; ensuite, elle resynchronise seule.
  const connected = snapshot.status === 'connected'
  useEffect(() => {
    if (!validId || !connected) return
    void duel.resync(matchId).then((ack) => {
      if (ack.ok) setLoad({ state: 'ready', error: null })
      else if (ack.error.code === 'not_found' || ack.error.code === 'validation_error') {
        setLoad({ state: 'not-found', error: null })
      } else setLoad({ state: 'error', error: ack.error.message })
    })
  }, [validId, connected, matchId])

  const current = snapshot.state?.id === matchId ? snapshot.state : null
  const active = current?.status === 'active'
  const now = useNow(active)

  if (snapshot.status === 'account_required') {
    return (
      <View style={styles.centered}>
        <ErrorNotice message="Les duels sont réservés aux comptes confirmés." />
        <Button
          label="Aller au compte"
          onPress={() => {
            router.replace('/account')
          }}
        />
      </View>
    )
  }
  if (load.state === 'not-found') {
    return (
      <View style={styles.centered}>
        <ErrorNotice message="Ce duel est introuvable." />
        <Button
          label="Retour aux duels"
          variant="secondary"
          onPress={() => {
            router.replace('/duel')
          }}
        />
      </View>
    )
  }
  if (load.state === 'error') {
    return (
      <View style={styles.centered}>
        <ErrorNotice message={load.error ?? 'Duel indisponible.'} />
      </View>
    )
  }
  const { puzzle, game } = snapshot
  if (!current || !puzzle || !game) return <Loading label="Chargement du duel…" />

  const { me, opponent } = matchSides(current)
  const remaining = matchRemainingMs(current, snapshot.offsetMs, now)
  const clue = activeClue(puzzle, game)
  const graceMs =
    snapshot.opponentLostAt === null
      ? null
      : Math.max(0, RECONNECT_GRACE_MS - (now - snapshot.opponentLostAt))
  const over = current.status === 'finished' || current.status === 'aborted'
  const outcome = me?.result ?? null

  return (
    <SafeAreaView edges={['bottom']} style={[styles.screen, { backgroundColor: palette.bg }]}>
      <Stack.Screen options={{ title: current.puzzle?.title ?? 'Duel' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[styles.score, { backgroundColor: palette.surface, borderColor: palette.line }]}
        >
          <View style={styles.side}>
            <Text style={{ color: palette.muted }}>Vous</Text>
            <Text style={[styles.count, { color: palette.fg }]}>
              {me?.solvedCount ?? 0}/{current.totalWords}
            </Text>
          </View>
          <Text
            accessibilityLabel={
              remaining === null ? undefined : `Temps restant ${formatClock(remaining)}`
            }
            style={[styles.clock, { color: palette.fg }]}
          >
            {remaining === null ? '—' : formatClock(remaining)}
          </Text>
          <View style={[styles.side, styles.right]}>
            <Text style={{ color: palette.muted }}>{opponent?.username ?? 'Adversaire'}</Text>
            <Text accessibilityLiveRegion="polite" style={[styles.count, { color: palette.fg }]}>
              {opponent?.solvedCount ?? 0}/{current.totalWords}
            </Text>
          </View>
        </View>

        {graceMs !== null ? (
          <StatusNotice
            message={`Votre adversaire est déconnecté : victoire s’il ne revient pas dans ${Math.ceil(graceMs / 1000)} s.`}
          />
        ) : null}
        {snapshot.status === 'reconnecting' ? (
          <StatusNotice message="Connexion perdue, nouvelle tentative…" />
        ) : null}

        <CrosswordGrid
          puzzle={puzzle}
          game={game}
          onSelect={(row, col) => {
            duel.dispatch({ type: 'select', position: { row, col } })
          }}
        />

        {over ? (
          <Card>
            <Text accessibilityRole="header" style={[styles.result, { color: palette.fg }]}>
              {outcome === 'win'
                ? 'Victoire !'
                : outcome === 'loss'
                  ? 'Défaite'
                  : outcome === 'draw'
                    ? 'Égalité'
                    : 'Match terminé'}
            </Text>
            <Text style={{ color: palette.muted }}>{matchEndLabel(current)}</Text>
            <Button
              label="Retour aux duels"
              onPress={() => {
                router.replace('/duel')
              }}
            />
          </Card>
        ) : (
          <>
            <ClueBar
              clue={clue}
              onPrevious={() => {
                duel.dispatch({ type: 'moveToClue', delta: -1 })
              }}
              onNext={() => {
                duel.dispatch({ type: 'moveToClue', delta: 1 })
              }}
              onToggle={() => {
                duel.dispatch({ type: 'toggleDirection' })
              }}
            />
            <Button
              label="Abandonner"
              variant="secondary"
              disabled={snapshot.busy}
              onPress={() => {
                setConfirmForfeit(true)
              }}
            />
          </>
        )}

        {snapshot.error !== null ? <ErrorNotice message={snapshot.error} /> : null}
        {snapshot.notice !== null ? <StatusNotice message={snapshot.notice} /> : null}
      </ScrollView>

      {over ? null : (
        <View
          style={[
            styles.keyboard,
            { borderTopColor: palette.line, backgroundColor: palette.surface2 },
          ]}
        >
          <GameKeyboard
            disabled={game.locked || !game.active}
            onLetter={(letter) => {
              duel.dispatch({ type: 'input', text: letter })
            }}
            onBackspace={() => {
              duel.dispatch({ type: 'backspace' })
            }}
          />
        </View>
      )}

      <ActionSheet
        title="Abandonner le duel ?"
        message="Votre adversaire remporte le match et le résultat compte pour le classement."
        actions={confirmForfeit ? [{ id: 'forfeit', label: 'Abandonner', danger: true }] : null}
        onSelect={() => {
          setConfirmForfeit(false)
          void duel.forfeit()
        }}
        onClose={() => {
          setConfirmForfeit(false)
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  centered: { flex: 1, padding: 16, gap: 12, justifyContent: 'center' },
  score: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  side: { flex: 1 },
  right: { alignItems: 'flex-end' },
  count: { fontSize: 22, fontWeight: '800' },
  clock: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  result: { fontSize: 24, fontWeight: '800' },
  keyboard: { padding: 8, borderTopWidth: StyleSheet.hairlineWidth },
})
