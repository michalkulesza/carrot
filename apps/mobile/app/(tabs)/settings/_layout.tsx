import { Stack } from 'expo-router'
import { useResolvedColorScheme } from '../../../src/context/ColorSchemeContext'

export default function SettingsLayout() {
  const colorScheme = useResolvedColorScheme()
  const headerColor = colorScheme === 'dark' ? '#ffffff' : '#000000'

  return (
    <Stack
      screenOptions={{
        headerBackTitle: ' ',
        headerTransparent: true,
        headerShadowVisible: false,
        headerTitleAlign: 'left',
        headerTitleStyle: { color: headerColor },
        headerTintColor: headerColor,
      }}
    >
      <Stack.Screen name="index" options={{ title: '' }} />
      <Stack.Screen name="my-recipes" options={{ title: '' }} />
      <Stack.Screen name="shopping-categories" options={{ title: '' }} />
    </Stack>
  )
}
