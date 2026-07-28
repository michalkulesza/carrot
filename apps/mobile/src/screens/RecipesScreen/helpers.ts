export type SortMode = 'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'edited_newest' | 'edited_oldest'

export const SORT_OPTIONS: { key: SortMode; labelKey: string }[] = [
  { key: 'newest', labelKey: 'recipes.sortNewest' },
  { key: 'oldest', labelKey: 'recipes.sortOldest' },
  { key: 'edited_newest', labelKey: 'recipes.sortEditedNewest' },
  { key: 'edited_oldest', labelKey: 'recipes.sortEditedOldest' },
  { key: 'title_asc', labelKey: 'recipes.sortTitleAZ' },
  { key: 'title_desc', labelKey: 'recipes.sortTitleZA' },
]
