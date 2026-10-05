import { useTranslation } from 'react-i18next'
import { EditIcon, PlanIcon, ShareIcon, StarIcon } from './PopupIcons'

interface RecipeActionRowProps {
  isFavourite: boolean
  onToggleFavourite: () => void
  onShare: () => void
  onOpenMealPlan: () => void
  onEdit: () => void
  desktop: boolean
}

const RecipeActionRow = ({
  isFavourite,
  onToggleFavourite,
  onShare,
  onOpenMealPlan,
  onEdit,
  desktop,
}: RecipeActionRowProps) => {
  const { t } = useTranslation()
  const item = desktop
    ? 'flex items-center gap-1.5'
    : 'flex h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-xs active:bg-[#F4F3F7]'
  const favColor = isFavourite ? 'text-[#E8894A]' : 'text-[#4A4858]'
  const actions = [
    {
      key: 'save',
      label: t('common.save'),
      ariaLabel: isFavourite
        ? t('recipes.removeFromFavourites')
        : t('recipes.addToFavourites'),
      icon: (
        <StarIcon
          size={desktop ? 17 : 17}
          fill={isFavourite ? '#E8894A' : 'none'}
        />
      ),
      onClick: onToggleFavourite,
      color: favColor,
    },
    {
      key: 'share',
      label: t('publicShare.share'),
      ariaLabel: t('publicShare.open'),
      icon: <ShareIcon />,
      onClick: onShare,
      color: 'text-[#4A4858]',
    },
    {
      key: 'plan',
      label: t('recipes.planShort'),
      ariaLabel: t('mealPlan.addToMealPlan'),
      icon: <PlanIcon />,
      onClick: onOpenMealPlan,
      color: 'text-[#4A4858]',
    },
    {
      key: 'edit',
      label: t('common.edit'),
      ariaLabel: t('common.edit'),
      icon: <EditIcon />,
      onClick: onEdit,
      color: 'text-[#4A4858]',
    },
  ]

  return (
    <div
      className={
        desktop
          ? 'flex flex-wrap gap-4 text-sm font-bold'
          : 'flex gap-1 border-y border-[#ECEAF0] py-1 text-xs font-bold'
      }
    >
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={action.onClick}
          aria-label={action.ariaLabel}
          className={`${item} ${action.color}`}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  )
}

export default RecipeActionRow
