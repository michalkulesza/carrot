import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { BottomSheetFlatList, BottomSheetModal } from '@gorhom/bottom-sheet'
import { renderSheetBackdrop, sheetStyles } from '../../components/ui/sheet'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import {
  PICKER_SNAP_POINTS,
  PickerChip,
  PickerChipRow,
  PickerEmpty,
  PickerHeader,
  PickerSearchField,
  pickerStyles,
} from '../../components/PickerSheetParts'
import { CheckboxCircle, Thumbnail } from '../../components/ui'
import { lightHaptic } from '../../components/ui/haptics'
import { palette, typography } from '../../theme'
import { formatRecipeMeta } from './helpers'

interface RelatedRecipesPickerProps {
  visible: boolean
  candidates: RecipeOut[]
  selected: Set<string>
  disabled: boolean
  onToggle: (id: string) => void
  onDismiss: () => void
}

interface CandidateRowProps {
  recipe: RecipeOut
  selected: boolean
  disabled: boolean
  onToggle: (id: string) => void
}

const ROW_THUMB_SIZE = 52
const CHIP_THUMB_SIZE = 24

const CandidateRow = memo(({ recipe, selected, disabled, onToggle }: CandidateRowProps) => {
  const { t } = useTranslation()

  const meta = useMemo(() => formatRecipeMeta(recipe, t), [recipe, t])

  const handlePress = useCallback(() => {
    lightHaptic()
    onToggle(recipe.id)
  }, [onToggle, recipe.id])

  const titleStyle = selected ? styles.titleSelected : styles.title

  return (
    <Pressable
      style={styles.row}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={recipe.title}
      accessibilityState={{ checked: selected, disabled }}
    >
      <Thumbnail url={recipe.thumbnail_url} size={ROW_THUMB_SIZE} radiusKey="input" />
      <View style={styles.rowText}>
        <Text style={titleStyle} numberOfLines={1}>
          {recipe.title}
        </Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      <CheckboxCircle checked={selected} />
    </Pressable>
  )
})

const SelectedRecipeChip = ({ recipe, onToggle }: { recipe: RecipeOut; onToggle: (id: string) => void }) => {
  const { t } = useTranslation()

  const handleRemove = useCallback(() => onToggle(recipe.id), [onToggle, recipe.id])

  return (
    <PickerChip
      label={recipe.title}
      removeLabel={t('relatedRecipes.removeLink', { title: recipe.title })}
      onRemove={handleRemove}
      leading={<Thumbnail url={recipe.thumbnail_url} size={CHIP_THUMB_SIZE} radiusKey="badge" />}
    />
  )
}

const RelatedRecipesPicker = ({ visible, candidates, selected, disabled, onToggle, onDismiss }: RelatedRecipesPickerProps) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const sheetRef = useRef<BottomSheetModal>(null)
  const wasPresentedRef = useRef(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()

    return candidates.filter((recipe) => !q || recipe.title.toLowerCase().includes(q))
  }, [candidates, query])

  const selectedRecipes = useMemo(() => candidates.filter((recipe) => selected.has(recipe.id)), [candidates, selected])

  useEffect(() => {
    if (visible) {
      wasPresentedRef.current = true
      sheetRef.current?.present()
    } else if (wasPresentedRef.current) {
      sheetRef.current?.dismiss()
    }
  }, [visible])

  const handleDismiss = useCallback(() => {
    wasPresentedRef.current = false
    setQuery('')
    onDismiss()
  }, [onDismiss])

  const renderCandidate = useCallback(
    ({ item }: { item: RecipeOut }) => (
      <CandidateRow recipe={item} selected={selected.has(item.id)} disabled={disabled} onToggle={onToggle} />
    ),
    [selected, disabled, onToggle],
  )

  const renderEmpty = useCallback(() => <PickerEmpty label={t('relatedRecipes.noMatches')} />, [t])

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={PICKER_SNAP_POINTS}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={handleDismiss}
      backdropComponent={renderSheetBackdrop}
      backgroundStyle={sheetStyles.background}
      handleIndicatorStyle={sheetStyles.handle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <PickerHeader
        countLabel={t('relatedRecipes.selectedCount', { count: selected.size })}
        title={t('relatedRecipes.title')}
      />
      <PickerSearchField value={query} onChangeText={setQuery} placeholder={t('relatedRecipes.searchPlaceholder')} />
      {selectedRecipes.length > 0 ? (
        <PickerChipRow>
          {selectedRecipes.map((recipe) => (
            <SelectedRecipeChip key={recipe.id} recipe={recipe} onToggle={onToggle} />
          ))}
        </PickerChipRow>
      ) : null}
      <BottomSheetFlatList
        data={filtered}
        renderItem={renderCandidate}
        keyExtractor={getRecipeKey}
        ListEmptyComponent={renderEmpty}
        style={pickerStyles.list}
        contentContainerStyle={pickerStyles.listContent}
        keyboardShouldPersistTaps="handled"
      />
    </BottomSheetModal>
  )
}

const getRecipeKey = (recipe: RecipeOut) => recipe.id

const styles = StyleSheet.create({
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    ...pickerStyles.rowDivider,
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.rowTitle, fontWeight: '400', color: palette.ink },
  titleSelected: { ...typography.rowTitle, color: palette.ink },
  meta: { ...typography.tileMeta, color: palette.textTertiary },
})

export default memo(RelatedRecipesPicker)
