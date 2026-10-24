/**
 * Briques d'interface communes : écran, carte, bouton, messages. Toutes respectent une cible
 * tactile d'au moins 44 points et exposent leur rôle aux lecteurs d'écran.
 */
import { useEffect, useState, type ReactNode } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import sougoudou from '../../assets/sougoudou.png'
import { TOUCH_TARGET, radius, usePalette } from '../theme'

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const palette = usePalette()
  const content = <View style={styles.content}>{children}</View>
  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[styles.screen, { backgroundColor: palette.bg }]}
    >
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  )
}

export function Title({ children }: { children: ReactNode }) {
  const palette = usePalette()
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: palette.fg }]}>
      {children}
    </Text>
  )
}

export function Muted({ children }: { children: ReactNode }) {
  const palette = usePalette()
  return <Text style={[styles.muted, { color: palette.muted }]}>{children}</Text>
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const palette = usePalette()
  return (
    <View
      style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }, style]}
    >
      {children}
    </View>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'neon'

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityHint,
}: {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  disabled?: boolean
  accessibilityHint?: string
}) {
  const palette = usePalette()
  const colors: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: palette.fg, fg: palette.bg, border: palette.fg },
    secondary: { bg: palette.surface, fg: palette.fg, border: palette.line },
    danger: { bg: palette.danger, fg: '#ffffff', border: palette.danger },
    // Citron sur encre (contraste 15:1), réservé à l'appel principal « Partie rapide ».
    neon: { bg: '#c8f53c', fg: '#16132a', border: '#c8f53c' },
  }
  const color = colors[variant]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: color.bg, borderColor: color.border },
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 },
      ]}
    >
      <Text style={[styles.buttonLabel, { color: color.fg }]}>{label}</Text>
    </Pressable>
  )
}

/**
 * Chargement aux couleurs de Crossverse : Sougoudou attend pendant que les cases « MOTS » se
 * remplissent une à une. Animations réduites (réglage système) : les cases restent pleines.
 */
export function Loading({ label = 'Chargement…' }: { label?: string }) {
  const palette = usePalette()
  const [progress] = useState(() => new Animated.Value(1))
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null
    let cancelled = false
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced || cancelled) return
      progress.setValue(0)
      loop = Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: 1600,
          easing: (t) => t,
          useNativeDriver: true,
        }),
      )
      loop.start()
    })
    return () => {
      cancelled = true
      loop?.stop()
    }
  }, [progress])
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.loading}>
      <Image
        source={sougoudou}
        style={styles.loadingBear}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.tiles} accessibilityElementsHidden importantForAccessibility="no">
        {LOADING_TILES.map((letter, index) => {
          // Chaque case apparaît à son tour puis reste pleine jusqu'à la fin du cycle.
          const start = index * 0.12
          const opacity = progress.interpolate({
            inputRange: [0, start, start + 0.12, 1],
            outputRange: [0.15, 0.15, 1, 1],
          })
          return (
            <Animated.View
              key={letter}
              style={[
                styles.tile,
                { borderColor: palette.accent, backgroundColor: palette.surface, opacity },
              ]}
            >
              <Text style={[styles.tileLetter, { color: palette.accent }]}>{letter}</Text>
            </Animated.View>
          )
        })}
      </View>
      <Text style={{ color: palette.muted, fontWeight: '600' }}>{label}</Text>
    </View>
  )
}

const LOADING_TILES = ['M', 'O', 'T', 'S'] as const

/** Message d'erreur annoncé immédiatement par les lecteurs d'écran. */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const palette = usePalette()
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[styles.notice, { backgroundColor: palette.dangerSoft }]}
    >
      <Text style={{ color: palette.danger }}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.link}>
          <Text style={[styles.linkLabel, { color: palette.danger }]}>Réessayer</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/** Message d'état non bloquant (résultat de vérification, confirmation…). */
export function StatusNotice({ message }: { message: string }) {
  const palette = usePalette()
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: palette.accentSoft }]}
    >
      <Text style={{ color: palette.fg }}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { flex: 1, gap: 16, padding: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  muted: { fontSize: 15, lineHeight: 21 },
  card: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 8 },
  button: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 16, fontWeight: '700' },
  loading: { gap: 10, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingBear: { width: 72, height: 72 },
  tiles: { flexDirection: 'row', gap: 6 },
  tile: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLetter: { fontSize: 14, fontWeight: '800' },
  notice: { borderRadius: radius.card, padding: 14, gap: 4 },
  link: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
  linkLabel: { fontWeight: '700', textDecorationLine: 'underline' },
})
