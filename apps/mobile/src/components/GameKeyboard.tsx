/**
 * Clavier de jeu AZERTY : saisie identique sur iOS, Android et web, sans clavier système
 * qui masquerait la grille. Chaque touche est une cible tactile étiquetée.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePalette } from '../theme'

const ROWS: readonly (readonly string[])[] = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'].map((row) =>
  Array.from(row),
)

interface Props {
  readonly disabled: boolean
  readonly onLetter: (letter: string) => void
  readonly onBackspace: () => void
}

export function GameKeyboard({ disabled, onLetter, onBackspace }: Props) {
  const palette = usePalette()
  const keyStyle = ({ pressed }: { pressed: boolean }) => [
    styles.key,
    { backgroundColor: pressed ? palette.accentSoft : palette.surface, borderColor: palette.line },
    disabled && styles.disabled,
  ]
  return (
    <View accessibilityLabel="Clavier de jeu" style={styles.keyboard}>
      {ROWS.map((row, index) => (
        <View key={row.join('')} style={styles.row}>
          {row.map((letter) => (
            <Pressable
              key={letter}
              testID={`key-${letter}`}
              accessibilityRole="keyboardkey"
              accessibilityLabel={letter}
              disabled={disabled}
              onPress={() => {
                onLetter(letter)
              }}
              style={keyStyle}
            >
              <Text style={[styles.label, { color: palette.fg }]}>{letter}</Text>
            </Pressable>
          ))}
          {index === ROWS.length - 1 ? (
            <Pressable
              testID="key-backspace"
              accessibilityRole="keyboardkey"
              accessibilityLabel="Effacer"
              disabled={disabled}
              onPress={onBackspace}
              style={(state) => [...keyStyle(state), styles.wide]}
            >
              <Text style={[styles.label, { color: palette.fg }]}>⌫</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  keyboard: { gap: 6, width: '100%', maxWidth: 560, alignSelf: 'center' },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  key: {
    flex: 1,
    maxWidth: 48,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wide: { flex: 2, maxWidth: 96 },
  label: { fontSize: 18, fontWeight: '600' },
  disabled: { opacity: 0.4 },
})
