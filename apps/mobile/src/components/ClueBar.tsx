import type { PublicClue } from '@crossverse/crossword-core'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { clueTag } from '../game/labels'
import { TOUCH_TARGET, radius, usePalette } from '../theme'

interface Props {
  readonly clue: PublicClue | undefined
  readonly onPrevious: () => void
  readonly onNext: () => void
  readonly onToggle: () => void
  /** Mots croisés classiques : repère de ligne (I, II…) ou de colonne (1, 2…). */
  readonly classic?: boolean
}

/** Définition du mot actif, avec mot précédent / suivant ; toucher le texte change de sens. */
export function ClueBar({ clue, onPrevious, onNext, onToggle, classic = false }: Props) {
  const palette = usePalette()
  const arrow = (label: string, symbol: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.arrow}
    >
      <Text style={[styles.symbol, { color: palette.accentFg }]}>{symbol}</Text>
    </Pressable>
  )
  return (
    <View style={[styles.bar, { backgroundColor: palette.accent }]}>
      {arrow('Mot précédent', '‹', onPrevious)}
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Change le sens de saisie"
        accessibilityLiveRegion="polite"
        onPress={onToggle}
        style={styles.text}
      >
        <Text style={[styles.label, { color: palette.accentFg }]}>
          {clue ? `${clueTag(clue, classic)} · ${clue.length} lettres` : 'Touchez une case'}
        </Text>
        <Text numberOfLines={2} style={[styles.clue, { color: palette.accentFg }]}>
          {clue?.text ?? 'Choisissez une case de la grille pour commencer.'}
        </Text>
      </Pressable>
      {arrow('Mot suivant', '›', onNext)}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.card, minHeight: 64 },
  arrow: {
    width: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: { fontSize: 30, fontWeight: '600' },
  text: { flex: 1, paddingVertical: 8 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', opacity: 0.9 },
  clue: { fontSize: 16, fontWeight: '600' },
})
