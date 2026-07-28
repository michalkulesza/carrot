import { Stack } from 'expo-router'

const screenOptions = {
  headerBackTitle: ' ',
  headerTransparent: true,
  headerShadowVisible: false,
  headerTitleAlign: 'left' as const,
}

export default function ShoppingLayout() {
  return <Stack screenOptions={screenOptions} />
}
