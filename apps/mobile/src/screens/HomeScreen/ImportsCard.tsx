import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { ImportJob, RecipeOut } from '@carrot/shared/types'
import { AppText, Card, CardRowList, Expandable, IconCircle } from '../../components/ui'
import { useMotion } from '../../theme'
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
  const { entering } = useMotion()
  const [expanded, setExpanded] = useState(false)
  const previousNeedYou = useRef(0)

  const { inProgress, needYou } = useMemo(() => getImportCounts(jobs), [jobs])
  const summary = getImportSummary(inProgress, needYou, t)
  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes])

  useEffect(() => {
    if (needYou > previousNeedYou.current) setExpanded(true)
    previousNeedYou.current = needYou
  }, [needYou])

  const handleToggle = useCallback(() => setExpanded((value) => !value), [])

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
    <View style={styles.importsHeader}>
      <IconCircle count={jobs.length} />
      <View style={styles.flexFill}>
        <AppText variant="rowTitle">{t('home.imports.title')}</AppText>
        <AppText variant="meta" tone="textSecondary" numberOfLines={1}>
          {summary}
        </AppText>
      </View>
    </View>
  )

  return (
    <Animated.View entering={entering} style={styles.importsSection}>
      <Card style={styles.importsCard}>
        <Expandable
          header={header}
          expanded={expanded}
          onToggle={handleToggle}
          accessibilityLabel={`${t('home.imports.title')}. ${summary}`}
        >
          <View style={styles.importsBody}>
            <CardRowList items={jobs} keyExtractor={keyExtractor} renderItem={renderRow} />
          </View>
        </Expandable>
      </Card>
    </Animated.View>
  )
}

export default memo(ImportsCard)
