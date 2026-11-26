import { useMemo } from 'react'
import { Stack } from 'expo-router'
import { useResolvedColorScheme } from '../../../src/context/ColorSchemeContext'

const childScreenOptions = { title: '' }

export default function SettingsLayout() {
  const colorScheme = useResolvedColorScheme()
  const headerColor = colorScheme === 'dark' ? '#ffffff' : '#000000'
  const screenOptions = useMemo(
    () => ({
      headerBackTitle: ' ',
      headerTransparent: true,
      headerShadowVisible: false,
      headerTitleAlign: 'left' as const,
      headerTitleStyle: { color: headerColor },
      headerTintColor: headerColor,
    }),
    [headerColor],
  )

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={childScreenOptions} />
      <Stack.Screen name="my-recipes" options={childScreenOptions} />
      <Stack.Screen name="shopping-categories" options={childScreenOptions} />
    </Stack>
  )
}
