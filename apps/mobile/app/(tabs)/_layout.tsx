import { Tabs } from 'expo-router'
import { Text, type ColorValue } from 'react-native'
import { usePalette } from '../../src/theme'

/** Pictogrammes texte : pas de police d'icônes à embarquer pour quatre onglets. */
const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>
  }

export default function TabsLayout() {
  const palette = usePalette()
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.fg,
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.line },
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.muted,
        sceneStyle: { backgroundColor: palette.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', tabBarIcon: icon('⌂') }} />
      <Tabs.Screen name="puzzles" options={{ title: 'Grilles', tabBarIcon: icon('▦') }} />
      <Tabs.Screen name="duel" options={{ title: 'Duel', tabBarIcon: icon('⚔') }} />
      <Tabs.Screen name="account" options={{ title: 'Compte', tabBarIcon: icon('◉') }} />
    </Tabs>
  )
}
