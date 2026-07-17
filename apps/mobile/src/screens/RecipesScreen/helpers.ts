export const PERSONAL_MENU_ID = '__personal__'
export const MANAGE_TIP_MENU_ID = '__manage_tip__'

export const RECIPE_FAVOURITE_ACTION = '__recipe_favourite__'
export const RECIPE_EDIT_ACTION = '__recipe_edit__'
export const RECIPE_SHARE_ACTION = '__recipe_share__'
export const RECIPE_DELETE_ACTION = '__recipe_delete__'

// The search bar's expanded header height can only be learned from a real focus event
// (see comment near searchBarHeightRef in index.tsx) — it's a fixed native constant for this
// screen's header configuration, so once measured on this device it's persisted to disk
// and never needs to be (re-)learned again, only on the very first search tap ever.
export const SEARCH_BAR_HEIGHT_DELTA_STORAGE_KEY = 'recipes-search-bar-height-delta'
export let learnedSearchBarHeightDelta: number | null = null
export const setLearnedSearchBarHeightDelta = (value: number) => {
  learnedSearchBarHeightDelta = value
}

export type SortMode = 'newest' | 'oldest' | 'title_asc' | 'title_desc' | 'edited_newest' | 'edited_oldest'

export const SORT_OPTIONS: { key: SortMode; labelKey: string }[] = [
  { key: 'newest', labelKey: 'recipes.sortNewest' },
  { key: 'oldest', labelKey: 'recipes.sortOldest' },
  { key: 'edited_newest', labelKey: 'recipes.sortEditedNewest' },
  { key: 'edited_oldest', labelKey: 'recipes.sortEditedOldest' },
  { key: 'title_asc', labelKey: 'recipes.sortTitleAZ' },
  { key: 'title_desc', labelKey: 'recipes.sortTitleZA' },
]
