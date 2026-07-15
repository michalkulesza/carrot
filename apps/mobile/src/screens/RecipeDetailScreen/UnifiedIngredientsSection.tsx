import { useCallback, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { SaveComponent } from '@carrot/shared/types'
import {
  getImperialCupQty,
  scaleIngredientQuantity,
} from '@carrot/shared/utils/ingredientScaling'
import { styles } from './styles'
import IngredientRow from './IngredientRow'

interface UnifiedIngredient {
  componentIndex: number
  ingredientIndex: number
  ingredient: string
  cupHint: string
  shoppingListValue: string
}

const UnifiedIngredientsSection = ({
  components,
  unitSystem,
  servingScale,
  addMode,
  sessionAdded,
  onAdd,
  onAddAll,
  fontSize,
  lineHeight,
}: {
  components: SaveComponent[]
  unitSystem: string
  servingScale: number
  addMode: boolean
  sessionAdded: Set<string>
  onAdd: (key: string, text: string) => void
  onAddAll: (keys: string[], texts: string[]) => void
  fontSize: number
  lineHeight: number
}) => {
  const { t } = useTranslation()
  const ingredients = useMemo<UnifiedIngredient[]>(
    () =>
      components.flatMap((component, componentIndex) => {
        const values =
          unitSystem === 'imperial'
            ? (component.imperial_ingredients ?? component.ingredients)
            : (component.metric_ingredients ?? component.ingredients)

        return values.map((value, ingredientIndex) => {
          const ingredient = scaleIngredientQuantity(value, servingScale)
          const originalValue =
            component.shopping_list_ingredients?.[ingredientIndex]
          const shoppingListValue =
            servingScale === 1 && originalValue ? originalValue : ingredient
          const cupQty =
            unitSystem === 'imperial'
              ? null
              : getImperialCupQty(
                  component.imperial_ingredients?.[ingredientIndex],
                  servingScale
                )
          const cupHint = cupQty
            ? ` (${cupQty} ${t('units.cup', { defaultValue: 'cup' })})`
            : ''

          return {
            componentIndex,
            ingredientIndex,
            ingredient,
            cupHint,
            shoppingListValue,
          }
        })
      }),
    [components, servingScale, unitSystem, t]
  )

  const allAdded =
    ingredients.length > 0 &&
    ingredients.every(({ componentIndex, ingredientIndex }) =>
      sessionAdded.has(`${componentIndex}-${ingredientIndex}`)
    )

  const handleAddAll = useCallback(() => {
    const unaddedIngredients = ingredients.filter(
      ({ componentIndex, ingredientIndex }) =>
        !sessionAdded.has(`${componentIndex}-${ingredientIndex}`)
    )
    const keys = unaddedIngredients.map(
      ({ componentIndex, ingredientIndex }) =>
        `${componentIndex}-${ingredientIndex}`
    )
    const texts = unaddedIngredients.map(
      ({ shoppingListValue }) => shoppingListValue
    )

    if (texts.length > 0) onAddAll(keys, texts)
  }, [ingredients, onAddAll, sessionAdded])

  if (ingredients.length === 0) return null

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>
          {t('recipes.sectionIngredients')}
        </Text>
        {addMode && (
          <Pressable
            onPress={allAdded ? undefined : handleAddAll}
            hitSlop={8}
            accessibilityLabel={t('shoppingList.addAll')}
          >
            <Text style={[styles.addAllText, allAdded && styles.addAllDone]}>
              {allAdded
                ? t('shoppingList.addedToList')
                : t('shoppingList.addAll')}
            </Text>
          </Pressable>
        )}
      </View>
      {ingredients.map(
        ({
          componentIndex,
          ingredientIndex,
          ingredient,
          cupHint,
          shoppingListValue,
        }) => {
          const key = `${componentIndex}-${ingredientIndex}`

          return (
            <IngredientRow
              key={key}
              ingredient={ingredient}
              cupHint={cupHint}
              addMode={addMode}
              isAdded={sessionAdded.has(key)}
              onAdd={() => onAdd(key, shoppingListValue)}
              fontSize={fontSize}
              lineHeight={lineHeight}
            />
          )
        }
      )}
    </View>
  )
}

export default UnifiedIngredientsSection
