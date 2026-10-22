/**
 * Ouvre la session au démarrage (création d'un compte invité si nécessaire).
 * Non bloquant : un échec réseau est affiché par la mise en page, avec possibilité de réessayer.
 */
export default defineNuxtPlugin(() => {
  void useSession().ensure()
})
