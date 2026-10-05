import { useTranslation } from 'react-i18next'

interface PopupStepperProps {
  servings: number
  onDecrease: () => void
  onIncrease: () => void
  desktop: boolean
}

const PopupStepper = ({
  servings,
  onDecrease,
  onIncrease,
  desktop,
}: PopupStepperProps) => {
  const { t } = useTranslation()
  const size = desktop
    ? 'h-[30px] w-[30px] rounded-lg text-lg hover:bg-[#FDEFE4]'
    : 'h-11 w-11 rounded-[10px] text-[22px] active:bg-[#FDEFE4]'
  const button = `flex items-center justify-center font-extrabold text-[#E07B39] disabled:opacity-40 ${size}`

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={onDecrease}
        disabled={servings <= 1}
        aria-label={t('recipes.decreaseServings')}
        className={button}
      >
        −
      </button>
      <span
        role="status"
        aria-live="polite"
        aria-label={t('recipes.servings', { count: servings })}
        className={`w-7 text-center font-extrabold ${desktop ? 'text-base' : 'text-[17px]'}`}
      >
        {servings}
      </span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={servings >= 99}
        aria-label={t('recipes.increaseServings')}
        className={button}
      >
        +
      </button>
    </div>
  )
}

export default PopupStepper
