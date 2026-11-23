import { withNavigationNonce } from '../src/context/TimerContext/helpers'

export const redirectSystemPath = ({ path }: { path: string }) => {
  try {
    return new URL(path).hostname === 'expo-sharing' ? '/share' : withNavigationNonce(path)
  } catch {
    return '/'
  }
}
