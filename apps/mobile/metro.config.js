// Configuration Metro du monorepo. Expo détecte le workspace pnpm (racine et liens symboliques) ;
// on ajoute seulement la résolution des imports `./x.js` des paquets partagés vers leurs
// sources `./x.ts` (convention NodeNext de `contracts` et `crossword-core`).
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
const defaultResolve = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest
  const fromWorkspacePackage = context.originModulePath.includes('/packages/')
  if (fromWorkspacePackage && moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return resolve(context, moduleName.replace(/\.js$/, '.ts'), platform)
    } catch {
      // Pas de source TypeScript : vrai fichier JavaScript, résolution normale.
    }
  }
  return resolve(context, moduleName, platform)
}

module.exports = config
