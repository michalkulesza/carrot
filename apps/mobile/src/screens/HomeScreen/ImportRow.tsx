import { memo } from 'react'
import { Pressable, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { ImportJob } from '@carrot/shared/types'
import { AppText, IconCircle, ProgressBar, Thumbnail } from '../../components/ui'
import { useMotion } from '../../theme'
import { getSourceLabel } from './helpers'
import { styles } from './styles'
import { useImportJobActions, type ImportJobActions } from './useImportJobActions'

interface ImportRowProps {
  job: ImportJob
  actions: ImportJobActions
  duplicateThumbnailUrl: string | null
}

const ATTENTION_BADGE_SIZE = 28

const getThumbnailGlyph = (job: ImportJob, isFailedCard: boolean) => {
  if (isFailedCard) return { glyph: 'exclamationmark', tone: 'error' } as const
  if (job.status === 'succeeded') return { glyph: 'checkmark', tone: 'success' } as const

  return { glyph: 'arrow.down', tone: 'tint' } as const
}

const ImportRow = ({ job, actions, duplicateThumbnailUrl }: ImportRowProps) => {
  const { t } = useTranslation()
  const { title, isFailedCard, isDuplicate, handleMenu } = useImportJobActions(job, actions)
  const { fade, exiting } = useMotion()

  const { glyph, tone } = getThumbnailGlyph(job, isFailedCard)
  const sourceLabel = getSourceLabel(job.source_url)
  const isInProgress = !isFailedCard && job.status !== 'succeeded'
  const isPlainFailure = isFailedCard && !isDuplicate
  const thumbnailUrl = isDuplicate ? duplicateThumbnailUrl : null
  const badgeTone = isDuplicate ? 'attention' : 'error'
  const rowLabel = isFailedCard
    ? `${t('home.imports.needsAttention')}. ${title}`
    : job.source_url ?? title
  const rowHint = isFailedCard ? t('home.imports.showOptions') : undefined

  return (
    <Pressable
      style={styles.importRow}
      onPress={isFailedCard ? handleMenu : undefined}
      onLongPress={handleMenu}
      delayLongPress={500}
      accessibilityRole="button"
      accessibilityLabel={rowLabel}
      accessibilityHint={rowHint}
    >
      <Animated.View key={glyph} entering={fade}>
        <Thumbnail url={thumbnailUrl} size="xs" radiusKey="control" glyph={glyph} tone={tone} />
      </Animated.View>
      <View style={styles.importRowText}>
        <AppText variant="rowTitle" tone={isPlainFailure ? 'error' : 'ink'} numberOfLines={1}>
          {title}
        </AppText>
        {sourceLabel ? (
          <AppText variant="tileMeta" tone="textTertiary" numberOfLines={1}>
            {sourceLabel}
          </AppText>
        ) : null}
        {isInProgress ? (
          <Animated.View entering={fade} exiting={exiting} style={styles.importProgress}>
            <ProgressBar />
          </Animated.View>
        ) : null}
      </View>
      {isFailedCard ? (
        <Animated.View entering={fade} exiting={exiting}>
          <IconCircle icon="exclamationmark" tone={badgeTone} size={ATTENTION_BADGE_SIZE} />
        </Animated.View>
      ) : null}
    </Pressable>
  )
}

export default memo(ImportRow)
