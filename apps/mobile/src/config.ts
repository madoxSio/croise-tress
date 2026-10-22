import { Platform } from 'react-native'

/**
 * Origine de l'API. Seules les variables `EXPO_PUBLIC_*` sont incluses dans le bundle :
 * on n'y met jamais de secret.
 * - Web : vide par défaut, l'app est servie sur la même origine que l'API (cookie de session).
 * - iOS, Android : obligatoire en production (HTTPS) ; en développement, l'API locale.
 */
function apiBaseUrl(): string {
  // Accès par point obligatoire : Expo ne remplace que `process.env.EXPO_PUBLIC_…` au build.
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '')
  if (configured !== undefined && configured !== '') return configured
  if (Platform.OS === 'web') return ''
  // L'émulateur Android voit la machine hôte en 10.0.2.2 ; le simulateur iOS en localhost.
  return Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001'
}

export const config = {
  apiBaseUrl: apiBaseUrl(),
} as const
