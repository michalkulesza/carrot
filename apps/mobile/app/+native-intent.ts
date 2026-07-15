export const redirectSystemPath = ({ path }: { path: string }) => {
  try {
    return new URL(path).hostname === 'expo-sharing' ? '/share' : path
  } catch {
    return '/'
  }
}
