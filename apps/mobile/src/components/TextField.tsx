import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { TOUCH_TARGET, usePalette } from '../theme'

interface Props extends Omit<TextInputProps, 'style'> {
  readonly label: string
  readonly error?: string | null
  readonly hint?: string
}

/** Champ de formulaire étiqueté ; l'erreur est annoncée et reliée au champ. */
export function TextField({ label, error = null, hint, ...input }: Props) {
  const palette = usePalette()
  const description = error ?? hint
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        {...(description === undefined ? {} : { accessibilityHint: description })}
        placeholderTextColor={palette.muted}
        style={[
          styles.input,
          {
            color: palette.fg,
            backgroundColor: palette.surface,
            borderColor: error !== null ? palette.danger : palette.line,
          },
        ]}
        {...input}
      />
      {error !== null ? (
        <Text accessibilityLiveRegion="polite" style={{ color: palette.danger }}>
          {error}
        </Text>
      ) : hint !== undefined ? (
        <Text style={{ color: palette.muted }}>{hint}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '600' },
  input: {
    minHeight: TOUCH_TARGET + 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
  },
})
