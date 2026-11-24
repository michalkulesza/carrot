import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText, Button } from '../../components/ui'
import { space } from '../../theme'

interface BrowseEmptyProps {
  hasActiveFilters: boolean
  onClearFilters: () => void
  onAddRecipe: () => void
}

const BrowseEmpty = ({ hasActiveFilters, onClearFilters, onAddRecipe }: BrowseEmptyProps) => {
  const { t } = useTranslation()

  if (hasActiveFilters) {
    return (
      <View style={styles.container}>
        <AppText variant="cardTitle" style={styles.centered}>
          {t('browse.noRecipesMatch')}
        </AppText>
        <Button label={t('browse.clearFilters')} onPress={onClearFilters} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <AppText variant="cardTitle" style={styles.centered}>
        {t('recipes.addFirstRecipe')}
      </AppText>
      <AppText variant="meta" tone="textSecondary" style={styles.centered}>
        {t('recipes.addPrompt')}
      </AppText>
      <Button label={t('recipes.addARecipe')} onPress={onAddRecipe} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: space.xxl, alignItems: 'center', gap: space.md },
  centered: { textAlign: 'center' },
})

export default memo(BrowseEmpty)
