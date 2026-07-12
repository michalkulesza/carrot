import type { RecipeOut } from '@carrot/shared/types'
import i18n from '../../i18n'

export type SortField =
  | 'title'
  | 'servings'
  | 'kcal_per_serving'
  | 'protein_per_serving'
  | 'fat_per_serving'
  | 'carbs_per_serving'
  | 'creator_handle'
  | 'added_by'
  | 'created_at'
export type SortDir = 'asc' | 'desc'
export type Sort = { field: SortField; dir: SortDir } | null

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(i18n.language, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

const getSortValue = (
  recipe: RecipeOut,
  field: SortField
): string | number | null => {
  switch (field) {
    case 'title':
      return recipe.title.toLowerCase()
    case 'servings':
      return recipe.servings
    case 'kcal_per_serving':
      return recipe.kcal_per_serving
    case 'protein_per_serving':
      return recipe.protein_per_serving
    case 'fat_per_serving':
      return recipe.fat_per_serving
    case 'carbs_per_serving':
      return recipe.carbs_per_serving
    case 'creator_handle':
      return recipe.creator_handle?.toLowerCase() ?? null
    case 'added_by':
      return recipe.added_by?.toLowerCase() ?? null
    case 'created_at':
      return recipe.created_at
  }
}

export const applySortRows = (rows: RecipeOut[], sort: Sort): RecipeOut[] => {
  if (!sort) return rows

  return [...rows].sort((a, b) => {
    const av = getSortValue(a, sort.field)
    const bv = getSortValue(b, sort.field)
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1
    const cmp = av < bv ? -1 : av > bv ? 1 : 0

    return sort.dir === 'asc' ? cmp : -cmp
  })
}

export const getTableColumns = (showAddedBy: boolean): string =>
  showAddedBy
    ? '32px 28px 56px minmax(135px,1fr) 72px 72px 72px 72px 72px 84px 120px 120px 100px 40px'
    : '32px 28px 56px minmax(135px,1fr) 72px 72px 72px 72px 72px 84px 120px 100px 40px'
