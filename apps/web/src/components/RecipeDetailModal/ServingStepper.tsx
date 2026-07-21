import { Minus, Plus } from 'react-feather'
import { useTranslation } from 'react-i18next'

interface ServingStepperProps {
  servings: number
  onDecrease: () => void
  onIncrease: () => void
}

const ServingStepper = ({
  servings,
  onDecrease,
  onIncrease,
}: ServingStepperProps) => {
  const { t } = useTranslation()
  const canDecrease = servings > 1
  const canIncrease = servings < 99
  const servingCountLabel = t('recipes.servings', { count: servings })

  return (
    <div className="flex min-h-11 items-center justify-between">
      <span className="text-sm text-zinc-700">{t('recipes.serves')}</span>
      <div className="flex items-center overflow-hidden rounded-[10px] bg-zinc-100">
        <button
          type="button"
          onClick={onDecrease}
          disabled={!canDecrease}
          aria-label={t('recipes.decreaseServings')}
          className="flex h-11 w-11 cursor-pointer items-center justify-center text-primary transition-colors hover:bg-zinc-200 disabled:cursor-default disabled:text-zinc-300 disabled:hover:bg-transparent"
        >
          <Minus size={20} aria-hidden="true" />
        </button>
        <span
          role="status"
          aria-live="polite"
          aria-label={servingCountLabel}
          className="min-w-11 text-center text-base font-semibold text-zinc-900"
        >
          {servings}
        </span>
        <button
          type="button"
          onClick={onIncrease}
          disabled={!canIncrease}
          aria-label={t('recipes.increaseServings')}
          className="flex h-11 w-11 cursor-pointer items-center justify-center text-primary transition-colors hover:bg-zinc-200 disabled:cursor-default disabled:text-zinc-300 disabled:hover:bg-transparent"
        >
          <Plus size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export default ServingStepper
