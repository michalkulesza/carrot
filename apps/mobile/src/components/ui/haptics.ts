import * as Haptics from 'expo-haptics'

export const lightHaptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

export const selectionHaptic = () => {
  Haptics.selectionAsync().catch(() => {})
}
