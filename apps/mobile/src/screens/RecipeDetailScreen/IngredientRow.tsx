import { memo, useCallback, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { normalizeAllergenKey } from '@carrot/shared/utils/allergenKeys'
import { AppText, CheckboxCircle, LinkChip } from '../../components/ui'
import AllergenBadge from './AllergenBadge'
import { createUnitTranslator, getSourceHost, matchesActiveAllergen, splitIngredient, type IngredientEntry, type ReadingMetrics } from './helpers'
import { styles } from './styles'
import { useGroceryRowAnimation, type GroceryModeTransition } from './useGroceryRowAnimation'
import { useIngredientLink } from './useIngredientLink'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)
const ROW_CHECKBOX_SIZE = 22

type LinkedRecipePreview = Pick<RecipeOut, 'title' | 'thumbnail_url'>

interface IngredientRowProps {
  recipeId: string
  entry: IngredientEntry
  linkedRecipe: LinkedRecipePreview | undefined
  isLast: boolean
  groceryMode: boolean
  modeTransition: GroceryModeTransition
  checkboxesMounted: boolean
  selected: boolean
  onToggleSelected: (key: string) => void
  activeAllergens: string[]
  metrics: ReadingMetrics
  onTooltipOpenChange: (open: boolean) => void
}

const IngredientRow = ({
  recipeId,
  entry,
  linkedRecipe,
  isLast,
  groceryMode,
  modeTransition,
  checkboxesMounted,
  selected,
  onToggleSelected,
  activeAllergens,
  metrics,
  onTooltipOpenChange,
}: IngredientRowProps) => {
  const { t } = useTranslation()
  const [tooltipOpen, setTooltipOpen] = useState(false)

  const { key, ingredient, cupHint, allergenFlag, linkedAllergens } = entry
  const { fontSize, ingredientLineHeight } = metrics

  const { quantity, name } = useMemo(
    () => splitIngredient(ingredient, createUnitTranslator(t)),
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

  const animation = useGroceryRowAnimation(modeTransition, groceryMode, selected)

  const rowStyle = useMemo(
    () => [
      styles.ingredientRow,
      !isLast && styles.ingredientRowDivider,
      tooltipOpen && styles.raised,
      animation.rowStyle,
    ],
    [isLast, tooltipOpen, animation.rowStyle],
  )
  const quantityStyle = useMemo(
    () => [
      styles.ingredientQuantity,
      { fontSize, lineHeight: ingredientLineHeight },
      animation.quantityStyle,
    ],
    [fontSize, ingredientLineHeight, animation.quantityStyle],
  )
  const checkboxStyle = useMemo(
    () => [styles.ingredientCheckbox, animation.checkboxStyle],
    [animation.checkboxStyle],
  )
  const nameStyle = useMemo(
    () => [styles.ingredientName, { fontSize, lineHeight: ingredientLineHeight }],
    [fontSize, ingredientLineHeight],
  )

  const handleTooltipOpenChange = useCallback(
    (open: boolean) => {
      setTooltipOpen(open)
      onTooltipOpenChange(open)
    },
    [onTooltipOpenChange],
  )

  const handleToggleSelected = useCallback(() => onToggleSelected(key), [onToggleSelected, key])

  const accessibilityState = useMemo(() => ({ checked: selected }), [selected])

  const hasLink = Boolean(entry.linkedRecipeUrl)
  const isWebLink = link.isExternal
  const linkHost = isWebLink ? getSourceHost(entry.linkedRecipeUrl) : null
  const linkLabel = isWebLink ? linkHost ?? link.fallbackLabel : linkedRecipe?.title ?? link.fallbackLabel

  return (
    <AnimatedPressable
      style={rowStyle}
      disabled={!groceryMode}
      onPress={handleToggleSelected}
      accessibilityRole={groceryMode ? 'checkbox' : undefined}
      accessibilityLabel={groceryMode ? ingredient : undefined}
      accessibilityState={groceryMode ? accessibilityState : undefined}
    >
      <View style={styles.ingredientLeading}>
        {checkboxesMounted ? (
          <Animated.View style={checkboxStyle} pointerEvents="none">
            <CheckboxCircle checked={selected} itemKey={key} size={ROW_CHECKBOX_SIZE} />
          </Animated.View>
        ) : null}
        <Animated.Text style={quantityStyle} numberOfLines={3}>
          {quantity}
        </Animated.Text>
      </View>
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
    </AnimatedPressable>
  )
}

export default memo(IngredientRow)
