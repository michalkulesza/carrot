import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, Switch, Text, View } from 'react-native'
import { type BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet'
import { SymbolView } from 'expo-symbols'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { AppSheet } from '../../components/ui/sheet'
import { palette } from '../../theme'
import { createUnitTranslator, splitIngredient } from './helpers'
import { styles } from './styles'
import { getAllergenName, getUniqueGroupNames, type SwapPlan } from './swapHelpers'

const MIN_BOTTOM_PADDING = 34
const ARROW_SIZE = 18
const DISMISS_FALLBACK_MS = 600
const SWITCH_TRACK = { true: palette.action }

interface IngredientSwapSheetProps {
  plan: SwapPlan | null
  onConfirm: (everywhere: boolean) => void
  onDismiss: () => void
}

const IngredientSwapSheet = ({ plan, onConfirm, onDismiss }: IngredientSwapSheetProps) => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetModal>(null)
  const lastPlanRef = useRef<SwapPlan | null>(null)
  const [everywhere, setEverywhere] = useState(true)

  if (plan) lastPlanRef.current = plan
  const shown = plan ?? lastPlanRef.current
  const visible = plan !== null

  const visibleRef = useRef(visible)
  const presentedRef = useRef(false)
  const dismissingRef = useRef(false)
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  visibleRef.current = visible

  const present = useCallback(() => {
    presentedRef.current = true
    setEverywhere(true)
    sheetRef.current?.present()
  }, [])

  const clearDismissTimeout = useCallback(() => {
    if (dismissTimeoutRef.current === null) return

    clearTimeout(dismissTimeoutRef.current)
    dismissTimeoutRef.current = null
  }, [])

  const handleDismissTimeout = useCallback(() => {
    dismissTimeoutRef.current = null
    presentedRef.current = false
    dismissingRef.current = false
    if (visibleRef.current) present()
  }, [present])

  useEffect(() => clearDismissTimeout, [clearDismissTimeout])

  // The modal ignores present() mid-dismiss and its onDismiss fires late, so opens wait for the close to finish.
  useEffect(() => {
    if (visible) {
      if (!presentedRef.current && !dismissingRef.current) present()
      return
    }
    if (presentedRef.current && !dismissingRef.current) {
      dismissingRef.current = true
      sheetRef.current?.dismiss()
      dismissTimeoutRef.current = setTimeout(handleDismissTimeout, DISMISS_FALLBACK_MS)
    }
  }, [visible, present, handleDismissTimeout])

  const handleSheetDismiss = useCallback(() => {
    clearDismissTimeout()
    presentedRef.current = false
    const closedByParent = dismissingRef.current
    dismissingRef.current = false

    if (!closedByParent) {
      onDismiss()
      return
    }
    if (visibleRef.current) present()
  }, [onDismiss, present, clearDismissTimeout])

  const bodyStyle = useMemo(
    () => [styles.swapSheetBody, { paddingBottom: Math.max(insets.bottom, MIN_BOTTOM_PADDING) }],
    [insets.bottom],
  )

  const handleConfirm = useCallback(() => onConfirm(everywhere), [onConfirm, everywhere])

  const content = useMemo(() => {
    if (!shown) return null

    const translateUnit = createUnitTranslator(t)
    const oldParts = splitIngredient(shown.target.oldIngredient, translateUnit)
    const newParts = splitIngredient(shown.target.newIngredient, translateUnit)
    const allergenName = getAllergenName(t, shown.allergen)
    const quantity = newParts.quantity || oldParts.quantity
    const placeCount = shown.others.length + 1
    const groupNames = getUniqueGroupNames([shown.target, ...shown.others], t('recipes.sectionIngredients'))
    const everywhereAvailable = shown.others.length > 0

    return {
      title: t('recipes.swapSheetTitle', { allergen: allergenName }),
      oldLine: [oldParts.quantity, oldParts.name].filter(Boolean).join(' '),
      newLine: [quantity, newParts.name].filter(Boolean).join(' '),
      note: t('recipes.swapFreeNote', { allergen: allergenName }),
      everywhereAvailable,
      everywhereSubtitle: t('recipes.swapEverywherePlaces', { count: placeCount, groups: groupNames.join(' + ') }),
      confirmLabel: t('recipes.swapConfirm'),
    }
  }, [shown, t])

  return (
    <AppSheet
      ref={sheetRef}
      onDismiss={handleSheetDismiss}
    >
      <BottomSheetView style={bodyStyle}>
        {content ? (
          <>
            <Text style={styles.swapSheetTitle} accessibilityRole="header">
              {content.title}
            </Text>
            <View style={styles.swapCompare}>
              <Text style={styles.swapCompareOld}>{content.oldLine}</Text>
              <View style={styles.swapCompareNewRow}>
                <SymbolView name="arrow.right" size={ARROW_SIZE} weight="bold" tintColor={palette.actionText} />
                <Text style={styles.swapCompareNew}>{content.newLine}</Text>
              </View>
              <Text style={styles.swapCompareNote}>{content.note}</Text>
            </View>
            {content.everywhereAvailable ? (
              <View style={styles.swapEverywhereRow}>
                <View style={styles.swapEverywhereTexts}>
                  <Text style={styles.swapEverywhereTitle}>{t('recipes.swapEverywhere')}</Text>
                  <Text style={styles.swapEverywhereSubtitle}>{content.everywhereSubtitle}</Text>
                </View>
                <Switch
                  value={everywhere}
                  onValueChange={setEverywhere}
                  trackColor={SWITCH_TRACK}
                  accessibilityLabel={t('recipes.swapEverywhere')}
                />
              </View>
            ) : null}
            <View style={styles.swapButtons}>
              <Pressable
                style={[styles.swapButton, styles.swapKeep]}
                onPress={onDismiss}
                accessibilityRole="button"
                accessibilityLabel={t('recipes.swapKeep')}
              >
                <Text style={styles.swapKeepText}>{t('recipes.swapKeep')}</Text>
              </Pressable>
              <Pressable
                style={[styles.swapButton, styles.swapConfirm]}
                onPress={handleConfirm}
                accessibilityRole="button"
                accessibilityLabel={content.confirmLabel}
              >
                <Text style={styles.swapConfirmText} numberOfLines={1} adjustsFontSizeToFit>
                  {content.confirmLabel}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </BottomSheetView>
    </AppSheet>
  )
}

export default IngredientSwapSheet
