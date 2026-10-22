// Configuration ESLint de l'app mobile. ESLint 10 prend la configuration la plus proche de
// chaque fichier : celle-ci reprend la racine et ajoute les règles des hooks React
// (eslint-plugin-react-hooks n'est installé que dans ce paquet).
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import rootConfig from '../../eslint.config.js'

export default tseslint.config(
  { ignores: ['.expo/**', 'dist/**', 'expo-env.d.ts'] },
  ...rootConfig,
  reactHooks.configs.flat['recommended-latest'],
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Fichiers de configuration Metro : CommonJS imposé par l'outil.
    files: ['metro.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
)
