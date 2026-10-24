import type { DailyChallenge, ResumeResponse } from '@crossverse/contracts'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import sougoudou from '../../assets/sougoudou.png'
import { api, errorMessage } from '../../src/api'
import { Button, Card, ErrorNotice, Loading, Muted, Screen, Title } from '../../src/components/ui'
import { difficultyLabel } from '../../src/game/labels'
import { MASCOT_NAME, MASCOT_PHRASE } from '../../src/mascot'
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

  const resume = data?.resume
  const daily = data?.daily
  return (
    <Screen>
      <View style={styles.hero}>
        <Image
          source={sougoudou}
          style={styles.mascot}
          accessibilityIgnoresInvertColors
          accessible={false}
        />
        <View
          style={[styles.bubble, { backgroundColor: palette.surface, borderColor: palette.line }]}
        >
          <Text style={[styles.phrase, { color: palette.fg }]}>« {MASCOT_PHRASE} »</Text>
          <Muted>{MASCOT_NAME}, la mascotte</Muted>
        </View>
      </View>
      <Title>Les mots croisés, version arène.</Title>
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
  hero: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mascot: { width: 96, height: 96 },
  bubble: { flex: 1, borderWidth: 1, borderRadius: radius.card, padding: 12, gap: 4 },
  phrase: { fontSize: 16, fontWeight: '700' },
  heading: { fontSize: 20, fontWeight: '700' },
  daily: { borderRadius: radius.card + 8, padding: 20, gap: 10 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1, opacity: 0.9 },
  dailyTitle: { fontSize: 26, fontWeight: '800' },
})
