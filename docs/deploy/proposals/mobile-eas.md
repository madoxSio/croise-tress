# Proposition pour `apps/mobile` : publication iOS par EAS

> **Intégrée le 2026-10-20** par le fil mobile (eas.json, `ITSAppUsesNonExemptEncryption`,
> « Supprimer mon compte »). Restent : `owner`, `extra.eas.projectId` (`eas init`) et
> `ascAppId` ; `expo-doctor` et `prebuild` n'ont pas tourné.

Pour le fil « Application mobile React Native » (propriétaire de `apps/mobile`). Rien n'a été
modifié dans `apps/mobile` ; ces changements sont nécessaires au workflow
`.github/workflows/mobile.yml` (guide : [../IOS-TESTFLIGHT.md](../IOS-TESTFLIGHT.md)).

## 1. Ajouter `apps/mobile/eas.json`

Copier [eas.json](eas.json). `EXPO_PUBLIC_API_URL` vise l'API provisoire sur Render (appel
direct en HTTPS, jeton porteur, WebSocket conservé) ; elle passera au domaine du VPS ensuite.
`ascAppId` est rempli par madox une fois l'app créée dans App Store Connect.
Node et pnpm sont épinglés comme dans le reste du monorepo (`.npmrc` impose `engine-strict`).

## 2. Compléter `app.json`

```jsonc
{
  "expo": {
    "owner": "<compte expo>", // ajouté par `eas init`
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "app.crossverse.mobile",
      // Évite la question « chiffrement » à chaque build TestFlight : l'app n'utilise que HTTPS.
      "infoPlist": { "ITSAppUsesNonExemptEncryption": false },
    },
    "extra": { "eas": { "projectId": "<uuid>" } }, // ajouté par `eas init`
  },
}
```

`version` (0.1.0) reste la version affichée ; le numéro de build est géré par EAS.

## 3. Bloquant pour la revue App Store (pas pour TestFlight)

- Écran Compte : ajouter « Supprimer mon compte » (mot de passe demandé, confirmation), qui
  appelle `client.deleteAccount` déjà présent dans `src/api/client.ts`. Apple l'exige (5.1.1(v)).
- L'authentification native doit être intégrée à `apps/api` (`docs/proposals/mobile-native-auth.md`),
  sinon connexion et duels échouent sur iPhone.

## 4. Vérifier avant la première build

- `npx expo-doctor` dans `apps/mobile` (dépendances alignées sur le SDK 58).
- `npx expo prebuild --platform ios --no-install --clean` passe (puis supprimer `ios/`, l'app
  reste en « Continuous Native Generation »), ou une build `preview` sur EAS.
