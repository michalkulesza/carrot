import { useTranslation } from 'react-i18next'
import { EditIcon, PlanIcon, ShareIcon, StarIcon } from './PopupIcons'
import RecipeActionButton from './RecipeActionButton'

interface RecipeActionRowProps {
  isFavourite: boolean
  onToggleFavourite: () => void
  onShare: () => void
  onOpenMealPlan: () => void
  onEdit: () => void
  editPending: boolean
  desktop: boolean
}

const RecipeActionRow = ({
  isFavourite,
  onToggleFavourite,
  onShare,
  onOpenMealPlan,
  onEdit,
  editPending,
  desktop,
}: RecipeActionRowProps) => {
  const { t } = useTranslation()

  const favouriteAriaLabel = isFavourite
    ? t('recipes.removeFromFavourites')
    : t('recipes.addToFavourites')
  const favouriteColor = isFavourite ? 'text-[#E8894A]' : 'text-[#4A4858]'
  const favouriteFill = isFavourite ? '#E8894A' : 'none'
  const rowClassName = desktop
    ? 'flex flex-wrap gap-4 text-sm font-bold'
    : 'flex gap-1 border-y border-[#ECEAF0] py-1 text-xs font-bold'

  return (
    <div className={rowClassName}>
      <RecipeActionButton
        icon={<StarIcon size={17} fill={favouriteFill} />}
        label={t('recipes.favouriteShort')}
        ariaLabel={favouriteAriaLabel}
        onClick={onToggleFavourite}
        colorClassName={favouriteColor}
        desktop={desktop}
      />
      <RecipeActionButton
        icon={<ShareIcon />}
        label={t('publicShare.share')}
        ariaLabel={t('publicShare.open')}
        onClick={onShare}
        desktop={desktop}
      />
      <RecipeActionButton
        icon={<PlanIcon />}
        label={t('recipes.planShort')}
        ariaLabel={t('mealPlan.addToMealPlan')}
        onClick={onOpenMealPlan}
        desktop={desktop}
      />
      <RecipeActionButton
        icon={<EditIcon />}
        label={t('common.edit')}
        ariaLabel={t('common.edit')}
        onClick={onEdit}
        pending={editPending}
        desktop={desktop}
      />
    </div>
  )
}

export default RecipeActionRow
