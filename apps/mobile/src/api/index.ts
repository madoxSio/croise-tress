import { Platform } from 'react-native'
import { config } from '../config'
import { ApiClient } from './client'
import { secureTokenStore } from './token-store'
import { bearerTransport, cookieTransport } from './transport'
import { sessionStore } from './session-store'

export { ApiRequestError, errorMessage } from './errors'
export type { ApiClient } from './client'

/** Client unique de l'application, avec le mode d'authentification de la plateforme. */
export const api = new ApiClient({
  baseUrl: config.apiBaseUrl,
  transport: Platform.OS === 'web' ? cookieTransport : bearerTransport(secureTokenStore),
  onSession: (session) => {
    sessionStore.set(session)
  },
})
