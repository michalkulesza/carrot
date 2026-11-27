import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { MealPlanEntry } from '@carrot/shared/types'
import { lightHaptic } from '../../components/ui/haptics'

export const useTonightDish = (
  entry: MealPlanEntry,
  onOpen: (entry: MealPlanEntry) => void,
  onCook: (entry: MealPlanEntry) => void,
) => {
  const { t } = useTranslation()
  const { recipe } = entry
  const title = recipe?.title ?? entry.text ?? ''
  const cookLabel = t('home.cookTitle', { title })

  const handleOpen = useCallback(() => {
    lightHaptic()
    onOpen(entry)
  }, [entry, onOpen])

  const handleCook = useCallback(() => onCook(entry), [entry, onCook])

  return { recipe, title, cookLabel, handleOpen, handleCook }
}
