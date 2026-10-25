import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api } from '../../src/api'
import { ActionSheet, type SheetAction } from '../../src/components/ActionSheet'
import { ClueBar } from '../../src/components/ClueBar'
import { CrosswordGrid } from '../../src/components/CrosswordGrid'
import { GameKeyboard } from '../../src/components/GameKeyboard'
import { Button, Card, ErrorNotice, Loading, StatusNotice } from '../../src/components/ui'
import { formatClock, formatDuration } from '../../src/game/labels'
import { activeClue } from '../../src/game/state'
import {
  PlayController,
  type CheckScope,
  type HintKind,
  type SaveState,
} from '../../src/play/controller'
import { usePalette } from '../../src/theme'
import { useNow } from '../../src/useNow'

const SAVE_LABELS: Record<SaveState, string> = {
  idle: '',
  pending: 'Enregistrement…',
  saving: 'Enregistrement…',
  saved: 'Enregistré',
  error: 'Non enregistré',
}

type Sheet = 'check' | 'hint' | 'solution' | null

export default function Play() {
  const palette = usePalette()
  const { puzzleId } = useLocalSearchParams<{ puzzleId: string }>()
  const [controller] = useState(() => new PlayController(api, puzzleId))
  const play = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [sheet, setSheet] = useState<Sheet>(null)

  useEffect(() => {
    void controller.load()
    // Passage en arrière-plan : l'OS peut tuer l'app, on envoie la saisie en attente.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void controller.flush()
    })
    return () => {
      subscription.remove()
      void controller.dispose()
    }
  }, [controller])

  const { puzzle, game, session, details } = play
  const completed = session?.status === 'completed'
  // Chronomètre d'affichage : le temps officiel est calculé par le serveur.
  const now = useNow(session !== null && !completed)

  if (play.loading) return <Loading label="Chargement de la grille…" />
  if (play.loadError !== null || !puzzle || !game || !session) {
    return (
      <View style={styles.centered}>
        <ErrorNotice
          message={play.loadError ?? 'Grille indisponible.'}
          {...(play.notFound ? {} : { onRetry: () => void controller.load() })}
        />
        <Button
          label="Retour aux grilles"
          variant="secondary"
          onPress={() => {
            router.replace('/puzzles')
          }}
        />
      </View>
    )
  }

  const clue = activeClue(puzzle, game)
  const classic = details?.format === 'classic'
  const elapsed = session.durationMs ?? now - new Date(session.startedAt).getTime()

  const checkActions: SheetAction[] = [
    { id: 'cell', label: 'Vérifier la case', disabled: !game.active },
    { id: 'word', label: 'Vérifier le mot', disabled: !clue },
    { id: 'grid', label: 'Vérifier la grille' },
  ]
  const hintActions: SheetAction[] = [
    { id: 'letter', label: 'Révéler une lettre', hint: 'La case active', disabled: !game.active },
    { id: 'word', label: 'Révéler le mot', hint: 'Le mot sélectionné', disabled: !clue },
    { id: 'explain', label: 'Explication', hint: 'Une aide sur la définition', disabled: !clue },
    { id: 'solution', label: 'Solution complète', hint: 'Révèle toute la grille', danger: true },
  ]

  const onSheetSelect = (id: string) => {
    const current = sheet
    setSheet(null)
    if (current === 'check') void controller.check(id as CheckScope)
    else if (current === 'hint') {
      if (id === 'solution') setSheet('solution')
      else void controller.hint(id as HintKind)
    } else if (current === 'solution' && id === 'confirm') void controller.hint('solution')
  }

  return (
    <SafeAreaView edges={['bottom']} style={[styles.screen, { backgroundColor: palette.bg }]}>
      <Stack.Screen options={{ title: details?.title ?? 'Partie' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.meta}>
          <Text
            accessibilityLabel={`Temps ${formatClock(elapsed)}`}
            style={[styles.clock, { color: palette.fg }]}
          >
            {formatClock(elapsed)}
          </Text>
          <Text style={{ color: play.saveState === 'error' ? palette.danger : palette.muted }}>
            {SAVE_LABELS[play.saveState]}
          </Text>
        </View>

        <CrosswordGrid
          puzzle={puzzle}
          game={game}
          classic={classic}
          onSelect={(row, col) => {
            controller.dispatch({ type: 'select', position: { row, col } })
          }}
        />

        {completed ? (
          <Card style={{ borderColor: palette.success }}>
            <Text accessibilityRole="header" style={[styles.done, { color: palette.success }]}>
              Grille terminée !
            </Text>
            <Text style={{ color: palette.fg }}>
              Score {session.score ?? 0} · {formatDuration(session.durationMs ?? 0)}
            </Text>
            <Button
              label="Autres grilles"
              onPress={() => {
                router.replace('/puzzles')
              }}
            />
          </Card>
        ) : (
          <>
            <ClueBar
              clue={clue}
              classic={classic}
              onPrevious={() => {
                controller.dispatch({ type: 'moveToClue', delta: -1 })
              }}
              onNext={() => {
                controller.dispatch({ type: 'moveToClue', delta: 1 })
              }}
              onToggle={() => {
                controller.dispatch({ type: 'toggleDirection' })
              }}
            />
            <View style={styles.actions}>
              <View style={styles.action}>
                <Button
                  label="Vérifier"
                  variant="secondary"
                  disabled={play.busy}
                  onPress={() => {
                    setSheet('check')
                  }}
                />
              </View>
              <View style={styles.action}>
                <Button
                  label="Indice"
                  variant="secondary"
                  disabled={play.busy}
                  onPress={() => {
                    setSheet('hint')
                  }}
                />
              </View>
            </View>
          </>
        )}

        {play.actionError !== null ? <ErrorNotice message={play.actionError} /> : null}
        {play.notice !== null ? <StatusNotice message={play.notice} /> : null}
        {play.explanation !== null ? (
          <Card>
            <Text style={{ color: palette.muted, fontWeight: '700' }}>
              {play.explanation.label}
            </Text>
            <Text style={{ color: palette.fg }}>{play.explanation.text}</Text>
          </Card>
        ) : null}
      </ScrollView>

      {completed ? null : (
        <View
          style={[
            styles.keyboard,
            { borderTopColor: palette.line, backgroundColor: palette.surface2 },
          ]}
        >
          <GameKeyboard
            disabled={game.locked || !game.active}
            onLetter={(letter) => {
              controller.dispatch({ type: 'input', text: letter })
            }}
            onBackspace={() => {
              controller.dispatch({ type: 'backspace' })
            }}
          />
        </View>
      )}

      <ActionSheet
        title={
          sheet === 'hint'
            ? 'Indices'
            : sheet === 'solution'
              ? 'Afficher la solution complète ?'
              : 'Vérifier'
        }
        {...(sheet === 'solution'
          ? {
              message:
                'Toutes les lettres seront révélées et la partie ne rapportera aucun point. Cette action est définitive.',
            }
          : {})}
        actions={
          sheet === 'check'
            ? checkActions
            : sheet === 'hint'
              ? hintActions
              : sheet === 'solution'
                ? [{ id: 'confirm', label: 'Afficher la solution', danger: true }]
                : null
        }
        onSelect={onSheetSelect}
        onClose={() => {
          setSheet(null)
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  centered: { flex: 1, padding: 16, gap: 12, justifyContent: 'center' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clock: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
  done: { fontSize: 22, fontWeight: '800' },
  keyboard: { padding: 8, borderTopWidth: StyleSheet.hairlineWidth },
})
