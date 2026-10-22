# iOS : TestFlight puis App Store

Chaîne retenue : **EAS Build** compile et signe l'app sur les macOS d'Expo (pas besoin de Mac),
**EAS Submit** l'envoie sur App Store Connect, où elle apparaît dans **TestFlight**. Le
workflow `.github/workflows/mobile.yml` enchaîne les deux à chaque tag `mobile-vX.Y.Z`.

## Prérequis bloquant côté code

L'authentification native (jeton porteur) n'est pas encore intégrée dans `apps/api`
(`docs/proposals/mobile-native-auth.md`). Tant qu'elle ne l'est pas, une build TestFlight
s'installe et affiche les grilles, mais **la connexion et les duels échouent**.

## Ce qu'il faut fournir 👤

| Élément                            | Où                                                                          | Note                                                    |
| ---------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| Compte **Apple Developer Program** | developer.apple.com/programs                                                | 99 $/an, validation de 24 à 48 h                        |
| Compte **Expo**                    | expo.dev                                                                    | gratuit (30 builds iOS/mois)                            |
| Identifiant de bundle              | `app.crossverse.mobile` (dans `app.json`)                                   | à changer si vous préférez votre domaine                |
| Clé **App Store Connect API**      | App Store Connect → Users and Access → Integrations → App Store Connect API | rôle « App Manager » ; fichier `.p8`, Key ID, Issuer ID |
| `EXPO_TOKEN`                       | expo.dev → Account Settings → Access Tokens                                 | secret GitHub                                           |
| Fiche App Store                    | App Store Connect → Apps → « + »                                            | nom, SKU, langue principale français                    |
| Politique de confidentialité       | une URL publique                                                            | obligatoire pour TestFlight externe et l'App Store      |

Le fichier `.p8` et le mot de passe Apple ne vont **jamais** dans le dépôt ni dans GitHub : ils
sont confiés une fois à EAS (chiffrés chez Expo).

## Mise en place (une seule fois, sur votre ordinateur)

```sh
cd apps/mobile
npx eas-cli@24.10.0 login
npx eas-cli@24.10.0 init                # lie le projet : ajoute owner et extra.eas.projectId à app.json
# eas.json est déjà dans apps/mobile : y remplacer REMPLIR_APPLE_ID_NUMERIQUE par l'ascAppId,
# et EXPO_PUBLIC_API_URL si l'API n'est pas sur crossverse-api.onrender.com
npx eas-cli@24.10.0 credentials -p ios  # connexion Apple : certificat de distribution,
                                        # profil de provisionnement, et clé App Store Connect (.p8)
```

`ascAppId` est l'« Apple ID » numérique de l'app (App Store Connect → l'app → Informations
générales). Le numéro de build est incrémenté par EAS (`appVersionSource: remote`).

## Publier une build TestFlight

```sh
git tag mobile-v0.1.0 && git push origin mobile-v0.1.0
```

ou Actions → Mobile → Run workflow. La CI tourne, puis le build part chez Expo (20 à 40 min).
Apple traite ensuite la build (10 à 30 min) et elle apparaît dans TestFlight :

- **Testeurs internes** (jusqu'à 100 membres de votre équipe App Store Connect) : disponible
  aussitôt, sans revue.
- **Testeurs externes** (jusqu'à 10 000, par e-mail ou lien public) : première build soumise à
  une revue « Beta App Review » d'environ 24 h.

Les testeurs installent l'app **TestFlight** sur leur iPhone puis acceptent l'invitation.

## Passer en production sur l'App Store

Dans App Store Connect, sur la fiche de l'app : captures d'écran (iPhone 6,9" obligatoire,
iPad si `supportsTablet`), description, mots-clés, catégorie « Jeux → Mots », classification
d'âge, questionnaire « confidentialité des données » (e-mail et pseudo collectés), URL de la
politique de confidentialité, compte de démonstration pour la revue (l'app exige un compte pour
les duels). Choisir la build déjà validée dans TestFlight, puis **Soumettre pour vérification**
(1 à 3 jours en général). Aucune nouvelle build n'est nécessaire.

La **suppression de compte depuis l'app**, exigée par Apple (règle 5.1.1(v)), est présente :
écran Compte → « Supprimer mon compte » (route `DELETE /auth/account`). Elle n'a pas encore été
essayée sur un iPhone.
