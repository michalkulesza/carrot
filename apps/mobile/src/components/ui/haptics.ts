import * as Haptics from 'expo-haptics'

export const lightHaptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

export const selectionHaptic = () => {
  Haptics.selectionAsync().catch(() => {})
}

export const rigidHaptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {})
}

export const mediumHaptic = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
}

export const successHaptic = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
}

export const errorHaptic = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
}
