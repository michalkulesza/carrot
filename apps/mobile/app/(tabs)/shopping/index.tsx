import { Pressable, View } from 'react-native'
import { Stack, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import BellModal from '../../../src/components/BellModal'
import ShoppingListScreen from '../../../src/screens/ShoppingListScreen'
import { colors } from '../../../src/theme/colors'

export default function ShoppingTab() {
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <>
      <Stack.Screen
        options={{
          title: t('nav.shopping'),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <BellModal />
              <Pressable
                onPress={() => router.push('/settings')}
                style={({ pressed }) => [{ paddingHorizontal: 4, paddingVertical: 4 }, pressed && { opacity: 0.7 }]}
                accessibilityLabel={t('nav.settings')}
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="settings" size={22} color={colors.secondaryLabel} />
              </Pressable>
            </View>
          ),
        }}
      />
      <ShoppingListScreen />
    </>
  )
}
