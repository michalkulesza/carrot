import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Alert, Image, Linking, PlatformColor, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { MenuView } from '@react-native-menu/menu'
import type { MenuAction, NativeActionEvent } from '@react-native-menu/menu'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import * as Haptics from 'expo-haptics'
import type { ImportJob } from '@carrot/shared/types'
import { colors } from '../../theme/colors'
import Avatar from '../../components/Avatar'
import MarqueeRow from '../../components/MarqueeRow'
import { MarqueeSyncSlots } from '../../components/MarqueeSync'
import { PLACEHOLDER_URL } from '../../api/thumbnailUrl'
import { clearImportImagePreview, getImportImagePreview } from '../../utils/importImagePreviews'
import { resolveRecipePreview } from '../../utils/recipePreview'
import { isOptimisticJobId } from '@carrot/shared/utils/optimisticImportJob'
import { PERSONAL_LIBRARY_COLOR } from '@carrot/shared/utils/householdColors'
import { useAuth } from '../../context/AuthContext'
import { deviceCaptureStore, useDeviceCaptureState } from '../../components/DeviceHtmlCapture/store'
import { styles } from './styles'

const getCardTitle = (job: ImportJob, capturingOnDevice: boolean, retryScheduled: boolean, t: TFunction) => {
  if (capturingOnDevice) return t('importJobs.capturingOnDevice')
  if (job.status === 'failed') return t(`importJobs.failure.${job.failure_code ?? 'unexpected'}`)
  if (job.status === 'running') return t('importJobs.running')
  if (retryScheduled) return t('importJobs.takingLonger')
  return t('importJobs.pending')
}

const PendingJobCard = ({
  job,
  onRetry,
  onImportAnyway,
  onGoToRecipe,
  onCancel,
  onDismiss,
  onContinueManually,
}: {
  job: ImportJob
  onRetry: () => Promise<unknown>
  onImportAnyway: () => Promise<unknown>
  onGoToRecipe: (recipeId: string) => void
  onCancel: () => Promise<unknown>
  onDismiss: () => Promise<unknown>
  onContinueManually: () => void
}) => {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { capturingJobId } = useDeviceCaptureState()
  const [actionPending, setActionPending] = useState(false)
  const actionInProgress = useRef(false)
  const sourceUrlOpening = useRef(false)
  const retryScheduled = job.status === 'pending' && job.retry_count > 0
  const isCurrentUserImport = job.created_by_user_id === user?.id
  const importingMemberName = job.created_by_name ?? t('importJobs.someone')
  const imagePreview = getImportImagePreview(job.id)
  const [resolvedImagePreview, setResolvedImagePreview] = useState<string | null>(null)
  const imageUri = imagePreview ?? resolvedImagePreview ?? (job.kind === 'text' ? PLACEHOLDER_URL : null)
  const capturingOnDevice = job.status === 'failed' && capturingJobId === job.id
  const title = getCardTitle(job, capturingOnDevice, retryScheduled, t)
  const handleAction = async (action: () => Promise<unknown>) => {
    if (actionInProgress.current) return
    actionInProgress.current = true
    setActionPending(true)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    try {
      await action()
    } catch {
      // The existing import-job stream keeps the card available for a retry.
    } finally {
      actionInProgress.current = false
      setActionPending(false)
    }
  }
  const handleRetry = () => {
    deviceCaptureStore.reset(job.id)
    void handleAction(onRetry)
  }
  const handleCancel = () => void handleAction(onCancel)
  const handleDismiss = () => void handleAction(onDismiss)
  const canOpenSourceUrl = Boolean(job.source_url)
  const isFailedCard = job.status === 'failed' && !capturingOnDevice
  const isDuplicate = job.failure_code === 'duplicate_recipe'
  const handleImportAnyway = () => void handleAction(onImportAnyway)
  const handleGoToRecipe = () => {
    if (job.duplicate_recipe_id) onGoToRecipe(job.duplicate_recipe_id)
  }
  const handleOpenSourceUrl = async () => {
    if (!job.source_url || sourceUrlOpening.current) return

    sourceUrlOpening.current = true
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    try {
      await Linking.openURL(job.source_url)
    } catch {
      Alert.alert(t('common.whoops'), t('common.somethingWentWrong'))
    } finally {
      sourceUrlOpening.current = false
    }
  }
  const handleSourceUrlMenu = () => {
    if (!job.source_url) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Alert.alert(job.source_url, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('importJobs.openLink'), onPress: () => void handleOpenSourceUrl() },
    ])
  }

  const menuActions = useMemo<MenuAction[]>(() => {
    const openLinkAction: MenuAction[] = canOpenSourceUrl
      ? [{ id: 'openLink', title: t('importJobs.openLink'), image: 'safari' }]
      : []

    if (isDuplicate) {
      const goToRecipeAction: MenuAction[] = job.duplicate_recipe_id
        ? [{ id: 'goToRecipe', title: t('importJobs.duplicate.goToRecipe'), image: 'book' }]
        : []
      return [
        { id: 'importAnyway', title: t('importJobs.duplicate.importAnyway'), image: 'square.and.arrow.down' },
        ...goToRecipeAction,
        ...openLinkAction,
        { id: 'dismiss', title: t('importJobs.duplicate.dontImport'), image: 'xmark', attributes: { destructive: true } },
      ]
    }

    const openAndPasteAction: MenuAction[] = canOpenSourceUrl
      ? [{ id: 'openAndPaste', title: t('importJobs.openAndPaste'), image: 'doc.on.clipboard' }]
      : []
    return [
      ...openAndPasteAction,
      { id: 'retry', title: t('importJobs.retry'), image: 'arrow.clockwise' },
      ...openLinkAction,
      { id: 'dismiss', title: t('importJobs.cancelImport'), image: 'xmark', attributes: { destructive: true } },
    ]
  }, [canOpenSourceUrl, isDuplicate, job.duplicate_recipe_id, t])

  const handleMenuAction = ({ nativeEvent }: NativeActionEvent) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    switch (nativeEvent.event) {
      case 'importAnyway':
        handleImportAnyway()
        break
      case 'goToRecipe':
        handleGoToRecipe()
        break
      case 'openAndPaste':
        onContinueManually()
        break
      case 'retry':
        handleRetry()
        break
      case 'openLink':
        void handleOpenSourceUrl()
        break
      case 'dismiss':
        handleDismiss()
        break
    }
  }

  const handleCardLongPress = canOpenSourceUrl && !isFailedCard ? handleSourceUrlMenu : undefined
  const isOptimistic = isOptimisticJobId(job.id)

  const cardStyle = [styles.pendingCard, isFailedCard && styles.pendingCardAttention]
  const titleStyle = [styles.pendingTitle, isFailedCard && styles.pendingTitleAttention]
  const urlPillStyle = [styles.cardTagPill, isFailedCard && styles.pendingUrlPillAttention]
  const urlPillTextStyle = [styles.cardTagPillText, isFailedCard && styles.pendingUrlPillTextAttention]

  const cardContent = (
    <>
      <View style={styles.pendingImageWrap}>
        {imageUri && <Image source={{ uri: imageUri }} style={styles.pendingImage} />}
        {!isFailedCard && (
          <View style={styles.pendingSpinnerOverlay}>
            <ActivityIndicator size="small" color={colors.tertiaryLabel} />
          </View>
        )}
      </View>
      <View style={styles.pendingBody}>
        <Text style={titleStyle}>{title}</Text>
        {job.source_url && (
          <MarqueeSyncSlots>
            {({ tags: tagsTurn }) => (
              <MarqueeRow
                containerStyle={styles.pendingUrlRow}
                gap={4}
                turn={tagsTurn.turn}
                onOverflowChange={tagsTurn.onOverflowChange}
                onDone={tagsTurn.onDone}
              >
                <View style={urlPillStyle}>
                  <Text style={urlPillTextStyle} numberOfLines={1}>{job.source_url}</Text>
                </View>
              </MarqueeRow>
            )}
          </MarqueeSyncSlots>
        )}
        <View style={styles.pendingMetaRow}>
          <Avatar
            name={isCurrentUserImport ? t('households.personal') : importingMemberName}
            label={isCurrentUserImport ? t('households.you').charAt(0) : undefined}
            color={isCurrentUserImport ? PERSONAL_LIBRARY_COLOR : undefined}
            size={18}
          />
        </View>
      </View>
    </>
  )

  useEffect(() => {
    let cancelled = false

    if (!job.source_url || imagePreview) {
      setResolvedImagePreview(null)
      return () => {
        cancelled = true
      }
    }

    void resolveRecipePreview(job.source_url).then((preview) => {
      if (!cancelled) setResolvedImagePreview(preview)
    })

    return () => {
      cancelled = true
    }
  }, [imagePreview, job.source_url])

  useEffect(() => () => clearImportImagePreview(job.id), [job.id])

  const renderMenu = (children: ReactNode, style?: StyleProp<ViewStyle>) => (
    <MenuView
      title={title}
      actions={menuActions}
      shouldOpenOnLongPress={false}
      style={style}
      onPressAction={handleMenuAction}
    >
      {children}
    </MenuView>
  )

  const iconName = isDuplicate ? 'chevron-right' : 'alert-circle'
  const attentionButton = (
    <View style={styles.pendingIconAction} accessibilityRole="button" accessibilityLabel={title}>
      <Feather name={iconName} size={20} color="#ffffff" />
    </View>
  )

  return (
    <View style={cardStyle}>
      {isFailedCard ? (
        renderMenu(
          <View style={styles.pendingContent} accessibilityRole="button" accessibilityLabel={job.source_url ?? title}>
            {cardContent}
          </View>,
          styles.pendingContent,
        )
      ) : handleCardLongPress ? (
        <Pressable
          style={styles.pendingContent}
          onLongPress={handleCardLongPress}
          delayLongPress={500}
          accessibilityRole="button"
          accessibilityLabel={job.source_url ?? title}
        >
          {cardContent}
        </Pressable>
      ) : (
        <View style={styles.pendingContent}>{cardContent}</View>
      )}
      {capturingOnDevice ? null : job.status === 'failed' ? (
        <View style={styles.pendingCancelWrap}>{renderMenu(attentionButton)}</View>
      ) : (
        <View style={styles.pendingCancelWrap}>
          <Pressable
            style={styles.pendingIconAction}
            disabled={actionPending || isOptimistic}
            onPress={handleCancel}
            accessibilityLabel={t('importJobs.cancel')}
          >
            <Feather name="x" size={18} color={PlatformColor('secondaryLabel') as unknown as string} />
          </Pressable>
        </View>
      )}
    </View>
  )
}

export default PendingJobCard
