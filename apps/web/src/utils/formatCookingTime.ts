export const formatCookingTime = (
  minutes: number | null,
  t: (key: string) => string
) => {
  if (minutes === null) return ''
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours === 0) return `${minutes} ${t('recipes.minutesShort')}`
  if (remainingMinutes === 0) return `${hours} ${t('recipes.hoursShort')}`

  return `${hours} ${t('recipes.hoursShort')} ${remainingMinutes} ${t('recipes.minutesShort')}`
}
