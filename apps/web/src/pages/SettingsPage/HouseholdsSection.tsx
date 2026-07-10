import { useTranslation } from 'react-i18next'
import { Button } from '@heroui/react'
import type { HouseholdOut } from '@carrot/shared/types'

interface HouseholdsSectionProps {
  households: HouseholdOut[]
  activeHouseholdId: string | null
  onCreateNew: () => void
  onManage: (household: HouseholdOut) => void
}

const HouseholdsSection = ({
  households,
  activeHouseholdId,
  onCreateNew,
  onManage,
}: HouseholdsSectionProps) => {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {t('settings.households')}
        </h2>
        <Button size="sm" variant="secondary" onPress={onCreateNew}>
          {t('settings.newHousehold')}
        </Button>
      </div>

      {households.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-400">
          {t('settings.noHouseholds')}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {households.map((h) => (
            <li
              key={h.id}
              className="rounded-xl border border-zinc-200 bg-white p-3 flex items-center gap-3"
            >
              <span
                className="w-4 h-4 rounded-full shrink-0"
                style={{ backgroundColor: h.color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{h.name}</p>
                {h.id === activeHouseholdId && (
                  <p className="text-xs text-primary">{t('settings.active')}</p>
                )}
              </div>
              <Button size="sm" variant="secondary" onPress={() => onManage(h)}>
                {t('settings.manage')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default HouseholdsSection
