import { memo, useCallback, useMemo } from 'react'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { ImportJob, RecipeOut } from '@carrot/shared/types'
import { AppText, IconCircle } from '../../components/ui'
import { useMotion } from '../../theme'
import CollapsibleListCard from './CollapsibleListCard'
import { getImportCounts, getImportSummary } from './helpers'
import ImportRow from './ImportRow'
import { styles } from './styles'
import type { ImportJobActions } from './useImportJobActions'

interface ImportsCardProps {
  jobs: ImportJob[]
  recipes: RecipeOut[]
  actions: ImportJobActions
}

const keyExtractor = (job: ImportJob) => job.id

const ImportsCard = ({ jobs, recipes, actions }: ImportsCardProps) => {
  const { t } = useTranslation()
  const { fade } = useMotion()

  const { inProgress, needYou } = useMemo(() => getImportCounts(jobs), [jobs])
  const summary = getImportSummary(inProgress, needYou, t)
  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes])

  const renderRow = useCallback(
    (job: ImportJob) => {
      const duplicateRecipe = job.duplicate_recipe_id ? recipesById.get(job.duplicate_recipe_id) : undefined

      return (
        <ImportRow job={job} actions={actions} duplicateThumbnailUrl={duplicateRecipe?.thumbnail_url ?? null} />
      )
    },
    [actions, recipesById],
  )

  const header = (
    <View style={styles.listHeader}>
      <Animated.View key={jobs.length} entering={fade}>
        <IconCircle count={jobs.length} />
      </Animated.View>
      <View style={styles.flexFill}>
        <AppText variant="rowTitle">{t('home.imports.title')}</AppText>
        <Animated.View key={summary} entering={fade}>
          <AppText variant="meta" tone="textSecondary" numberOfLines={1}>
            {summary}
          </AppText>
        </Animated.View>
      </View>
    </View>
  )

  return (
    <CollapsibleListCard
      header={header}
      items={jobs}
      keyExtractor={keyExtractor}
      renderItem={renderRow}
      accessibilityLabel={`${t('home.imports.title')}. ${summary}`}
      expandWhenIncreases={needYou}
    />
  )
}

export default memo(ImportsCard)
