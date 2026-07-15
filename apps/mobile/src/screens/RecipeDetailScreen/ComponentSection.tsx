import { useCallback, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import type { RecipeOut, SaveComponent, StepIngredientRef } from '@carrot/shared/types'
import { buildClientStepRefs } from '@carrot/shared/utils/ingredientUtils'
import {
  getImperialCupQty,
  scaleIngredientQuantity,
} from '@carrot/shared/utils/ingredientScaling'
import { styles } from './styles'
import { colors } from '../../theme/colors'
import { capitalizeFirst } from './helpers'
import IngredientRow from './IngredientRow'
import StepRow from './StepRow'

const ComponentSection = ({
  component,
  index,
  recipe,
  addMode = false,
  showStepQty = true,
  unitSystem,
  servingScale = 1,
  sessionAdded,
  onAdd,
  onAddAll,
  fontSize = 17,
  lineHeight = 22,
  collapsible = false,
  showIngredients = true,
  showGroupHeader = true,
}: {
  component: SaveComponent
  index: number
  recipe: RecipeOut
  addMode?: boolean
  showStepQty?: boolean
  unitSystem: string
  servingScale?: number
  sessionAdded?: Set<string>
  onAdd?: (key: string, text: string) => void
  onAddAll?: (keys: string[], texts: string[]) => void
  fontSize?: number
  lineHeight?: number
  collapsible?: boolean
  showIngredients?: boolean
  showGroupHeader?: boolean
}) => {
  const { t } = useTranslation()
  const [ingredientsExpanded, setIngredientsExpanded] = useState(!collapsible)
  const ingredientValues = unitSystem === 'imperial'
    ? component.imperial_ingredients ?? component.ingredients
    : component.metric_ingredients ?? component.ingredients
  const steps = unitSystem === 'imperial'
    ? component.imperial_steps ?? component.steps
    : component.metric_steps ?? component.steps
  const ingredients = useMemo(
    () => ingredientValues.map((ingredient) => scaleIngredientQuantity(ingredient, servingScale)),
    [ingredientValues, servingScale],
  )

  const getCupHint = useCallback(
    (ingredientIndex: number) => {
      if (unitSystem === 'imperial') return ''
      const qty = getImperialCupQty(
        component.imperial_ingredients?.[ingredientIndex],
        servingScale,
      )
      return qty ? ` (${qty} ${t('units.cup', { defaultValue: 'cup' })})` : ''
    },
    [component.imperial_ingredients, servingScale, t, unitSystem],
  )

  const stepRefs = useMemo<StepIngredientRef[][]>(
    () =>
      component.step_ingredient_refs != null
        ? component.step_ingredient_refs
        : buildClientStepRefs(steps, ingredients),
    [component.step_ingredient_refs, steps, ingredients],
  )

  const getShoppingListValue = useCallback(
    (ingredient: string, ingredientIndex: number) => {
      const originalValue = component.shopping_list_ingredients?.[ingredientIndex]

      return servingScale === 1 && originalValue ? originalValue : ingredient
    },
    [component.shopping_list_ingredients, servingScale],
  )

  const handleAddAll = useCallback(() => {
    const keys: string[] = []
    const texts: string[] = []
    ingredients.forEach((ingredient, i) => {
      const key = `${index}-${i}`
      if (!sessionAdded?.has(key)) {
        keys.push(key)
        texts.push(getShoppingListValue(ingredient, i))
      }
    })
    if (texts.length > 0) onAddAll?.(keys, texts)
  }, [getShoppingListValue, ingredients, index, sessionAdded, onAddAll])

  const allAdded = useMemo(
    () => ingredients.length > 0 && ingredients.every((_, i) => sessionAdded?.has(`${index}-${i}`)),
    [ingredients, index, sessionAdded],
  )

  if (!showIngredients && steps.length === 0) return null

  return (
    <View style={styles.componentBlock}>
      {showGroupHeader && component.name && (
        <Text style={styles.componentName}>{capitalizeFirst(component.name)}</Text>
      )}

      {showIngredients && ingredients.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Pressable
              onPress={collapsible ? () => setIngredientsExpanded((current) => !current) : undefined}
              style={styles.sectionHeaderToggle}
              accessibilityRole="button"
              accessibilityState={collapsible ? { expanded: ingredientsExpanded } : undefined}
              hitSlop={8}
            >
              <Text style={styles.sectionLabel}>{t('recipes.sectionIngredients')}</Text>
              {collapsible && (
                <Feather
                  name={ingredientsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.secondaryLabel}
                  style={styles.sectionToggleIcon}
                />
              )}
            </Pressable>
            {addMode && (
              <Pressable
                onPress={allAdded ? undefined : handleAddAll}
                hitSlop={8}
                accessibilityLabel={t('shoppingList.addAll')}
              >
                <Text style={[styles.addAllText, allAdded && styles.addAllDone]}>
                  {allAdded ? t('shoppingList.addedToList') : t('shoppingList.addAll')}
                </Text>
              </Pressable>
            )}
          </View>
          {ingredientsExpanded && ingredients.map((ingredient, i) => (
            <IngredientRow
              key={i}
              ingredient={ingredient}
              cupHint={getCupHint(i)}
              addMode={addMode}
              isAdded={sessionAdded?.has(`${index}-${i}`) ?? false}
              onAdd={() => onAdd?.(
                `${index}-${i}`,
                getShoppingListValue(ingredient, i),
              )}
              fontSize={fontSize}
              lineHeight={lineHeight}
            />
          ))}
        </View>
      )}

      {steps.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('recipes.steps')}</Text>
          {steps.map((step, i) => (
            <StepRow
              key={i}
              step={step}
              index={i}
              recipe={recipe}
              componentIndex={index}
              stepRefs={stepRefs[i] ?? []}
              rawIngredients={ingredients}
              showStepQty={showStepQty}
              fontSize={fontSize}
              lineHeight={lineHeight}
            />
          ))}
        </View>
      )}
    </View>
  )
}

export default ComponentSection
