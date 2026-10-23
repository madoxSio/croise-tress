// Variables publiques injectées par Expo au build (jamais de secret : elles sont dans le bundle).
declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_API_URL?: string
  }
}

// Images importées : Metro les remplace par un identifiant de ressource (ImageSourcePropType).
declare module '*.png' {
  const source: number
  export default source
}
