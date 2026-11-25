type Translate = (key: string, options?: Record<string, unknown>) => string

export const getFullDeleteLabel = (t: Translate, householdName: string | null | undefined) =>
  householdName ? t('recipes.deleteFromHouseholdAndLibrary', { name: householdName }) : t('recipes.deleteFromLibrary')
