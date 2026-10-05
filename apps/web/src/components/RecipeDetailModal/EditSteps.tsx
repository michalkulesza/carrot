import { useTranslation } from 'react-i18next'
import type { SaveComponent } from '@carrot/shared/types'
import { AddRowButton, CloseGlyph, GripIcon } from './EditControls'

interface EditStepsProps {
  component: SaveComponent
  componentIndex: number
  onChange: (ci: number, si: number, value: string) => void
  onAdd: (ci: number) => void
  onRemove: (ci: number, si: number) => void
}

const REMOVE_BUTTON =
  'flex shrink-0 items-center justify-center rounded-lg text-[#A9A6B4] hover:bg-[#FDE8E8] hover:text-[#C53030]'

const StepCard = ({
  index,
  value,
  onChange,
  onRemove,
}: {
  index: number
  value: string
  onChange: (value: string) => void
  onRemove: () => void
}) => {
  const { t } = useTranslation()
  const number = index + 1
  const text = (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={Math.max(2, Math.ceil(value.length / 34))}
      placeholder={t('recipes.stepPlaceholder')}
      aria-label={t('recipes.stepLabel', { n: number })}
      className="w-full resize-none rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-base leading-normal text-[#1F1D2B] outline-none hover:bg-[#FBFAFC] focus:border-[#E8894A] focus:bg-white focus:ring-[3px] focus:ring-[#FDEFE4] lg:-my-[3px] lg:flex-1 lg:px-2 lg:py-[3px] lg:text-[15px] lg:leading-[1.55]"
    />
  )
  const badge = (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F1EFF5] text-[13px] font-extrabold text-[#4A4858]">
      {number}
    </span>
  )

  return (
    <div className="rounded-[14px] border border-[#ECEAF0] bg-white p-3 hover:border-[#DDD9E4] lg:flex lg:items-start lg:gap-3 lg:py-3 lg:pl-2 lg:pr-2.5">
      <div className="flex items-center gap-2.5 lg:hidden">
        <GripIcon />
        {badge}
        <span className="flex-1 text-[13px] font-bold text-[#8C8A99]">
          {t('recipes.stepLabel', { n: number })}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('recipes.removeStep')}
          className={`-my-1.5 h-11 w-11 ${REMOVE_BUTTON}`}
        >
          <CloseGlyph size={15} />
        </button>
      </div>
      <div className="mt-2 lg:mt-0 lg:contents">
        <GripIcon className="hidden lg:mt-1.5 lg:block" />
        <span className="hidden lg:block">{badge}</span>
        {text}
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('recipes.removeStep')}
          className={`hidden h-[30px] w-[30px] lg:flex ${REMOVE_BUTTON}`}
        >
          <CloseGlyph size={14} />
        </button>
      </div>
    </div>
  )
}

const EditSteps = ({
  component,
  componentIndex,
  onChange,
  onAdd,
  onRemove,
}: EditStepsProps) => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2.5">
      {component.steps.map((step, index) => (
        <StepCard
          key={index}
          index={index}
          value={step}
          onChange={(value) => onChange(componentIndex, index, value)}
          onRemove={() => onRemove(componentIndex, index)}
        />
      ))}
      <AddRowButton
        onClick={() => onAdd(componentIndex)}
        className="h-12 lg:h-11"
      >
        + {t('recipes.addStep')}
      </AddRowButton>
    </div>
  )
}

export default EditSteps
