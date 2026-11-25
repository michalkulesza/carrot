import { memo, useCallback, useMemo } from 'react'
import { Linking, Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { useHousehold } from '../../context/HouseholdContext'
import { AppText } from '../../components/ui'
import { getSourceHost } from './helpers'
import RecipeMemberRow from './RecipeMemberRow'
import { styles } from './styles'

interface CreatorLabelProps {
  label: string
  onPress?: () => void
}

const CreatorLabel = ({ label, onPress }: CreatorLabelProps) => {
  const text = (
    <AppText variant="subtitle" tone="textSecondary" numberOfLines={1}>
      {label}
    </AppText>
  )

  if (!onPress) return <View style={styles.metaCreator}>{text}</View>

  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="link" accessibilityLabel={label} style={styles.metaCreator}>
      {text}
    </Pressable>
  )
}

interface BylineProps {
  recipe: RecipeOut
  onDeleteRecipe: () => void
}

const Byline = ({ recipe, onDeleteRecipe }: BylineProps) => {
  const { t } = useTranslation()
  const { households } = useHousehold()

  const { source_url: sourceUrl, creator_handle: creatorHandle } = recipe

  const members = useMemo(
    () =>
      recipe.household_ids
        .map((id) => households.find((household) => household.id === id))
        .filter((household): household is NonNullable<typeof household> => !!household)
        .map((household) => ({ id: household.id, name: household.name, color: household.color })),
    [recipe.household_ids, households],
  )

  const creatorLabel = creatorHandle ? t('recipes.byCreator', { handle: creatorHandle }) : getSourceHost(sourceUrl)
  const showMeta = Boolean(creatorLabel) || members.length > 0
  const showSeparator = Boolean(creatorLabel) && members.length > 0

  const handleOpenSource = useCallback(() => {
    if (sourceUrl) void Linking.openURL(sourceUrl)
  }, [sourceUrl])

  if (!showMeta) return null

  return (
    <View style={styles.metaLine}>
      {creatorLabel ? <CreatorLabel label={creatorLabel} onPress={sourceUrl ? handleOpenSource : undefined} /> : null}
      {showSeparator ? (
        <AppText variant="subtitle" tone="textSecondary">
          ·
        </AppText>
      ) : null}
      <RecipeMemberRow members={members} onDeleteRecipe={onDeleteRecipe} />
    </View>
  )
}

export default memo(Byline)
