import { useLayoutEffect } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation } from 'expo-router'
import HeaderTitle from '../../components/HeaderTitle'
import ScrollEdgeEffectAnchor from '../../components/ScrollEdgeEffectAnchor'
import { styles } from './styles'

const ShoppingListHeaderTitle = () => {
  const { t } = useTranslation()

  return (
    <View style={styles.headerTitle}>
      <ScrollEdgeEffectAnchor />
      <HeaderTitle title={t('shoppingList.title')} />
    </View>
  )
}

const renderShoppingListHeaderTitle = () => <ShoppingListHeaderTitle />

export const useShoppingListHeader = () => {
  const navigation = useNavigation()

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: renderShoppingListHeaderTitle })
  }, [navigation])
}
