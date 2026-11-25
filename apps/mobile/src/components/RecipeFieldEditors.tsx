import { useCallback } from 'react'
import {
  Alert,
  PlatformColor,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import type { AllergenFlag } from '@carrot/shared/types'
import type { StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'
import { colors } from '../theme/colors'

export const IngredientEditor = ({
  value,
  flag,
  activeAllergens,
  onChange,
  onQtyUnitPress,
  onReplace,
  onRestore,
  onRemove,
  categoryLabel,
  onCategoryPress,
}: {
  value: StructuredIngredient
  flag: AllergenFlag | null
  activeAllergens: string[]
  onChange: (v: StructuredIngredient) => void
  onQtyUnitPress: () => void
  onReplace: () => void
  onRestore: () => void
  onRemove?: () => void
  categoryLabel?: string
  onCategoryPress?: () => void
}) => {
  const { t } = useTranslation()

  const isAllergenActive = flag?.allergen
    ? activeAllergens.some((a) => {
        const fa = flag.allergen!.toLowerCase()
        const la = a.toLowerCase()
        return fa === la || fa.includes(la) || la.includes(fa)
      })
    : false

  const handleAllergenPress = useCallback(() => {
    if (!flag?.allergen) return

    const title = `${t('recipes.contains')}: ${flag.allergen}`

    if (flag.substitute_applied && flag.original_display) {
      const message = `${t('recipes.originally')} ${flag.original_display}, ${t('recipes.replacedWith')} ${flag.substitute} ${t('recipes.dueTo')} ${flag.allergen}.`
      Alert.alert(title, message, [
        { text: t('recipes.restoreOriginal'), onPress: onRestore },
        { text: t('common.cancel'), style: 'cancel' },
      ])
    } else if (flag.substitute) {
      const message = `${t('recipes.suggestedSubstitute')} ${flag.substitute}`
      Alert.alert(title, message, [
        { text: t('recipes.replace'), onPress: onReplace },
        { text: t('recipes.keepOriginal'), style: 'cancel' },
      ])
    } else {
      Alert.alert(title, t('recipes.noSubstituteAvailable'))
    }
  }, [flag, onRestore, onReplace, t])

  const getRemoveButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.ingRemoveBtn, pressed && styles.pressedMedium],
    [],
  )
  const getQtyUnitButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.ingQtyUnitBtn, pressed && styles.pressedLight],
    [],
  )
  const getCategoryButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.ingCategoryBtn, pressed && styles.pressedLight],
    [],
  )
  const getAllergenBadgeStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.allergenBadge, pressed && styles.pressedLight],
    [],
  )

  const handleNameChange = useCallback((name: string) => onChange({ ...value, name }), [value, onChange])

  const qtyUnitLabel = [value.qty, value.unit].filter(Boolean).join(' ')
  const qtyUnitAccessibilityLabel = qtyUnitLabel || `${t('units.qtyLabel')} ${t('units.unitLabel')}`
  const allergenAccessibilityLabel = flag?.allergen ? `${t('recipes.contains')} ${flag.allergen}` : ''

  return (
    <View style={styles.ingEditor}>
      <View style={styles.ingRow}>
        {onRemove && (
          <Pressable
            style={getRemoveButtonStyle}
            onPress={onRemove}
            hitSlop={11}
            accessibilityLabel={t('addRecipe.removeIngredient')}
          >
            <Text style={styles.ingRemoveText}>−</Text>
          </Pressable>
        )}
        <Pressable
          style={getQtyUnitButtonStyle}
          onPress={onQtyUnitPress}
          hitSlop={10}
          accessibilityLabel={qtyUnitAccessibilityLabel}
        >
          <Text style={[styles.ingQtyUnitText, !qtyUnitLabel && styles.ingPlaceholder]}>
            {qtyUnitLabel || '—'}
          </Text>
        </Pressable>
        {categoryLabel && onCategoryPress ? (
          <Pressable
            style={getCategoryButtonStyle}
            onPress={onCategoryPress}
            hitSlop={10}
            accessibilityLabel={categoryLabel}
          >
            <Text style={styles.ingCategoryText} numberOfLines={1}>
              {categoryLabel}
            </Text>
          </Pressable>
        ) : null}
        <TextInput
          style={styles.ingName}
          value={value.name}
          onChangeText={handleNameChange}
          keyboardType="default"
          returnKeyType="done"
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="none"
          accessibilityLabel={t('addRecipe.ingredientName')}
        />
        {isAllergenActive && (
          <Pressable
            style={getAllergenBadgeStyle}
            onPress={handleAllergenPress}
            hitSlop={10}
            accessibilityLabel={allergenAccessibilityLabel}
          >
            <Text style={styles.allergenText}>⚠ {flag!.allergen}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  pressedLight: { opacity: 0.7 },
  pressedMedium: { opacity: 0.6 },

  ingEditor: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: PlatformColor('separator') as unknown as string,
    gap: 4,
  },
  ingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ingRemoveBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PlatformColor('systemRed') as unknown as string,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingRemoveText: { fontSize: 16, color: '#fff', fontWeight: '600', lineHeight: 20 },
  ingQtyUnitBtn: {
    borderBottomWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 56,
  },
  ingQtyUnitText: { fontSize: 13, lineHeight: 18, color: colors.brand, fontWeight: '600' },
  ingPlaceholder: { color: PlatformColor('tertiaryLabel') as unknown as string },
  ingName: {
    flex: 1,
    borderBottomWidth: 1,
    borderColor: PlatformColor('opaqueSeparator') as unknown as string,
    fontSize: 16,
    color: PlatformColor('label') as unknown as string,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  allergenBadge: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  ingCategoryBtn: {
    backgroundColor: PlatformColor('tertiarySystemFill') as unknown as string,
    borderRadius: 6,
    maxWidth: 88,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  ingCategoryText: {
    color: PlatformColor('secondaryLabel') as unknown as string,
    fontSize: 12,
    lineHeight: 16,
  },
  allergenText: { fontSize: 11, lineHeight: 13, color: '#92400e', fontWeight: '600' },
})
