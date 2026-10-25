import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { usePalette } from '../src/theme'

export default function RootLayout() {
  const palette = usePalette()
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.surface },
          headerTintColor: palette.fg,
          contentStyle: { backgroundColor: palette.bg },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="play/[puzzleId]" options={{ title: 'Partie' }} />
        <Stack.Screen name="pre-remplie/[puzzleId]" options={{ title: 'Grille pré-remplie' }} />
        <Stack.Screen name="mots-meles/index" options={{ title: 'Mots mêlés' }} />
        <Stack.Screen name="mots-meles/[id]" options={{ title: 'Mots mêlés' }} />
        <Stack.Screen name="duel/[matchId]" options={{ title: 'Duel' }} />
        <Stack.Screen name="login" options={{ title: 'Connexion' }} />
        <Stack.Screen name="register" options={{ title: 'Créer un compte' }} />
        <Stack.Screen name="delete-account" options={{ title: 'Supprimer mon compte' }} />
      </Stack>
    </>
  )
}
