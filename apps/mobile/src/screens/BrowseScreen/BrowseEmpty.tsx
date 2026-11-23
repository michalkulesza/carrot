import { memo } from 'react'
import { Pressable, type PressableStateCallbackType, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { styles } from './styles'

interface BrowseEmptyProps {
  filterFavourites: boolean
  selectedTagCount: number
  onClearFilters: () => void
  onAddRecipe: () => void
}

const getClearStyle = ({ pressed }: PressableStateCallbackType) => [pressed && { opacity: 0.7 }]
const getAddStyle = ({ pressed }: PressableStateCallbackType) => [styles.addRecipeButton, pressed && { opacity: 0.8 }]

const BrowseEmpty = ({ filterFavourites, selectedTagCount, onClearFilters, onAddRecipe }: BrowseEmptyProps) => {
  const { t } = useTranslation()
  const canClearFilters = selectedTagCount > 0 || filterFavourites
  const isTrulyEmpty = !canClearFilters
  const emptyLabel = filterFavourites
    ? t('recipes.noFavourites')
    : selectedTagCount > 0
    ? t('recipes.noRecipesWithTag')
    : t('recipes.addFirstRecipe')

  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{emptyLabel}</Text>
      {isTrulyEmpty && <Text style={styles.emptySubtitle}>{t('recipes.addPrompt')}</Text>}
      {canClearFilters && (
        <Pressable
          onPress={onClearFilters}
          style={getClearStyle}
          accessibilityLabel={t('recipes.clearFilter')}
          accessibilityRole="button"
        >
          <Text style={styles.clearFilter}>{t('recipes.clearFilter')}</Text>
        </Pressable>
      )}
      {isTrulyEmpty && (
        <Pressable
          onPress={onAddRecipe}
          style={getAddStyle}
          accessibilityLabel={t('recipes.addARecipe')}
          accessibilityRole="button"
        >
          <Text style={styles.addRecipeButtonText}>{t('recipes.addARecipe')}</Text>
        </Pressable>
      )}
    </View>
  )
}

export default memo(BrowseEmpty)
