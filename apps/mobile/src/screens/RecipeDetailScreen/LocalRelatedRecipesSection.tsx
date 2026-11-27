import { memo } from 'react'
import type { RecipeOut } from '@carrot/shared/types'
import RelatedRecipesView from './RelatedRecipesView'

interface LocalRelatedRecipesSectionProps {
  related: RecipeOut[]
  onRelatedChange: (related: RecipeOut[]) => void
}

const LocalRelatedRecipesSection = ({ related, onRelatedChange }: LocalRelatedRecipesSectionProps) => (
  <RelatedRecipesView recipeId={null} related={related} isSaving={false} editing onSave={onRelatedChange} />
)

export default memo(LocalRelatedRecipesSection)
