import { NATIVE_CLIENT_HEADER, NATIVE_CLIENT_VALUE, SOCKET_PATH } from '@crossverse/contracts'
import { randomUUID } from 'expo-crypto'
import { Platform } from 'react-native'
import { io } from 'socket.io-client'
import { secureTokenStore } from '../api/token-store'
import { config } from '../config'
import { MatchConnection, type SocketFactory } from './connection'
import { DuelController } from './controller'

/**
 * Web : même origine, cookie de session (long polling puis WebSocket, comme `apps/web`).
 * iOS / Android : WebSocket direct vers l'API, jeton lu dans le coffre à chaque (re)connexion
 * et passé dans la poignée de main (`auth`), jamais dans l'URL.
 */
const factory: SocketFactory =
  Platform.OS === 'web'
    ? () => io(config.apiBaseUrl, { path: SOCKET_PATH, withCredentials: true, autoConnect: false })
    : () =>
        io(config.apiBaseUrl, {
          path: SOCKET_PATH,
          transports: ['websocket'],
          autoConnect: false,
          extraHeaders: { [NATIVE_CLIENT_HEADER]: NATIVE_CLIENT_VALUE },
          auth: (callback) => {
            void secureTokenStore.get().then((token) => {
              callback({ token })
            })
          },
        })

/** Connexion unique de l'application : l'état du match survit au changement d'écran. */
export const matchConnection = new MatchConnection({ factory, newId: randomUUID })

/** État du duel partagé par l'onglet Duel et l'écran du match. */
export const duel = new DuelController(matchConnection)
