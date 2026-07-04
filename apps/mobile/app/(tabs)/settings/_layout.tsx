import { Stack } from 'expo-router'

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: ' ',
        headerTransparent: true,
        headerShadowVisible: false,
        headerTitleAlign: 'left',
      }}
    />
  )
}
