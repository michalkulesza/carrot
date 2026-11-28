import { memo } from 'react'
import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { HouseholdOut } from '@carrot/shared/types'
import Avatar from '../../components/Avatar'
import { AppText } from '../../components/ui'
import ColorSwatches from './ColorSwatches'
import { styles } from './styles'

const AVATAR_SIZE = 72

interface IdentityHeaderProps {
  household: HouseholdOut
  color: string
  memberCount: number
  onRename: () => void
  onSelectColor: (color: string) => void
}

const IdentityHeader = ({ household, color, memberCount, onRename, onSelectColor }: IdentityHeaderProps) => {
  const { t } = useTranslation()

  const summaryParts = [
    memberCount > 0 ? t('settings.peopleCount', { count: memberCount }) : null,
    t('settings.recipesSharedCount', { count: household.recipe_count }),
  ].filter(Boolean)
  const summary = summaryParts.join(' · ')

  return (
    <View style={styles.identity}>
      <Avatar name={household.name} color={color} size={AVATAR_SIZE} />
      <Pressable
        onPress={onRename}
        hitSlop={8}
        style={styles.nameButton}
        accessibilityRole="button"
        accessibilityLabel={t('settings.renameHousehold')}
        accessibilityValue={{ text: household.name }}
      >
        <AppText variant="screenTitle" numberOfLines={1}>
          {household.name}
        </AppText>
      </Pressable>
      <AppText variant="meta" tone="textSecondary">
        {summary}
      </AppText>
      <ColorSwatches color={color} onSelect={onSelectColor} />
    </View>
  )
}

export default memo(IdentityHeader)
