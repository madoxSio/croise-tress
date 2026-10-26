import type { DailyChallenge, ResumeResponse } from '@crossverse/contracts'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import meyron from '../../assets/meyron.png'
import { api, errorMessage } from '../../src/api'
import { Button, Card, ErrorNotice, Loading, Muted, Screen } from '../../src/components/ui'
import { difficultyLabel } from '../../src/game/labels'
import { MASCOT_GREETING, MASCOT_NAME } from '../../src/mascot'
import { puzzleRoute, usePlayMode } from '../../src/playMode'
import { radius, usePalette } from '../../src/theme'

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

interface HomeData {
  readonly daily: DailyChallenge | null
  readonly resume: ResumeResponse
}

export default function Home() {
  const palette = usePalette()
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      await api.ensureSession()
      const [daily, resume] = await Promise.all([api.getDaily(), api.getResume()])
      setData({ daily, resume })
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }, [])

  // Rechargé à chaque retour sur l'onglet : la partie en cours a pu changer.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  // Partie rapide : le serveur tire une grille simple au hasard.
  const [quickBusy, setQuickBusy] = useState(false)
  const mode = usePlayMode()
  const [quickError, setQuickError] = useState<string | null>(null)
  const quickPlay = useCallback(async () => {
    setQuickBusy(true)
    setQuickError(null)
    try {
      await api.ensureSession()
      const pick = await api.quickPlay()
      if (pick) router.push(puzzleRoute(pick.id, mode))
      else setQuickError('Aucune grille disponible pour le moment.')
    } catch (cause) {
      setQuickError(errorMessage(cause))
    } finally {
      setQuickBusy(false)
    }
  }, [mode])

  const resume = data?.resume
  const daily = data?.daily
  return (
    <Screen>
      {/* Scène sombre (comme le web) : Meyron se présente, partie rapide en un geste. */}
      <View style={styles.stage}>
        <View style={styles.hero}>
          <Image
            source={meyron}
            style={styles.mascot}
            accessibilityIgnoresInvertColors
            accessible={false}
          />
          <View style={styles.bubble}>
            <Text style={styles.phrase}>{MASCOT_GREETING}</Text>
          </View>
        </View>
        <Text accessibilityRole="header" style={styles.stageTitle}>
          Les mots croisés,{'\n'}
          <Text style={styles.stageAccent}>version arène.</Text>
        </Text>
        <Text style={styles.stageText}>
          Des grilles par thèmes, un défi chaque jour et des duels en temps réel. Sans inscription
          pour commencer.
        </Text>
        <Button
          label={quickBusy ? 'Préparation…' : 'Partie rapide'}
          variant="neon"
          disabled={quickBusy}
          onPress={() => void quickPlay()}
        />
        {quickError !== null ? <Text style={styles.stageError}>{quickError}</Text> : null}
        <Text style={styles.stageCaption}>{MASCOT_NAME}, votre guide</Text>
      </View>
      {error !== null ? (
        <ErrorNotice message={error} onRetry={() => void load()} />
      ) : data === null ? (
        <Loading />
      ) : (
        <>
          {resume?.session && resume.puzzle ? (
            <Card>
              <Muted>PARTIE EN COURS</Muted>
              <Text style={[styles.heading, { color: palette.fg }]}>{resume.puzzle.title}</Text>
              <Muted>
                {difficultyLabel(resume.puzzle.difficulty)} · {resume.puzzle.theme}
              </Muted>
              <Button
                label="Reprendre"
                onPress={() => {
                  if (resume.puzzle) router.push(`/play/${resume.puzzle.id}`)
                }}
              />
            </Card>
          ) : null}

          <View style={[styles.daily, { backgroundColor: palette.accent }]}>
            <Text style={[styles.kicker, { color: palette.accentFg }]}>DÉFI DU JOUR</Text>
            {daily ? (
              <>
                <Text style={[styles.dailyTitle, { color: palette.accentFg }]}>
                  {daily.puzzle.title}
                </Text>
                <Text style={{ color: palette.accentFg }}>
                  {dateFormatter.format(new Date(`${daily.date}T00:00:00Z`))} ·{' '}
                  {difficultyLabel(daily.puzzle.difficulty)} · {daily.puzzle.estimatedMinutes} min
                </Text>
                <Button
                  label="Jouer le défi"
                  variant="secondary"
                  onPress={() => {
                    router.push(`/play/${daily.puzzle.id}`)
                  }}
                />
              </>
            ) : (
              <Text style={{ color: palette.accentFg }}>Pas de défi aujourd’hui.</Text>
            )}
          </View>

          <Button
            label="Toutes les grilles"
            variant="secondary"
            onPress={() => {
              router.push('/puzzles')
            }}
          />
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  stage: { backgroundColor: '#0d0b17', borderRadius: radius.card + 12, padding: 20, gap: 14 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mascot: { width: 104, height: 104 },
  bubble: { flex: 1, backgroundColor: '#ffffff', borderRadius: radius.card, padding: 12 },
  phrase: { fontSize: 15, fontWeight: '700', color: '#16132a' },
  stageTitle: { fontSize: 34, fontWeight: '800', color: '#ffffff', lineHeight: 38 },
  stageAccent: { color: '#c8f53c' },
  stageText: { fontSize: 16, lineHeight: 23, color: 'rgba(255,255,255,0.78)' },
  stageError: { color: '#ffb4aa' },
  stageCaption: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  heading: { fontSize: 20, fontWeight: '700' },
  daily: { borderRadius: radius.card + 8, padding: 20, gap: 10 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1, opacity: 0.9 },
  dailyTitle: { fontSize: 26, fontWeight: '800' },
})
