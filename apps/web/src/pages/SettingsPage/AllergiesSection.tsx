import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Switch } from '@heroui/react'
import type {
  AllergenRecheckStatus,
  UserPreferences,
} from '@carrot/shared/types'
import {
  ALLERGEN_KEYS,
  INTOLERANCE_KEYS,
} from '@carrot/shared/utils/allergenKeys'
import { updatePreferences } from '../../api/client'
import AllergenSection from './AllergenSection'
import CountPill from './CountPill'

interface AllergiesSectionProps {
  remountKey: string
  allergens: string[]
  scopeLabel: string
  onSaveAllergens: (data: string[]) => Promise<void>
  allergenRecheckStatus: AllergenRecheckStatus | null
  autoSubstitute: boolean
  onPreferencesChange: (prefs: UserPreferences) => void
}

const AllergiesSection = ({
  remountKey,
  allergens,
  scopeLabel,
  onSaveAllergens,
  allergenRecheckStatus,
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

  const activeCount = useMemo(
    () =>
      [...ALLERGEN_KEYS, ...INTOLERANCE_KEYS].filter((key) =>
        allergens.includes(key)
      ).length,
    [allergens]
  )

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t('settings.allergiesIntolerances')}
        <CountPill count={activeCount} />
      </h2>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-4">
        <AllergenSection
          key={remountKey}
          allergens={allergens}
          scopeLabel={scopeLabel}
          onSave={onSaveAllergens}
        />
        {allergenRecheckStatus && (
          <p className="text-xs text-zinc-500" role="status">
            {allergenRecheckStatus.done
              ? allergenRecheckStatus.failed > 0
                ? t('settings.allergenRecheckFailed', {
                    failed: allergenRecheckStatus.failed,
                  })
                : t('settings.allergenRecheckComplete')
              : t('settings.allergenRecheckProgress', {
                  completed: allergenRecheckStatus.completed,
                  total: allergenRecheckStatus.total,
                })}
          </p>
        )}
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
