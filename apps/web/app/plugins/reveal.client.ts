/**
 * Directive `v-reveal` : fait apparaître un bloc quand il entre à l'écran (classe
 * `is-visible`, transition définie dans main.css). Sans IntersectionObserver, le bloc est
 * affiché tout de suite ; la réduction des animations neutralise la transition en CSS.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const observer =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue
              entry.target.classList.add('is-visible')
              observer?.unobserve(entry.target)
            }
          },
          { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
        )
      : null

  nuxtApp.vueApp.directive<HTMLElement>('reveal', {
    mounted(el) {
      el.classList.add('cv-reveal')
      if (observer) observer.observe(el)
      else el.classList.add('is-visible')
    },
    unmounted(el) {
      observer?.unobserve(el)
    },
  })
})
