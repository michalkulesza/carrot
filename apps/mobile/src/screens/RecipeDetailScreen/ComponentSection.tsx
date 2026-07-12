import { useCallback, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Ingredient, RecipeOut, SaveComponent, StepIngredientRef } from '@carrot/shared/types'
import { buildClientStepRefs, serializeIngredient } from '@carrot/shared/utils/ingredientUtils'
import { styles } from './styles'
import { capitalizeFirst, formatForList } from './helpers'
import IngredientRow from './IngredientRow'
import StepRow from './StepRow'

const ComponentSection = ({
  component,
  index,
  recipe,
  addMode = false,
  showStepQty = true,
  unitSystem,
  sessionAdded,
  onAdd,
  onAddAll,
  fontSize = 17,
  lineHeight = 22,
}: {
  component: SaveComponent
  index: number
  recipe: RecipeOut
  addMode?: boolean
  showStepQty?: boolean
  unitSystem: string
  sessionAdded?: Set<string>
  onAdd?: (key: string, text: string) => void
  onAddAll?: (keys: string[], texts: string[]) => void
  fontSize?: number
  lineHeight?: number
}) => {
  const { t } = useTranslation()
  const ingredientValues = unitSystem === 'imperial'
    ? component.imperial_ingredients ?? component.ingredients
    : component.metric_ingredients ?? component.ingredients
  const steps = unitSystem === 'imperial'
    ? component.imperial_steps ?? component.steps
    : component.metric_steps ?? component.steps
  const ingredients = useMemo(
    () =>
      ingredientValues.map((raw) => {
        if (typeof raw === 'string') {
          return { qty: null, unit: null, name: raw } as Ingredient
        }
        return raw as Ingredient
      }),
    [ingredientValues],
  )

  const stepRefs = useMemo<StepIngredientRef[][]>(
    () =>
      component.step_ingredient_refs != null
        ? component.step_ingredient_refs
        : buildClientStepRefs(
            steps,
            ingredients.map((ing) => serializeIngredient(ing)),
          ),
    [component.step_ingredient_refs, steps, ingredients],
  )

  const handleAddAll = useCallback(() => {
    const keys: string[] = []
    const texts: string[] = []
    ingredients.forEach((ing, i) => {
      const key = `${index}-${i}`
      if (!sessionAdded?.has(key)) {
        keys.push(key)
        texts.push(formatForList(ing))
      }
    })
    if (texts.length > 0) onAddAll?.(keys, texts)
  }, [ingredients, index, sessionAdded, onAddAll])

  const allAdded = useMemo(
    () => ingredients.length > 0 && ingredients.every((_, i) => sessionAdded?.has(`${index}-${i}`)),
    [ingredients, index, sessionAdded],
  )

  return (
    <View style={styles.componentBlock}>
      {component.name ? (
        <Text style={styles.componentName}>{capitalizeFirst(component.name)}</Text>
      ) : null}

      {ingredients.length > 0 && (
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
          {ingredients.map((ing, i) => (
            <IngredientRow
              key={i}
              ingredient={ing}
              addMode={addMode}
              isAdded={sessionAdded?.has(`${index}-${i}`) ?? false}
              onAdd={() => onAdd?.(`${index}-${i}`, formatForList(ing))}
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
              rawIngredients={ingredients.map((ing) => serializeIngredient(ing))}
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
