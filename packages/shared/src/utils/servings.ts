export const MIN_SERVINGS = 1
export const MAX_SERVINGS = 99

export const parseServings = (value: string): number | null => {
  if (value.trim() === '') return null

  const servings = Math.round(Number(value))

  return Number.isFinite(servings) ? Math.max(MIN_SERVINGS, servings) : null
}
