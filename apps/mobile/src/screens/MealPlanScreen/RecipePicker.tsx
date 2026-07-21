import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { ListRenderItemInfo, PlatformColor, Pressable, Text, View } from 'react-native'
import { BottomSheetModal, BottomSheetFlatList, BottomSheetTextInput, BottomSheetBackdrop, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { RecipeOut } from '@carrot/shared/types'
import NetworkImage from '../../components/NetworkImage'
import { proxyThumbnailUrl } from '../../api/thumbnailUrl'
import { styles } from './styles'

interface RecipePickerProps {
  currentRecipeId: string | null
  recipes: RecipeOut[]
  onAddText: (text: string) => void
  onPick: (recipeId: string) => void
  onRemove: () => void
  onClose: () => void
}

export interface RecipePickerHandle {
  present: () => void
  dismiss: () => void
}

const SNAP_POINTS = ['60%']

const RecipePicker = forwardRef<RecipePickerHandle, RecipePickerProps>(({
  currentRecipeId,
  recipes,
  onAddText,
  onPick,
  onRemove,
  onClose,
}, ref) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [plainText, setPlainText] = useState('')
  const [search, setSearch] = useState('')
  const sheetRef = useRef<BottomSheetModal>(null)

  useImperativeHandle(ref, () => ({
    present: () => sheetRef.current?.present(),
    dismiss: () => sheetRef.current?.dismiss(),
  }))

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return recipes
    return recipes.filter((r) => r.title.toLowerCase().includes(q))
  }, [recipes, search])

  const handleClose = useCallback(() => {
    setPlainText('')
    setSearch('')
    onClose()
  }, [onClose])

  const handleRemovePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setPlainText('')
    setSearch('')
    onRemove()
  }, [onRemove])

  const handleAddText = useCallback(() => {
    const text = plainText.trim()
    if (!text) return

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setPlainText('')
    onAddText(text)
  }, [onAddText, plainText])

  const getPickerItemStyle = useCallback(
    (active: boolean) => ({ pressed }: { pressed: boolean }) => [
      styles.pickerItem,
      active && styles.pickerItemActive,
      pressed && { opacity: 0.7 },
    ],
    [],
  )

  const getRemoveButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.removeButton, pressed && { opacity: 0.7 }],
    [],
  )

  const getPlainTextAddButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.plainTextAddButton,
      !plainText.trim() && styles.plainTextAddButtonDisabled,
      pressed && { opacity: 0.7 },
    ],
    [plainText],
  )

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<RecipeOut>) => {
      const thumbUri = proxyThumbnailUrl(item.thumbnail_url)
      const isActive = item.id === currentRecipeId
      const handlePress = () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        setSearch('')
        onPick(item.id)
      }

      return (
        <Pressable
          style={getPickerItemStyle(isActive)}
          onPress={handlePress}
          accessibilityLabel={item.title}
          accessibilityRole="button"
        >
          {thumbUri ? (
            <NetworkImage uri={thumbUri} style={styles.pickerItemThumb} recyclingKey={thumbUri} />
          ) : (
            <View style={styles.pickerItemThumbPlaceholder} />
          )}
          <Text
            style={[styles.pickerItemText, isActive && styles.pickerItemTextActive]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
        </Pressable>
      )
    },
    [currentRecipeId, onPick, getPickerItemStyle],
  )

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose
      topInset={insets.top}
      onDismiss={handleClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.sheetHandle}
    >
      <View style={styles.plainTextEntry}>
        <BottomSheetTextInput
          style={styles.plainTextInput}
          placeholder={t('mealPlan.quickEntryPlaceholder')}
          placeholderTextColor={PlatformColor('placeholderText') as unknown as string}
          value={plainText}
          onChangeText={setPlainText}
          autoCapitalize="sentences"
          autoCorrect
          maxLength={200}
          returnKeyType="done"
          onSubmitEditing={handleAddText}
          accessibilityLabel={t('mealPlan.quickEntryPlaceholder')}
        />
        <Pressable
          style={getPlainTextAddButtonStyle}
          onPress={handleAddText}
          disabled={!plainText.trim()}
          accessibilityLabel={t('mealPlan.addMeal')}
          accessibilityRole="button"
        >
          <Text style={styles.plainTextAddButtonText}>{t('mealPlan.addMeal')}</Text>
        </Pressable>
      </View>
      <View style={styles.pickerSearchContainer}>
        <Ionicons name="search" size={17} color={PlatformColor('secondaryLabel') as unknown as string} />
        <BottomSheetTextInput
          style={styles.pickerSearch}
          placeholder={t('mealPlan.searchRecipes')}
          placeholderTextColor={PlatformColor('placeholderText') as unknown as string}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          accessibilityLabel={t('mealPlan.searchRecipes')}
        />
      </View>

      {currentRecipeId && (
        <Pressable
          style={getRemoveButtonStyle}
          onPress={handleRemovePress}
          accessibilityLabel={t('mealPlan.removeFromPlan')}
          accessibilityRole="button"
        >
          <Text style={styles.removeButtonText}>{t('mealPlan.removeFromPlan')}</Text>
        </Pressable>
      )}

      {filtered.length === 0 ? (
        <View style={styles.pickerEmpty}>
          <Text style={styles.pickerEmptyText}>
            {recipes.length === 0
              ? t('mealPlan.noRecipesYet')
              : t('mealPlan.noRecipesMatch')}
          </Text>
        </View>
      ) : (
        <BottomSheetFlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={styles.pickerList}
        />
      )}
    </BottomSheetModal>
  )
})

export default RecipePicker
