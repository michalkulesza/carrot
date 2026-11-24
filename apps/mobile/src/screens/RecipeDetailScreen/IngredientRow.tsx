import { memo, useCallback, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { getIngredientQuantityCount } from '@carrot/shared/utils/ingredientUtils'
import { normalizeAllergenKey } from '@carrot/shared/utils/allergenKeys'
import { AppText, LinkChip } from '../../components/ui'
import AddToListButton from './AddToListButton'
import AllergenBadge from './AllergenBadge'
import { getSourceHost, matchesActiveAllergen, splitIngredient, type IngredientEntry, type ReadingMetrics } from './helpers'
import { styles } from './styles'
import { useIngredientLink } from './useIngredientLink'

type LinkedRecipePreview = Pick<RecipeOut, 'title' | 'thumbnail_url'>

interface IngredientRowProps {
  recipeId: string
  entry: IngredientEntry
  linkedRecipe: LinkedRecipePreview | undefined
  isLast: boolean
  addMode: boolean
  isAdded: boolean
  onAdd: (key: string, shoppingListValue: string, shoppingCategory: IngredientEntry['shoppingCategory']) => void
  activeAllergens: string[]
  metrics: ReadingMetrics
  onTooltipOpenChange: (open: boolean) => void
}

const COUNTABLE_UNITS = ['cl', 'piece', 'sprig', 'leaf', 'sheet']

const IngredientRow = ({
  recipeId,
  entry,
  linkedRecipe,
  isLast,
  addMode,
  isAdded,
  onAdd,
  activeAllergens,
  metrics,
  onTooltipOpenChange,
}: IngredientRowProps) => {
  const { t } = useTranslation()
  const [tooltipOpen, setTooltipOpen] = useState(false)

  const { key, ingredient, cupHint, shoppingListValue, shoppingCategory, allergenFlag, linkedAllergens } = entry
  const { fontSize, ingredientLineHeight } = metrics

  const { quantity, name } = useMemo(
    () =>
      splitIngredient(ingredient, (unit, qty) =>
        t(`units.${unit}`, {
          count: COUNTABLE_UNITS.includes(unit) && qty ? getIngredientQuantityCount(qty) : 1,
          defaultValue: unit,
        }),
      ),
    [ingredient, t],
  )

  const link = useIngredientLink({
    recipeId,
    url: entry.linkedRecipeUrl,
    kind: entry.linkedRecipeKind,
    linkedRecipeId: entry.linkedRecipeId,
  })

  const hasMatchedAllergen = matchesActiveAllergen(allergenFlag?.allergen ?? null, activeAllergens)
  const allergenName = allergenFlag?.allergen
    ? t(`allergens.${normalizeAllergenKey(allergenFlag.allergen)}`, { defaultValue: allergenFlag.allergen })
    : ''
  const substitute = allergenFlag?.substitute ?? null
  const allergenLabel = substitute ? t('recipes.allergenSwap', { allergen: allergenName, substitute }) : allergenName
  const allergenTooltip = substitute
    ? `${t('recipes.suggestedSubstitute')} ${substitute}`
    : t('recipes.noSubstituteAvailable')

  const linkedAllergenLabels = (linkedAllergens ?? [])
    .filter((allergen) => matchesActiveAllergen(allergen, activeAllergens))
    .map((allergen) => t(`allergens.${normalizeAllergenKey(allergen)}`, { defaultValue: allergen }))
  const linkedAllergenText = `${t('recipes.fromLinkedRecipe')}: ${linkedAllergenLabels.join(', ')}`

  const rowStyle = useMemo(
    () => [styles.ingredientRow, !isLast && styles.ingredientRowDivider, tooltipOpen && styles.raised],
    [isLast, tooltipOpen],
  )
  const quantityStyle = useMemo(
    () => [styles.ingredientQuantity, { fontSize, lineHeight: ingredientLineHeight }],
    [fontSize, ingredientLineHeight],
  )
  const nameStyle = useMemo(() => [styles.ingredientName, { fontSize, lineHeight: ingredientLineHeight }], [fontSize, ingredientLineHeight])

  const handleTooltipOpenChange = useCallback(
    (open: boolean) => {
      setTooltipOpen(open)
      onTooltipOpenChange(open)
    },
    [onTooltipOpenChange],
  )

  const handleAdd = useCallback(() => onAdd(key, shoppingListValue, shoppingCategory), [onAdd, key, shoppingListValue, shoppingCategory])

  const hasLink = Boolean(entry.linkedRecipeUrl)
  const isWebLink = link.isExternal
  const linkHost = isWebLink ? getSourceHost(entry.linkedRecipeUrl) : null
  const linkLabel = isWebLink ? linkHost ?? link.fallbackLabel : linkedRecipe?.title ?? link.fallbackLabel

  return (
    <View style={rowStyle}>
      <Text style={quantityStyle} numberOfLines={3}>
        {quantity}
      </Text>
      <View style={styles.ingredientBody}>
        <Text style={nameStyle}>{name}</Text>
        {cupHint ? (
          <AppText variant="meta" tone="textTertiary">
            {`(${cupHint})`}
          </AppText>
        ) : null}
        {hasLink ? (
          <LinkChip
            variant={isWebLink ? 'web' : 'recipe'}
            label={linkLabel}
            imageUrl={linkedRecipe?.thumbnail_url ?? null}
            onPress={link.handlePress}
            disabled={!isWebLink && link.isBusy}
            accessibilityLabel={link.fallbackLabel}
          />
        ) : null}
        {linkedAllergenLabels.length > 0 ? (
          <AllergenBadge label={linkedAllergenText} accessibilityLabel={linkedAllergenText} />
        ) : null}
        {hasMatchedAllergen ? (
          <AllergenBadge
            label={allergenLabel}
            accessibilityLabel={`${t('recipes.contains')}: ${allergenName}`}
            tooltipHeader={allergenName}
            tooltipText={allergenTooltip}
            onTooltipOpenChange={handleTooltipOpenChange}
          />
        ) : null}
      </View>
      {addMode ? <AddToListButton added={isAdded} onAdd={handleAdd} /> : null}
    </View>
  )
}

export default memo(IngredientRow)
