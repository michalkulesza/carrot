import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Switch } from '@heroui/react'
import type { AllergenData, UserPreferences } from '@carrot/shared/types'
import { updatePreferences } from '../../api/client'
import AllergenSection from './AllergenSection'

interface AllergiesSectionProps {
  remountKey: string
  allergens: AllergenData
  scopeLabel: string
  onSaveAllergens: (data: AllergenData) => Promise<void>
  autoSubstitute: boolean
  onPreferencesChange: (prefs: UserPreferences) => void
}

const AllergiesSection = ({
  remountKey,
  allergens,
  scopeLabel,
  onSaveAllergens,
  autoSubstitute,
  onPreferencesChange,
}: AllergiesSectionProps) => {
  const { t } = useTranslation()

  const handleAutoSubstituteChange = useCallback(
    (value: boolean) => {
      updatePreferences({ auto_substitute: value })
        .then(onPreferencesChange)
        .catch(() => {})
    },
    [onPreferencesChange]
  )

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t('settings.allergiesIntolerances')}
      </h2>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-4">
        <AllergenSection
          key={remountKey}
          allergens={allergens}
          scopeLabel={scopeLabel}
          onSave={onSaveAllergens}
        />
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100">
          <div>
            <p className="text-sm font-medium">
              {t('settings.autoApplySubstitutes')}
            </p>
            <p className="text-xs text-zinc-400">
              {t('settings.autoApplySubstitutesDesc')}
            </p>
          </div>
          <Switch
            size="sm"
            isSelected={autoSubstitute}
            onChange={handleAutoSubstituteChange}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
        </div>
      </div>
    </section>
  )
}

export default AllergiesSection
