import { memo, useCallback, useMemo } from 'react'
import { AccessibilityActionEvent, ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { tTag } from '@carrot/shared/utils/tagUtils'
import AppText from './AppText'
import Thumbnail from './Thumbnail'
import { lightHaptic } from './haptics'
import { getInitials } from '../Avatar'
import { palette, PaletteKey, radius, space, usePressScale } from '../../theme'

interface CompactRecipeRowProps {
  recipe: RecipeOut
  busy?: boolean
  showDivider?: boolean
  onPress: (recipe: RecipeOut) => void
  onLongPress?: (recipe: RecipeOut) => void
}

const THUMBNAIL_SIZE = 52
const ROW_MIN_HEIGHT = 68
const CHEVRON_SIZE = 13
const DELETE_ACTION = 'delete'
const PLACEHOLDER_TONES: PaletteKey[] = ['tileBlue', 'tint', 'allergen', 'tileLilac']

const toneIndexFor = (title: string) => {
  let hash = 0
  for (let index = 0; index < title.length; index++) hash = (hash * 31 + title.charCodeAt(index)) >>> 0

  return hash % PLACEHOLDER_TONES.length
}

const CompactRecipeRow = ({ recipe, busy, showDivider = true, onPress, onLongPress }: CompactRecipeRowProps) => {
  const { t } = useTranslation()
  const { animatedStyle, onPressIn, onPressOut } = usePressScale()
  const { title, thumbnail_url: thumbnailUrl, total_time_minutes: minutes, tags } = recipe

  const category = tags[0] ? tTag(tags[0].name, t) : null
  const meta = [minutes ? t('browse.minutes', { count: minutes }) : null, category].filter(Boolean).join(' · ')
  const placeholderStyle = useMemo(
    () => [styles.placeholder, { backgroundColor: palette[PLACEHOLDER_TONES[toneIndexFor(title)]] }],
    [title],
  )
  const containerStyle = useMemo(() => [styles.container, animatedStyle], [animatedStyle])

  const handlePress = useCallback(() => {
    lightHaptic()
    onPress(recipe)
  }, [onPress, recipe])
  const handleLongPress = useCallback(() => onLongPress?.(recipe), [onLongPress, recipe])
  const accessibilityLabel = meta ? `${title}, ${meta}` : title
  const accessibilityActions = useMemo(
    () => (onLongPress ? [{ name: DELETE_ACTION, label: t('common.delete') }] : undefined),
    [onLongPress, t],
  )
  const accessibilityState = useMemo(() => ({ disabled: busy, busy }), [busy])

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === DELETE_ACTION && !busy) handleLongPress()
    },
    [busy, handleLongPress],
  )

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={busy ? undefined : handleLongPress}
      disabled={busy}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={onLongPress ? t('settings.recipeRowHint') : undefined}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={handleAccessibilityAction}
      accessibilityState={accessibilityState}
    >
      <Animated.View style={containerStyle}>
        {thumbnailUrl ? (
          <Thumbnail url={thumbnailUrl} size={THUMBNAIL_SIZE} radiusKey="thumb" />
        ) : (
          <View style={placeholderStyle}>
            <AppText variant="rowTitle" tone="textSecondary">
              {getInitials(title)}
            </AppText>
          </View>
        )}
        <View style={styles.body}>
          <AppText variant="rowTitle" numberOfLines={1}>
            {title}
          </AppText>
          {meta ? (
            <AppText variant="tileMeta" tone="textSecondary" numberOfLines={1}>
              {meta}
            </AppText>
          ) : null}
        </View>
        {busy ? (
          <ActivityIndicator size="small" />
        ) : (
          <SymbolView name="chevron.right" size={CHEVRON_SIZE} weight="semibold" tintColor={palette.placeholder} />
        )}
        {showDivider ? <View style={styles.divider} /> : null}
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  placeholder: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: radius.thumb,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  divider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.dividerCard,
  },
})

export default memo(CompactRecipeRow)
