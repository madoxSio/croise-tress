# Identité visuelle

- **Mascotte** : Meyron, une case de mots croisés avec un visage et un crayon. Source
  vectorielle animée : `apps/web/app/components/MeyronMascot.vue` ; version statique :
  `meyron.svg`. Phrase d'accroche : `apps/web/app/utils/mascot.ts` (et
  `apps/mobile/src/mascot.ts`).
- **Icône** : le visage de Meyron sur une tuile violette. `apps/web/public/favicon.svg`
  (coins arrondis) ; `icon-square.svg` (pleine page, pour iOS/Android qui découpent
  eux-mêmes) ; `icon-foreground.svg`, `icon-background.svg`, `icon-monochrome.svg` pour
  l'icône adaptative Android.
- **Palette** : encre `#16132a`, violet `#5634f0`, corail `#ff5c39`, citron `#c8f53c`
  (jetons `--cv-*` dans `apps/web/app/assets/css/main.css`, repris dans
  `apps/mobile/src/theme.ts`).
- **Typographies** : Bricolage Grotesque (titres) et Inter (texte), auto-hébergées via
  Fontsource (licence OFL).

Régénérer les PNG : `node docs/brand/render-icons.mjs` depuis la racine (voir l'en-tête du
script).
