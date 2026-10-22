/** Applique les préférences enregistrées avant le premier rendu des pages. */
export default defineNuxtPlugin(() => {
  const { preferences } = usePreferences()
  applyPreferences(preferences.value)
})
