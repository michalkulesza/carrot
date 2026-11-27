import { memo } from 'react'
import type { RecipeOut } from '@carrot/shared/types'
import FadeSection from './FadeSection'
import NotesSection from './NotesSection'
import RelatedRecipesSection from './RelatedRecipesSection'
import { ScrollIntoViewContext, type ScrollIntoViewActions } from './ScrollIntoViewContext'
import StepsSection from './StepsSection'

interface DeferredSectionsProps {
  recipe: RecipeOut
  unitSystem: string
  fontSizeIndex: number
  scrollIntoViewActions: ScrollIntoViewActions
}

const DeferredSections = ({ recipe, unitSystem, fontSizeIndex, scrollIntoViewActions }: DeferredSectionsProps) => (
  <>
    <FadeSection>
      <StepsSection recipe={recipe} unitSystem={unitSystem} fontSizeIndex={fontSizeIndex} />
    </FadeSection>
    <FadeSection>
      <ScrollIntoViewContext.Provider value={scrollIntoViewActions}>
        <NotesSection recipe={recipe} />
      </ScrollIntoViewContext.Provider>
    </FadeSection>
    <FadeSection>
      <RelatedRecipesSection recipeId={recipe.id} />
    </FadeSection>
  </>
)

export default memo(DeferredSections)
