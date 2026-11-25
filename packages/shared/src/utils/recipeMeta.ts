import type { RecipeOut } from '../types'

type Translate = (key: string, options?: Record<string, unknown>) => string

export const formatRecipeMeta = (recipe: Pick<RecipeOut, 'total_time_minutes' | 'kcal_per_serving'>, t: Translate) =>
  [
    recipe.total_time_minutes ? t('browse.minutes', { count: recipe.total_time_minutes }) : null,
    recipe.kcal_per_serving ? t('browse.kcal', { count: recipe.kcal_per_serving }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
