import { useTranslation } from 'react-i18next'

const TAG_CLASS =
  'whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-extrabold'

const TIMER_RADIUS = 26
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS
const TIMER_PROGRESS = 0.69

type IngredientRowProps = {
  amount: string
  name: string
  isChecked?: boolean
}

const IngredientRow = ({ amount, name, isChecked }: IngredientRowProps) => (
  <div className="flex items-center gap-2.5 text-sm-plus">
    <span
      className={`size-4.5 shrink-0 rounded-sm ${
        isChecked ? 'bg-carrot' : 'border-2 border-line-heavy'
      }`}
    />
    <span>
      <b>{amount}</b> {name}
    </span>
  </div>
)

const RecipeCard = () => {
  const { t } = useTranslation()

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-float-lg rotate-2">
      <div className="h-55 bg-linear-to-br from-amber-wash via-carrot-wash to-carrot-line" />
      <div className="flex flex-col gap-3 px-5 py-4.5">
        <div className="flex flex-wrap gap-1.5">
          <span className={`${TAG_CLASS} bg-violet-wash text-violet-ink`}>
            {t('showcase.demo.tags.dessert')}
          </span>
          <span className={`${TAG_CLASS} bg-violet-wash text-violet-ink`}>
            {t('showcase.demo.tags.baked')}
          </span>
          <span className={`${TAG_CLASS} bg-amber-wash text-amber-ink`}>
            ⚠ {t('showcase.demo.tags.gluten')}
          </span>
        </div>
        <span className="text-xl-plus leading-tight font-extrabold">
          {t('showcase.demo.recipeTitle')}
        </span>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
          <div className="flex-6 bg-violet" />
          <div className="flex-25 bg-amber" />
          <div className="flex-65 bg-carrot" />
        </div>
        <IngredientRow
          amount="150g"
          name={t('showcase.demo.butter')}
          isChecked
        />
        <IngredientRow amount="2" name={t('showcase.demo.eggs')} />
        <IngredientRow amount="225g" name={t('showcase.demo.flour')} />
      </div>
    </div>
  )
}

const ShoppingCard = () => {
  const { t } = useTranslation()

  return (
    <div className="absolute top-87.5 -right-37.5 flex w-57.5 -rotate-4 flex-col gap-2.5 rounded-panel bg-white p-4 shadow-float-md">
      <span className="text-2xs font-extrabold tracking-label text-ink-subtle uppercase">
        {t('showcase.demo.shopping', { count: 12 })}
      </span>
      <div className="h-1.25 overflow-hidden rounded-full bg-track">
        <div className="h-full w-2/5 bg-carrot" />
      </div>
      <div className="flex items-center gap-2 text-sm font-extrabold text-mint-ink">
        <span className="size-2.25 rounded-full bg-mint" />
        {t('showcase.demo.produce')}
      </div>
      <div className="flex items-center gap-2.5 text-sm">
        <span className="size-4 rounded-full border-2 border-mint" />
        <span>
          <b>6</b> {t('showcase.demo.garlic')}
        </span>
      </div>
      <div className="flex items-center gap-2.5 text-sm">
        <span className="size-4 rounded-full bg-mint" />
        <span className="text-ink-faint line-through">
          1 {t('showcase.demo.lemon')}
        </span>
      </div>
    </div>
  )
}

const TimerCard = () => {
  const { t } = useTranslation()

  return (
    <div className="absolute top-122.5 -left-10 flex -rotate-2 items-center gap-3 rounded-tile bg-white px-4 py-3 shadow-float-sm">
      <svg width="44" height="44" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r={TIMER_RADIUS}
          fill="none"
          strokeWidth="8"
          className="stroke-track"
        />
        <circle
          cx="32"
          cy="32"
          r={TIMER_RADIUS}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={TIMER_CIRCUMFERENCE}
          strokeDashoffset={TIMER_CIRCUMFERENCE * (1 - TIMER_PROGRESS)}
          transform="rotate(-90 32 32)"
          className="stroke-carrot"
        />
      </svg>
      <div className="flex flex-col">
        <span className="text-xl font-extrabold">04:32</span>
        <span className="text-xs font-bold text-ink-subtle">
          {t('showcase.demo.timerStep')}
        </span>
      </div>
    </div>
  )
}

/** Decorative collage of app screens shown beside the hero pitch. */
const ProductShot = () => (
  <div
    aria-hidden="true"
    className="relative mt-1.5 hidden w-105 shrink-0 pb-36 xl:block"
  >
    <RecipeCard />
    <ShoppingCard />
    <TimerCard />
  </div>
)

export default ProductShot
