/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'TimerActivity',
  displayName: 'Carrot Timer',
  deploymentTarget: '16.4',
  frameworks: ['SwiftUI', 'ActivityKit', 'AppIntents'],
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
})
