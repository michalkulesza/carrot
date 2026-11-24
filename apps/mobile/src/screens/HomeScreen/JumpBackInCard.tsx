import { memo, useCallback, useMemo } from 'react'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { AppText, Button, Card, CardRowList, ProgressBar, SectionHeader, Thumbnail } from '../../components/ui'
import { useRecentActivity } from '../../hooks/useRecentActivity'
import { useMotion } from '../../theme'
import { buildJumpBackRows, type JumpBackRowData } from './helpers'
import { styles } from './styles'

interface JumpBackRowProps {
  row: JumpBackRowData
  onOpen: (row: JumpBackRowData) => void
}

const keyExtractor = (row: JumpBackRowData) => row.key

const JumpBackRow = ({ row, onOpen }: JumpBackRowProps) => {
  const { t } = useTranslation()
  const isCook = row.kind === 'cook'
  const kicker = isCook ? t('home.cookModeKicker') : t('home.lastViewed')
  const buttonLabel = isCook ? t('home.resume') : t('home.open')

  const handlePress = useCallback(() => onOpen(row), [onOpen, row])

  return (
    <View style={styles.jumpRow}>
      <Thumbnail url={row.recipe.thumbnail_url} size="sm" radiusKey="control" />
      <View style={styles.jumpRowText}>
        <AppText variant="kicker" tone="actionText">
          {kicker}
        </AppText>
        <AppText variant="rowTitle" numberOfLines={1}>
          {row.recipe.title}
        </AppText>
        {isCook ? <ProgressBar value={row.progress} /> : null}
      </View>
      <Button
        label={buttonLabel}
        icon={isCook ? 'play.fill' : undefined}
        size="sm"
        accessibilityLabel={`${buttonLabel}: ${row.recipe.title}`}
        onPress={handlePress}
      />
    </View>
  )
}

const JumpBackInCard = ({ recipes }: { recipes: RecipeOut[] }) => {
  const { t } = useTranslation()
  const router = useRouter()
  const { entering } = useMotion()
  const { activity } = useRecentActivity()

  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes])
  const rows = useMemo(() => buildJumpBackRows(activity, recipesById), [activity, recipesById])

  const handleOpen = useCallback(
    (row: JumpBackRowData) => {
      const params = { id: row.recipe.id, title: row.recipe.title, ...(row.kind === 'cook' ? { cookMode: '1' } : {}) }
      router.push({ pathname: '/recipe/[id]', params })
    },
    [router],
  )

  const renderRow = useCallback((row: JumpBackRowData) => <JumpBackRow row={row} onOpen={handleOpen} />, [handleOpen])

  if (rows.length === 0) return null

  return (
    <Animated.View entering={entering}>
      <SectionHeader title={t('home.jumpBackIn')} />
      <View style={styles.jumpSection}>
        <Card style={styles.jumpCard}>
          <CardRowList items={rows} keyExtractor={keyExtractor} renderItem={renderRow} />
        </Card>
      </View>
    </Animated.View>
  )
}

export default memo(JumpBackInCard)
