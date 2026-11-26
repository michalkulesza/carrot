import { memo, useCallback, useMemo, useState } from 'react'
import { Pressable } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { AppText, CheckboxCircle } from '../../components/ui'
import AllergenBadge from './AllergenBadge'
import IngredientAllergenAction from './IngredientAllergenAction'
import IngredientLinkButton from './IngredientLinkButton'
import { useIngredientSwapActions } from './IngredientSwapContext'
import SwapChip from './SwapChip'
import SwapHighlight from './SwapHighlight'
import SwapNameBlock from './SwapNameBlock'
import { createUnitTranslator, matchesActiveAllergen, splitIngredient, type IngredientEntry, type ReadingMetrics } from './helpers'
import { styles } from './styles'
import { isAppliedEntry, isSwappableEntry } from './swapHelpers'
import { useGroceryRowAnimation, type GroceryModeTransition } from './useGroceryRowAnimation'
import { useIngredientAllergenLabels, useLinkedAllergenText } from './useIngredientAllergenLabels'
import type { SwapRewrite } from './useSwapRewriteAnimation'

const ROW_CHECKBOX_SIZE = 26

interface IngredientRowProps {
  entry: IngredientEntry
  isLast: boolean
  groceryMode: boolean
  modeTransition: GroceryModeTransition
  selected: boolean
  onToggleSelected: (key: string) => void
  activeAllergens: string[]
  metrics: ReadingMetrics
  onTooltipOpenChange: (open: boolean) => void
  linkedRecipeTitle: string | undefined
  highlighted: boolean
  rewrite: SwapRewrite | undefined
  swapBusy: boolean
}

const IngredientRow = ({
  entry,
  isLast,
  groceryMode,
  modeTransition,
  selected,
  onToggleSelected,
  activeAllergens,
  metrics,
  onTooltipOpenChange,
  linkedRecipeTitle,
  highlighted,
  rewrite,
  swapBusy,
}: IngredientRowProps) => {
  const { t } = useTranslation()
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const swapActions = useIngredientSwapActions()

  const { key, ingredient, cupHint, allergenFlag } = entry
  const { fontSize, ingredientLineHeight } = metrics

  const { quantity, name } = useMemo(
    () => splitIngredient(ingredient, createUnitTranslator(t)),
    [ingredient, t],
  )

  const applied = isAppliedEntry(entry)
  const swappable = isSwappableEntry(entry, activeAllergens)
  const hasMatchedAllergen = matchesActiveAllergen(allergenFlag?.allergen ?? null, activeAllergens)
  const swapRewrite = applied && rewrite?.direction === 'swap' ? rewrite : undefined
  const restoreRewrite = !applied && rewrite?.direction === 'restore' ? rewrite : undefined
  const needsAllergenLabels = swappable || applied || hasMatchedAllergen || rewrite !== undefined
  const labels = useIngredientAllergenLabels(entry, name, needsAllergenLabels)
  const linkedAllergenText = useLinkedAllergenText(entry, activeAllergens)
  const hasLink = Boolean(entry.linkedRecipeUrl)
  const cupHintLabel = cupHint ? `(${cupHint})` : null
  const showBadge = hasMatchedAllergen && !applied && !restoreRewrite
  const swapDisabled = groceryMode || swapBusy || rewrite !== undefined

  const animation = useGroceryRowAnimation(modeTransition, groceryMode, selected)

  const rowStyle = useMemo(
    () => [
      styles.readIngredientRow,
      !isLast && styles.ingredientRowDivider,
      tooltipOpen && styles.raised,
    ],
    [isLast, tooltipOpen],
  )
  const quantityStyle = useMemo(
    () => [
      styles.readIngredientQuantity,
      { fontSize, lineHeight: ingredientLineHeight },
      animation.quantityStyle,
    ],
    [fontSize, ingredientLineHeight, animation.quantityStyle],
  )
  const leadingStyle = useMemo(() => [styles.readIngredientLeading, animation.leadingStyle], [animation.leadingStyle])
  const bodyStyle = useMemo(() => [styles.readIngredientBody, animation.bodyStyle], [animation.bodyStyle])
  const checkboxStyle = useMemo(
    () => [styles.readIngredientCheckbox, animation.checkboxStyle],
    [animation.checkboxStyle],
  )
  const nameStyle = useMemo(
    () => [styles.ingredientName, { fontSize, lineHeight: ingredientLineHeight }, animation.contentStyle],
    [fontSize, ingredientLineHeight, animation.contentStyle],
  )
  const chipWrapperStyle = useMemo(() => [styles.swapChipFade, animation.chipStyle], [animation.chipStyle])
  const accessibilityState = useMemo(() => ({ checked: selected }), [selected])

  const handleTooltipOpenChange = useCallback(
    (open: boolean) => {
      setTooltipOpen(open)
      onTooltipOpenChange(open)
    },
    [onTooltipOpenChange],
  )

  const handleToggleSelected = useCallback(() => onToggleSelected(key), [onToggleSelected, key])
  const handleOpenSwap = useCallback(() => swapActions.onOpenSwap(key), [swapActions, key])
  const handleUndoSwap = useCallback(() => swapActions.onUndoSwap(key), [swapActions, key])

  const swapChip = labels ? (
    <Animated.View style={chipWrapperStyle}>
      <SwapChip
        label={labels.swapChipLabel}
        highlighted={highlighted}
        accessibilityLabel={labels.swapChipAccessibility}
        disabled={swapDisabled}
        onPress={handleOpenSwap}
      />
    </Animated.View>
  ) : null

  const nameContent = labels ? (
    <SwapNameBlock
      name={name}
      nameStyle={nameStyle}
      applied={applied}
      swapRewrite={swapRewrite}
      restoreRewrite={restoreRewrite}
      originalName={labels.originalName}
      substituteName={labels.substituteName}
      swapChipLabel={labels.swapChipLabel}
      swapDisabled={swapDisabled}
      onUndo={handleUndoSwap}
      restoreChip={swapChip}
    />
  ) : (
    <Animated.Text style={nameStyle}>{name}</Animated.Text>
  )

  const allergenAction =
    labels && !restoreRewrite ? (
      <IngredientAllergenAction
        swappable={swappable}
        showBadge={showBadge}
        swapChip={swapChip}
        labels={labels}
        onTooltipOpenChange={handleTooltipOpenChange}
      />
    ) : null

  return (
    <Pressable
      style={rowStyle}
      disabled={!groceryMode}
      onPress={handleToggleSelected}
      accessible={groceryMode}
      accessibilityRole={groceryMode ? 'checkbox' : undefined}
      accessibilityLabel={groceryMode ? ingredient : undefined}
      accessibilityState={groceryMode ? accessibilityState : undefined}
    >
      {highlighted ? <SwapHighlight /> : null}
      <Animated.View style={leadingStyle}>
        <Animated.View style={checkboxStyle} pointerEvents="none">
          <CheckboxCircle checked={selected} itemKey={key} size={ROW_CHECKBOX_SIZE} />
        </Animated.View>
        <Animated.Text style={quantityStyle} numberOfLines={3}>
          {quantity}
        </Animated.Text>
      </Animated.View>
      <Animated.View style={bodyStyle}>
        {nameContent}
        {cupHintLabel ? (
          <AppText variant="meta" tone="textTertiary">
            {cupHintLabel}
          </AppText>
        ) : null}
        {linkedAllergenText ? (
          <AllergenBadge label={linkedAllergenText} accessibilityLabel={linkedAllergenText} />
        ) : null}
        {allergenAction}
      </Animated.View>
      {hasLink ? (
        <IngredientLinkButton
          entry={entry}
          linkedRecipeTitle={linkedRecipeTitle}
          hidden={groceryMode}
          columnAnimatedStyle={animation.linkColumnStyle}
          buttonAnimatedStyle={animation.linkStyle}
        />
      ) : null}
    </Pressable>
  )
}

export default memo(IngredientRow)
