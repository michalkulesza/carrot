import { Stack } from 'expo-router'

export default function RecipesLayout() {
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
