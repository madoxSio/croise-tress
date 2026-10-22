/**
 * Menu d'actions en feuille modale (vérifier, indices, confirmation). Implémentation maison
 * plutôt que `Alert` : `Alert` n'existe pas en version web et ne permet pas de styler une
 * action destructive de façon homogène.
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { TOUCH_TARGET, radius, usePalette } from '../theme'

export interface SheetAction {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly disabled?: boolean
  readonly danger?: boolean
}

interface Props {
  readonly title: string
  readonly message?: string
  readonly actions: readonly SheetAction[] | null
  readonly onSelect: (id: string) => void
  readonly onClose: () => void
}

export function ActionSheet({ title, message, actions, onSelect, onClose }: Props) {
  const palette = usePalette()
  return (
    <Modal
      visible={actions !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable accessibilityLabel="Fermer" onPress={onClose} style={styles.backdrop} />
      <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: palette.surface }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: palette.fg }]}>
          {title}
        </Text>
        {message ? <Text style={{ color: palette.muted }}>{message}</Text> : null}
        <View style={styles.list}>
          {(actions ?? []).map((action) => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              accessibilityState={{ disabled: action.disabled === true }}
              disabled={action.disabled === true}
              onPress={() => {
                onSelect(action.id)
              }}
              style={({ pressed }) => [
                styles.item,
                { backgroundColor: pressed ? palette.surface2 : 'transparent' },
                action.disabled === true && styles.disabled,
              ]}
            >
              <Text
                style={[
                  styles.label,
                  { color: action.danger === true ? palette.danger : palette.fg },
                ]}
              >
                {action.label}
              </Text>
              {action.hint ? <Text style={{ color: palette.muted }}>{action.hint}</Text> : null}
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.item}>
            <Text style={[styles.label, { color: palette.muted }]}>Annuler</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: 16,
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: '700' },
  list: { gap: 2 },
  item: {
    minHeight: TOUCH_TARGET + 4,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  label: { fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
})
