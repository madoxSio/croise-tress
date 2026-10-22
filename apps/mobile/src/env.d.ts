// Variables publiques injectées par Expo au build (jamais de secret : elles sont dans le bundle).
declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_API_URL?: string
  }
}
