import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import type { HouseholdOut } from '@carrot/shared/types'
import { styles } from './styles'

const HouseholdsSection = ({
  households,
  activeHouseholdId,
  onManage,
  onCreateHousehold,
}: {
  households: HouseholdOut[]
  activeHouseholdId: string | null | undefined
  onManage: (household: HouseholdOut) => void
  onCreateHousehold: () => void
}) => {
  const { t } = useTranslation()

  return (
    <View style={styles.card}>
      {households.length === 0 ? (
        <Text style={styles.emptyHouseholds}>{t('settings.noHouseholds')}</Text>
      ) : (
        households.map((h, index) => (
          <View
            key={h.id}
            style={[
              styles.householdRow,
              index < households.length - 1 && styles.householdRowBorder,
            ]}
          >
            <View style={[styles.householdDot, { backgroundColor: h.color }]} />
            <View style={styles.householdInfo}>
              <Text style={styles.householdName}>{h.name}</Text>
              {h.id === activeHouseholdId && (
                <Text style={styles.householdActive}>{t('settings.active')}</Text>
              )}
            </View>
            <Pressable
              style={({ pressed }) => [styles.manageBtn, pressed && { opacity: 0.7 }]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                onManage(h)
              }}
              accessibilityLabel={t('settings.manage')}
              accessibilityRole="button"
            >
              <Text style={styles.manageBtnText}>{t('settings.manage')}</Text>
            </Pressable>
          </View>
        ))
      )}
      <Pressable
        style={({ pressed }) => [styles.newHouseholdRow, pressed && { opacity: 0.7 }]}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onCreateHousehold()
        }}
        accessibilityLabel={t('settings.newHousehold')}
        accessibilityRole="button"
      >
        <Text style={styles.newHouseholdText}>{t('settings.newHousehold')}</Text>
      </Pressable>
    </View>
  )
}

export default HouseholdsSection
