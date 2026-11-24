import { memo, useCallback, useMemo } from 'react'
import { View } from 'react-native'
import { MenuView, type MenuAction } from '@react-native-menu/menu'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import Avatar from '../../components/Avatar'
import { AppText } from '../../components/ui'
import { styles } from './styles'

export type RecipeMember = {
  id: string
  name: string
  label?: string
  color?: string
}

const AVATAR_SIZE = 20

const RecipeMemberRow = ({ members, onDeleteRecipe }: { members: RecipeMember[]; onDeleteRecipe: () => void }) => {
  const { t } = useTranslation()
  const actions = useMemo<MenuAction[]>(
    () => [{ id: 'delete', title: t('common.delete'), image: 'trash', attributes: { destructive: true } }],
    [t],
  )

  const handleMenuAction = useCallback(
    ({ nativeEvent }: { nativeEvent: { event: string } }) => {
      if (nativeEvent.event === 'delete') onDeleteRecipe()
    },
    [onDeleteRecipe],
  )

  const handleOpenMenu = useCallback(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), [])

  return (
    <>
      {members.map((member) => (
        <MenuView
          key={member.id}
          title={t('recipes.recipeActions')}
          actions={actions}
          shouldOpenOnLongPress
          onOpenMenu={handleOpenMenu}
          onPressAction={handleMenuAction}
        >
          <View style={styles.memberChip} accessible accessibilityLabel={member.name}>
            <Avatar name={member.name} label={member.label} color={member.color} size={AVATAR_SIZE} />
            <AppText variant="subtitle" tone="textSecondary" numberOfLines={1}>
              {member.name}
            </AppText>
          </View>
        </MenuView>
      ))}
    </>
  )
}

export default memo(RecipeMemberRow)
