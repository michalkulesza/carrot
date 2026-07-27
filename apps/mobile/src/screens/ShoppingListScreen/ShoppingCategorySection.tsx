import { Pressable, Text, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import type { ShoppingCategory } from '@carrot/shared/types'
import { colors } from '../../theme/colors'
import { sectionStyles } from './sectionStyles'

const ShoppingCategorySection = ({
  category,
  activeCount,
  collapsed,
  onToggle,
}: {
  category: ShoppingCategory
  activeCount: number
  collapsed: boolean
  onToggle: () => void
}) => {
  const { t } = useTranslation()
  const title = t(`shoppingList.categories.${category}`)

  return (
    <Pressable
      style={sectionStyles.header}
      onPress={onToggle}
      accessibilityLabel={title}
      accessibilityState={{ expanded: !collapsed }}
    >
      <View>
        <Text style={sectionStyles.title}>{title}</Text>
        <Text style={sectionStyles.count}>{activeCount}</Text>
      </View>
      <Feather
        name={collapsed ? 'chevron-down' : 'chevron-up'}
        size={20}
        color={colors.secondaryLabel}
      />
    </Pressable>
  )
}

export default ShoppingCategorySection
