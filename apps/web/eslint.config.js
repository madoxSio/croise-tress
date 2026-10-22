// Configuration ESLint du client. ESLint 10 cherche la configuration la plus proche de chaque
// fichier : celle-ci reprend intégralement les règles de la racine et y ajoute les SFC Vue
// (eslint-plugin-vue n'est installé que dans ce paquet).
import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import rootConfig from '../../eslint.config.js'

export default tseslint.config(
  ...rootConfig,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.ts', '**/*.vue'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // Le contrôle des identifiants est assuré par TypeScript (vue-tsc), y compris pour les
      // auto-imports Nuxt : recommandation officielle de typescript-eslint.
      'no-undef': 'off',
      // Interdiction explicite (CLAUDE.md §4) : pas de HTML brut injecté.
      'vue/no-v-html': 'error',
      // Prettier gère la mise en forme des gabarits.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
    },
  },
  {
    // Noms de pages Nuxt (index.vue, history.vue, [puzzleId].vue) imposés par le routage.
    files: ['app/pages/**/*.vue', 'app/layouts/**/*.vue', 'app/app.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
)
