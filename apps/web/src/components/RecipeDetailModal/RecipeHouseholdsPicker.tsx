import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { HouseholdOut } from '@carrot/shared/types'

interface RecipeHouseholdsPickerProps {
  households: HouseholdOut[]
  householdIds: string[]
  busy: boolean
  onChange: (householdIds: string[]) => void
}

interface HouseholdCheckboxRowProps {
  household: HouseholdOut
  checked: boolean
  busy: boolean
  onToggle: (householdId: string, checked: boolean) => void
}

const HouseholdCheckboxRow = ({
  household,
  checked,
  busy,
  onToggle,
}: HouseholdCheckboxRowProps) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onToggle(household.id, e.target.checked),
    [household.id, onToggle]
  )

  return (
    <label className="flex items-center gap-2 text-sm py-1 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={busy}
        onChange={handleChange}
        className="rounded border-zinc-300 text-primary focus:ring-primary/30"
      />
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: household.color }}
      />
      <span className="truncate">{household.name}</span>
    </label>
  )
}

const RecipeHouseholdsPicker = ({
  households,
  householdIds,
  busy,
  onChange,
}: RecipeHouseholdsPickerProps) => {
  const { t } = useTranslation()

  const handleToggle = useCallback(
    (householdId: string, checked: boolean) => {
      const next = checked
        ? Array.from(new Set([...householdIds, householdId]))
        : householdIds.filter((id) => id !== householdId)
      onChange(next)
    },
    [householdIds, onChange]
  )

  if (households.length === 0) return null

  return (
    <div className="flex flex-col gap-1 px-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t('recipes.inHouseholds')}
      </p>
      {households.map((h) => (
        <HouseholdCheckboxRow
          key={h.id}
          household={h}
          checked={householdIds.includes(h.id)}
          busy={busy}
          onToggle={handleToggle}
        />
      ))}
    </div>
  )
}

export default RecipeHouseholdsPicker
