import type { TFunction } from 'i18next'
import type { ImportJob, RecipeOut } from '@carrot/shared/types'
import { parseISODateLocal, toISODate } from '@carrot/shared/utils/dateUtils'
import type { BrowsePreset } from '../BrowseScreen/helpers'
import type { RecentActivity } from '../../storage/recentActivity'

export const SHELF_TILE_SIZE = 148
export const SHELF_GAP = 12
export const SHELF_LIMIT = 10
export const JUMP_BACK_LIMIT = 2

export const getShelfItemLayout = (_data: ArrayLike<RecipeOut> | null | undefined, index: number) => ({
  length: SHELF_TILE_SIZE,
  offset: (SHELF_TILE_SIZE + SHELF_GAP) * index,
  index,
})

const newestFirst = (recipes: RecipeOut[]) =>
  recipes
    .map((recipe) => ({ recipe, createdAt: new Date(recipe.created_at).getTime() }))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, SHELF_LIMIT)
    .map(({ recipe }) => recipe)

export const getRecentlyAdded = (recipes: RecipeOut[]) => newestFirst(recipes)

export const getFavourites = (recipes: RecipeOut[]) => newestFirst(recipes.filter((recipe) => recipe.is_favourite))

const formatAddedMeta = (createdAt: string, locale: string, t: TFunction) => {
  const created = new Date(createdAt)
  const todayIso = toISODate(new Date())
  const createdIso = toISODate(created)

  if (createdIso === todayIso) return t('home.addedToday')

  const yesterday = parseISODateLocal(todayIso)
  yesterday.setDate(yesterday.getDate() - 1)
  if (createdIso === toISODate(yesterday)) return t('home.yesterday')

  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(created)
}

export const getShelfMeta = (recipe: RecipeOut, preset: BrowsePreset, locale: string, t: TFunction) => {
  if (preset === 'recent') return formatAddedMeta(recipe.created_at, locale, t)
  if (!recipe.total_time_minutes) return undefined

  return t('home.minutesShort', { count: recipe.total_time_minutes })
}

export const getTonightKicker = (
  entryDate: string,
  todayIso: string,
  totalTimeMinutes: number | null | undefined,
  locale: string,
  t: TFunction,
) => {
  const tomorrow = parseISODateLocal(todayIso)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(parseISODateLocal(entryDate))
  const isTomorrow = entryDate === toISODate(tomorrow)
  const label = entryDate === todayIso ? t('home.tonight') : isTomorrow ? t('home.tomorrow') : weekday
  const duration = totalTimeMinutes ? t('home.minutesShort', { count: totalTimeMinutes }) : null

  return [label, duration].filter(Boolean).join(' · ')
}

export const isDuplicateJob = (job: ImportJob) =>
  job.failure_code === 'duplicate_recipe' || job.duplicate_recipe_id != null

export const getImportCounts = (jobs: ImportJob[]) => {
  const needYou = jobs.filter((job) => job.status === 'failed').length
  const inProgress = jobs.filter((job) => job.status === 'pending' || job.status === 'running').length

  return { needYou, inProgress }
}

export const getImportSummary = (inProgress: number, needYou: number, t: TFunction) => {
  const parts = [
    inProgress > 0 ? t('home.imports.inProgress', { count: inProgress }) : null,
    needYou > 0 ? t('home.imports.needYou', { count: needYou }) : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' · ') : t('home.imports.allDone')
}

export const getSourceLabel = (sourceUrl: string | null) => {
  if (!sourceUrl) return null

  try {
    const { host, pathname } = new URL(sourceUrl)
    const path = pathname === '/' ? '' : pathname.replace(/\/$/, '')

    return `${host.replace(/^www\./, '')}${path}`
  } catch {
    return sourceUrl
  }
}

export interface JumpBackRowData {
  key: string
  kind: 'cook' | 'viewed'
  recipe: RecipeOut
  progress?: number
}

export const buildJumpBackRows = (
  activity: RecentActivity,
  recipesById: Map<string, RecipeOut>,
): JumpBackRowData[] => {
  const rows: JumpBackRowData[] = []
  const cookRecipe = activity.cook ? recipesById.get(activity.cook.recipeId) : undefined

  if (activity.cook && cookRecipe) {
    const { stepIndex, totalSteps } = activity.cook
    const progress = totalSteps > 0 ? Math.min(1, (stepIndex + 1) / totalSteps) : 0
    rows.push({ key: `cook:${cookRecipe.id}`, kind: 'cook', recipe: cookRecipe, progress })
  }

  const viewedRecipe = activity.lastViewed ? recipesById.get(activity.lastViewed.recipeId) : undefined
  if (viewedRecipe && viewedRecipe.id !== cookRecipe?.id) {
    rows.push({ key: `viewed:${viewedRecipe.id}`, kind: 'viewed', recipe: viewedRecipe })
  }

  return rows.slice(0, JUMP_BACK_LIMIT)
}
