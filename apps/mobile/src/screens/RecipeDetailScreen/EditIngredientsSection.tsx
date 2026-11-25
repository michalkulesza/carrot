import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { SectionHeader } from '../../components/ui'
import EditIngredientGroupCard from './EditIngredientGroupCard'
import type { EditComponent } from './helpers'

interface EditIngredientsSectionProps {
  components: EditComponent[]
  onNameChange: (ci: number, name: string) => void
  onOpenIngredient: (ci: number, ii: number) => void
  onAddIngredient: (ci: number) => void
}

const SECTION_TOP_GAP = 32

const EditIngredientsSection = ({
  components,
  onNameChange,
  onOpenIngredient,
  onAddIngredient,
}: EditIngredientsSectionProps) => {
  const { t } = useTranslation()

  const multiComponent = components.length > 1

  return (
    <>
      <SectionHeader title={t('recipes.sectionIngredients')} topGap={SECTION_TOP_GAP} />
      {components.map((comp, ci) => (
        <EditIngredientGroupCard
          key={ci}
          comp={comp}
          ci={ci}
          multiComponent={multiComponent}
          onNameChange={onNameChange}
          onOpenIngredient={onOpenIngredient}
          onAddIngredient={onAddIngredient}
        />
      ))}
    </>
  )
}

export default memo(EditIngredientsSection)
