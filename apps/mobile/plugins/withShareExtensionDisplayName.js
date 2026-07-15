const { withXcodeProject } = require('expo/config-plugins')

const SHARE_EXTENSION_TARGET = 'expo-sharing-extension'
const DISPLAY_NAME = 'Carrot'

const withShareExtensionDisplayName = (config) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults
    const target = project.pbxTargetByName(SHARE_EXTENSION_TARGET)

    if (!target) {
      throw new Error(`Missing ${SHARE_EXTENSION_TARGET} target`)
    }

    const configurationList = project.pbxXCConfigurationList()[target.buildConfigurationList]
    const configurations = project.pbxXCBuildConfigurationSection()

    for (const configuration of configurationList.buildConfigurations) {
      configurations[configuration.value].buildSettings.INFOPLIST_KEY_CFBundleDisplayName = DISPLAY_NAME
    }

    return config
  })

module.exports = withShareExtensionDisplayName
