import * as SecureStore from 'expo-secure-store'
import type { TokenStore } from './transport'

const KEY = 'crossverse.session'

/**
 * Jeton de session dans le coffre du système (Keychain iOS, Keystore Android), jamais dans
 * un stockage en clair. Accessible seulement quand l'appareil est déverrouillé, et non
 * restauré sur un autre appareil depuis une sauvegarde.
 */
export const secureTokenStore: TokenStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token) =>
    SecureStore.setItemAsync(KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(KEY),
}
