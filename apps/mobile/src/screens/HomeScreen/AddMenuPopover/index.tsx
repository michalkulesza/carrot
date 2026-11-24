import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, Platform, Pressable, useWindowDimensions, View } from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useHeaderHeight } from 'expo-router/react-navigation'
import { useTranslation } from 'react-i18next'
import type { AddRecipeSheet } from '../../../components/AddRecipeDrawer'
import { AppText } from '../../../components/ui'
import { lightHaptic } from '../../../components/ui/haptics'
import { useAddMenu } from '../useAddMenu'
import ActionRow from './ActionRow'
import ClipboardRow from './ClipboardRow'
import { CARD_GUTTER, CARD_WIDTH, styles } from './styles'

interface AddMenuPopoverProps {
  visible: boolean
  onClose: () => void
  onOpenSheet: (sheet: AddRecipeSheet) => void
}

const ENTER_DURATION = 180
const EXIT_DURATION = 120
const START_SCALE = 0.94
const CARD_TOP_GAP = 4

const AddMenuPopover = ({ visible, onClose, onOpenSheet }: AddMenuPopoverProps) => {
  const { t } = useTranslation()
  const { width: screenWidth } = useWindowDimensions()
  const headerHeight = useHeaderHeight()
  const reduceMotion = useReducedMotion()
  const {
    hasUrl,
    hasPersonalRecipes,
    importClipboardLink,
    openLinkSheet,
    openTextSheet,
    openPersonalLibrary,
    writeFromScratch,
    takePhoto,
    pickFromLibrary,
  } = useAddMenu(visible, onOpenSheet)

  const [mounted, setMounted] = useState(false)
  const progress = useSharedValue(0)
  const closingRef = useRef(false)
  const pendingActionRef = useRef<(() => void) | null>(null)

  const handleModalDismiss = useCallback(() => {
    const action = pendingActionRef.current
    pendingActionRef.current = null
    action?.()
  }, [])

  const handleExitFinished = useCallback(() => {
    setMounted(false)
    // Modal onDismiss is iOS-only.
    if (Platform.OS !== 'ios') handleModalDismiss()
  }, [handleModalDismiss])

  useEffect(() => {
    if (visible) {
      closingRef.current = false
      pendingActionRef.current = null
      setMounted(true)
      progress.value = withTiming(1, {
        duration: reduceMotion ? 0 : ENTER_DURATION,
        easing: Easing.out(Easing.cubic),
      })

      return
    }

    if (!mounted) return

    progress.value = withTiming(
      0,
      { duration: reduceMotion ? 0 : EXIT_DURATION, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(handleExitFinished)()
      },
    )
  }, [visible, mounted, reduceMotion, progress, handleExitFinished])

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: START_SCALE + (1 - START_SCALE) * progress.value }],
  }))

  const requestClose = useCallback(() => {
    if (closingRef.current) return

    closingRef.current = true
    onClose()
  }, [onClose])

  const runAfterClose = useCallback(
    (action: () => void) => {
      if (closingRef.current) return

      lightHaptic()
      pendingActionRef.current = action
      requestClose()
    },
    [requestClose],
  )

  const handleImportClipboard = useCallback(() => runAfterClose(importClipboardLink), [importClipboardLink, runAfterClose])
  const handleImportLink = useCallback(() => runAfterClose(openLinkSheet), [openLinkSheet, runAfterClose])
  const handleTakePhoto = useCallback(() => runAfterClose(takePhoto), [takePhoto, runAfterClose])
  const handlePickFromLibrary = useCallback(() => runAfterClose(pickFromLibrary), [pickFromLibrary, runAfterClose])
  const handlePasteText = useCallback(() => runAfterClose(openTextSheet), [openTextSheet, runAfterClose])
  const handlePersonalLibrary = useCallback(() => runAfterClose(openPersonalLibrary), [openPersonalLibrary, runAfterClose])
  const handleWriteScratch = useCallback(() => runAfterClose(writeFromScratch), [writeFromScratch, runAfterClose])

  const cardLayout = {
    top: headerHeight + CARD_TOP_GAP,
    width: Math.min(CARD_WIDTH, screenWidth - CARD_GUTTER * 2),
  }

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={requestClose}
      onDismiss={handleModalDismiss}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('addMenu.close')}
        onPress={requestClose}
        style={styles.dismiss}
      />
      <Animated.View accessibilityViewIsModal style={[styles.card, cardLayout, cardAnimatedStyle]}>
        {hasUrl ? <ClipboardRow onImport={handleImportClipboard} /> : null}
        <ActionRow
          icon="link"
          title={t('addMenu.importLink')}
          subtitle={t('addMenu.importLinkSubtitle')}
          onPress={handleImportLink}
        />
        <ActionRow
          icon="camera"
          title={t('addMenu.takePhoto')}
          subtitle={t('addMenu.takePhotoSubtitle')}
          onPress={handleTakePhoto}
        />
        <ActionRow
          icon="photo"
          title={t('addMenu.fromPhotos')}
          subtitle={t('addMenu.fromPhotosSubtitle')}
          onPress={handlePickFromLibrary}
        />
        <ActionRow
          icon="doc.on.clipboard"
          title={t('addMenu.pasteText')}
          subtitle={t('addMenu.pasteTextSubtitle')}
          onPress={handlePasteText}
        />
        {hasPersonalRecipes ? (
          <ActionRow icon="books.vertical" title={t('addRecipe.fromPersonalLibrary')} onPress={handlePersonalLibrary} />
        ) : null}
        <ActionRow
          icon="square.and.pencil"
          title={t('addMenu.writeScratch')}
          subtitle={t('addMenu.writeScratchSubtitle')}
          onPress={handleWriteScratch}
        />
        <View style={styles.tip}>
          <AppText variant="tileMeta" tone="textSecondary">
            {t('addMenu.tip')}
          </AppText>
        </View>
      </Animated.View>
    </Modal>
  )
}

export default AddMenuPopover
