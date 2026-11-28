import { memo, useMemo } from 'react'
import { Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import type { SaveComponent } from '@carrot/shared/types'
import { allergenShortLabel } from '@carrot/shared/utils/allergenKeys'
import { palette } from '../../theme'
import { collectMatchedAllergens } from './helpers'
import { styles } from './styles'

const ICON_SIZE = 18

interface AllergenSummaryBoxProps {
  components: SaveComponent[]
  activeAllergens: string[]
  uncertain: boolean
}

const AllergenSummaryBox = ({ components, activeAllergens, uncertain }: AllergenSummaryBoxProps) => {
  const { t } = useTranslation()

  const allergenNames = useMemo(
    () =>
      collectMatchedAllergens(components, activeAllergens).map((allergen) =>
        allergenShortLabel(t, 'allergens', allergen).toLowerCase(),
      ),
    [components, activeAllergens, t],
  )

  if (allergenNames.length === 0 && !uncertain) return null

  const title =
    allergenNames.length > 0
      ? t('recipes.allergenSummaryContains', { allergens: allergenNames.join(', ') })
      : t('recipes.allergenSummaryIncompleteTitle')
  const accessibilityLabel = [title, uncertain ? t('recipes.allergenSummaryIncomplete') : null].filter(Boolean).join('. ')

  return (
    <View style={styles.allergenBox} accessible accessibilityLabel={accessibilityLabel}>
      <View style={styles.allergenBoxIcon}>
        <SymbolView name="exclamationmark.triangle" size={ICON_SIZE} tintColor={palette.allergenText} />
      </View>
      <View style={styles.allergenBoxTexts}>
        <Text style={styles.allergenBoxTitle}>{title}</Text>
        {uncertain ? <Text style={styles.allergenBoxBody}>{t('recipes.allergenSummaryIncomplete')}</Text> : null}
      </View>
    </View>
  )
}

export default memo(AllergenSummaryBox)
