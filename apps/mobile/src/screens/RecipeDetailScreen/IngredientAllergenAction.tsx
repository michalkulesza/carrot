import { memo } from 'react'
import type { ReactNode } from 'react'
import AllergenBadge from './AllergenBadge'
import type { IngredientAllergenLabels } from './useIngredientAllergenLabels'

interface IngredientAllergenActionProps {
  swappable: boolean
  showBadge: boolean
  swapChip: ReactNode
  labels: IngredientAllergenLabels
  onTooltipOpenChange: (open: boolean) => void
}

const IngredientAllergenAction = ({
  swappable,
  showBadge,
  swapChip,
  labels,
  onTooltipOpenChange,
}: IngredientAllergenActionProps) => {
  if (swappable) return swapChip
  if (!showBadge) return null

  return (
    <AllergenBadge
      label={labels.allergenLabel}
      accessibilityLabel={labels.containsLabel}
      tooltipHeader={labels.allergenName}
      tooltipText={labels.allergenTooltip}
      onTooltipOpenChange={onTooltipOpenChange}
    />
  )
}

export default memo(IngredientAllergenAction)
