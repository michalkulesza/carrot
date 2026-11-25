import { Stack } from 'expo-router'

const screenOptions = {
  headerBackTitle: ' ',
  headerTransparent: true,
  headerShadowVisible: false,
  headerTitleAlign: 'left' as const,
  headerShown: false,
}

export default function HomeLayout() {
  return <Stack screenOptions={screenOptions} />
}
