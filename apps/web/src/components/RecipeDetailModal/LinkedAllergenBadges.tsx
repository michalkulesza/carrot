import { useTranslation } from 'react-i18next'
import {
  matchesActiveAllergen,
  normalizeAllergenKey,
} from '@carrot/shared/utils/allergenKeys'

interface LinkedAllergenBadgesProps {
  allergens: string[] | null | undefined
  activeAllergens: string[]
  pill?: boolean
}

const LinkedAllergenBadges = ({
  allergens,
  activeAllergens,
  pill = false,
}: LinkedAllergenBadgesProps) => {
  const { t } = useTranslation()
  const matched = (allergens ?? []).filter((allergen) =>
    matchesActiveAllergen(allergen, activeAllergens)
  )

  return matched.map((allergen) => {
    const label = t(`allergens.${normalizeAllergenKey(allergen)}`, {
      defaultValue: allergen,
    })

    return (
      <span
        key={allergen}
        title={`${t('recipes.fromLinkedRecipe')}: ${label}`}
        className={
          pill
            ? 'flex shrink-0 items-center rounded-full bg-[#FEF3DC] px-2 py-0.5 text-xs font-bold whitespace-nowrap text-[#A85A0B]'
            : 'flex shrink-0 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-700'
        }
      >
        {pill ? label.toLowerCase() : `⚠ ${label}`}
      </span>
    )
  })
}

export default LinkedAllergenBadges
