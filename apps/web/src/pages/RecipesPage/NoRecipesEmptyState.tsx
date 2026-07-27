import { useTranslation } from 'react-i18next'
import { Button } from '@heroui/react'
import { useMyRecipes } from '@carrot/shared/hooks/useRecipes'
import { useHousehold } from '../../context/HouseholdContext'

interface NoRecipesEmptyStateProps {
  onAddRecipe: () => void
}

const NoRecipesEmptyState = ({ onAddRecipe }: NoRecipesEmptyStateProps) => {
  const { t } = useTranslation()
  const { activeHouseholdId } = useHousehold()
  const { data: myRecipes = [] } = useMyRecipes()
  const hasUnlinkedRecipes = myRecipes.some(
    (r) => !activeHouseholdId || !r.household_ids.includes(activeHouseholdId)
  )

  return (
    <div className="flex flex-col items-center justify-center py-24 text-zinc-400 px-4 text-center gap-4">
      <div>
        <p className="text-lg">{t('recipes.noRecipesYet')}</p>
        <p className="text-sm mt-1">{t('recipes.addPrompt')}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onPress={onAddRecipe}>
          {t('recipes.addARecipe')}
        </Button>
        {hasUnlinkedRecipes && (
          <Button variant="secondary" size="sm" onPress={onAddRecipe}>
            {t('addRecipe.fromMyRecipes')}
          </Button>
        )}
      </div>
    </div>
  )
}

export default NoRecipesEmptyState
