import { useCallback, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import type { RecipeOut, SaveComponent, StepIngredientRef } from '@carrot/shared/types'
import { buildClientStepRefs } from '@carrot/shared/utils/ingredientUtils'
import { scaleIngredientQuantity } from '@carrot/shared/utils/ingredientScaling'
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
  const [expanded, setExpanded] = useState(!collapsible)
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

  const groupName = capitalizeFirst(component.name) || t('recipes.sectionIngredients')

  if (!showIngredients && steps.length === 0) return null

  return (
    <View style={styles.componentBlock}>
      {showGroupHeader && collapsible ? (
        <Pressable
          onPress={() => setExpanded((current) => !current)}
          style={styles.componentToggle}
          accessibilityLabel={groupName}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={styles.componentToggleText}>{groupName}</Text>
          <Feather
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={22}
            color={colors.label}
          />
        </Pressable>
      ) : showGroupHeader && component.name ? (
        <Text style={styles.componentName}>{capitalizeFirst(component.name)}</Text>
      ) : null}

      {showIngredients && expanded && ingredients.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>{t('recipes.sectionIngredients')}</Text>
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
          {ingredients.map((ingredient, i) => (
            <IngredientRow
              key={i}
              ingredient={ingredient}
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

      {expanded && steps.length > 0 && (
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
