const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// packages/shared has its own node_modules/@tanstack/react-query pointing to a
// different pnpm peer-dep variant (react@19.2.7) than apps/mobile (react@19.2.3).
// extraNodeModules is a fallback — it never fires when shared's copy is found first.
// resolveRequest always fires first; redirecting originModulePath to App.tsx makes
// Metro resolve singletons from apps/mobile/node_modules instead of shared's copy.
const singletons = ['@tanstack/react-query', 'react', 'react-i18next', 'i18next']
const appEntry = path.join(projectRoot, 'App.tsx')

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (singletons.includes(moduleName)) {
    return context.resolveRequest(
      { ...context, originModulePath: appEntry },
      moduleName,
      platform
    )
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
