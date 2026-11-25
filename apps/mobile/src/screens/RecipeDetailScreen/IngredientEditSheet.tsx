import { memo, useCallback, useRef } from 'react'
import { Pressable, ScrollView, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SHOPPING_CATEGORIES, UNITS, type ShoppingCategory } from '@carrot/shared/types'
import type { StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'
import { lightHaptic } from '../../components/ui/haptics'
import EditSheet from './EditSheet'
import EditSheetInput from './EditSheetInput'
import { styles } from './styles'

interface IngredientEditSheetProps {
  visible: boolean
  ingredient: StructuredIngredient | null
  category: ShoppingCategory
  canRemove: boolean
  onChange: (ingredient: StructuredIngredient) => void
  onCategoryChange: (category: ShoppingCategory) => void
  onRemove: () => void
  onDismiss: () => void
}

interface ChipProps {
  label: string
  selected: boolean
  onPress: () => void
  boxStyle: StyleProp<ViewStyle>
  textStyle: StyleProp<TextStyle>
}

const Chip = ({ label, selected, onPress, boxStyle, textStyle }: ChipProps) => {
  const handlePress = useCallback(() => {
    lightHaptic()
    onPress()
  }, [onPress])

  const surfaceStyle = selected ? styles.chipSelected : styles.chipUnselected
  const labelStyle = selected ? styles.chipTextSelected : styles.chipTextUnselected

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={4}
      style={[boxStyle, surfaceStyle]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      <Text style={[textStyle, labelStyle]}>{label}</Text>
    </Pressable>
  )
}

interface UnitChipProps {
  unit: string
  label: string
  selected: boolean
  onSelect: (unit: string) => void
}

const UnitChip = ({ unit, label, selected, onSelect }: UnitChipProps) => {
  const handlePress = useCallback(() => onSelect(unit), [onSelect, unit])

  return (
    <Chip label={label} selected={selected} onPress={handlePress} boxStyle={styles.unitChip} textStyle={styles.unitChipText} />
  )
}

interface AisleChipProps {
  category: ShoppingCategory
  label: string
  selected: boolean
  onSelect: (category: ShoppingCategory) => void
}

const AisleChip = ({ category, label, selected, onSelect }: AisleChipProps) => {
  const handlePress = useCallback(() => onSelect(category), [onSelect, category])

  return (
    <Chip label={label} selected={selected} onPress={handlePress} boxStyle={styles.aisleChip} textStyle={styles.aisleChipText} />
  )
}

const EMPTY_INGREDIENT: StructuredIngredient = { qty: '', unit: '', name: '' }

const IngredientEditSheet = ({
  visible,
  ingredient,
  category,
  canRemove,
  onChange,
  onCategoryChange,
  onRemove,
  onDismiss,
}: IngredientEditSheetProps) => {
  const { t } = useTranslation()
  const lastIngredientRef = useRef(EMPTY_INGREDIENT)
  if (ingredient) lastIngredientRef.current = ingredient

  const shown = ingredient ?? lastIngredientRef.current

  const handleQtyChange = useCallback((qty: string) => onChange({ ...shown, qty }), [onChange, shown])
  const handleNameChange = useCallback((name: string) => onChange({ ...shown, name }), [onChange, shown])
  const handleUnitSelect = useCallback((unit: string) => onChange({ ...shown, unit }), [onChange, shown])

  return (
    <EditSheet
      visible={visible}
      title={t('recipes.editIngredient')}
      removeLabel={t('addRecipe.removeIngredient')}
      canRemove={canRemove}
      onRemove={onRemove}
      onDismiss={onDismiss}
    >
      <View style={styles.editSheetRow}>
        <EditSheetInput
          style={styles.editSheetQtyInput}
          value={shown.qty}
          onChangeText={handleQtyChange}
          placeholder={t('recipes.qtyPlaceholder')}
          keyboardType="decimal-pad"
          returnKeyType="done"
          autoCorrect={false}
          textContentType="none"
          accessibilityLabel={t('units.qtyLabel')}
        />
        <EditSheetInput
          style={styles.editSheetNameInput}
          value={shown.name}
          multiline
          submitBehavior="blurAndSubmit"
          onChangeText={handleNameChange}
          placeholder={t('recipes.ingredientPlaceholder')}
          keyboardType="default"
          returnKeyType="done"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="none"
          accessibilityLabel={t('addRecipe.ingredientName')}
        />
      </View>
      <ScrollView
        horizontal
        style={styles.unitChipScroll}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.unitChipRow}
      >
        <UnitChip unit="" label={t('units.none')} selected={shown.unit === ''} onSelect={handleUnitSelect} />
        {UNITS.map((unit) => (
          <UnitChip key={unit} unit={unit} label={t(`units.${unit}`)} selected={shown.unit === unit} onSelect={handleUnitSelect} />
        ))}
      </ScrollView>
      <Text style={styles.aisleLabel}>{t('recipes.shoppingAisle')}</Text>
      <View style={styles.aisleChips}>
        {SHOPPING_CATEGORIES.map((option) => (
          <AisleChip
            key={option}
            category={option}
            label={t(`shoppingList.categories.${option}`)}
            selected={category === option}
            onSelect={onCategoryChange}
          />
        ))}
      </View>
    </EditSheet>
  )
}

export default memo(IngredientEditSheet)
