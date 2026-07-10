import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ListBox, ListBoxItem, Select, Switch } from '@heroui/react'
import type { UserPreferences } from '@carrot/shared/types'
import { updatePreferences } from '../../api/client'
import { LANGUAGE_CODES, WEEK_DAY_OPTIONS } from './helpers'

interface PreferencesSectionProps {
  preferences: UserPreferences | null
  onPreferencesChange: (prefs: UserPreferences) => void
  wakeLockDefault: boolean
  onWakeLockDefaultChange: (enabled: boolean) => void
  debugMode: boolean
  onDebugModeChange: (enabled: boolean) => void
}

const PreferencesSection = ({
  preferences,
  onPreferencesChange,
  wakeLockDefault,
  onWakeLockDefaultChange,
  debugMode,
  onDebugModeChange,
}: PreferencesSectionProps) => {
  const { t, i18n } = useTranslation()

  const handleWeekStartChange = useCallback(
    (key: React.Key | null) => {
      if (key == null) return
      updatePreferences({ week_start_day: Number(key) })
        .then(onPreferencesChange)
        .catch(() => {})
    },
    [onPreferencesChange]
  )

  const handleUnitSystemChange = useCallback(
    (key: React.Key | null) => {
      if (key == null) return
      updatePreferences({ unit_system: String(key) })
        .then(onPreferencesChange)
        .catch(() => {})
    },
    [onPreferencesChange]
  )

  const handleLanguageChange = useCallback(
    (key: React.Key | null) => {
      if (key == null) return
      const lang = String(key)
      i18n.changeLanguage(lang)
      updatePreferences({ language: lang })
        .then(onPreferencesChange)
        .catch(() => {})
    },
    [i18n, onPreferencesChange]
  )

  const handleWakeLockDefaultChange = useCallback(
    (value: boolean) => {
      localStorage.setItem('wakelock-default', value ? '1' : '0')
      onWakeLockDefaultChange(value)
    },
    [onWakeLockDefaultChange]
  )

  const weekStartDayKey = String(preferences?.week_start_day ?? 1)
  const unitSystemKey = preferences?.unit_system ?? 'metric'
  const languageKey = preferences?.language ?? i18n.language

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t('settings.preferences')}
      </h2>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">
            {t('settings.weekStartsOn')}
          </label>
          <Select
            selectedKey={weekStartDayKey}
            onSelectionChange={handleWeekStartChange}
            aria-label={t('settings.weekStartsOn')}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {WEEK_DAY_OPTIONS.map((opt) => (
                  <ListBoxItem key={opt.key} id={String(opt.key)}>
                    {t(opt.labelKey)}
                  </ListBoxItem>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">
            {t('settings.unitSystem')}
          </label>
          <Select
            selectedKey={unitSystemKey}
            onSelectionChange={handleUnitSystemChange}
            aria-label={t('settings.unitSystem')}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBoxItem key="metric" id="metric">
                  {t('settings.metric')}
                </ListBoxItem>
                <ListBoxItem key="imperial" id="imperial">
                  {t('settings.imperial')}
                </ListBoxItem>
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">
            {t('settings.language')}
          </label>
          <Select
            selectedKey={languageKey}
            onSelectionChange={handleLanguageChange}
            aria-label={t('settings.language')}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {LANGUAGE_CODES.map((code) => (
                  <ListBoxItem key={code} id={code}>
                    {t(`languages.${code}`)}
                  </ListBoxItem>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        {'wakeLock' in navigator && (
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-100">
            <div>
              <p className="text-sm font-medium">
                {t('settings.keepScreenOnDefault')}
              </p>
              <p className="text-xs text-zinc-400">
                {t('settings.keepScreenOnDefaultDesc')}
              </p>
            </div>
            <Switch
              size="sm"
              isSelected={wakeLockDefault}
              onChange={handleWakeLockDefaultChange}
            >
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-100">
          <div>
            <p className="text-sm font-medium">{t('settings.debugMode')}</p>
            <p className="text-xs text-zinc-400">
              {t('settings.debugModeDesc')}
            </p>
          </div>
          <Switch size="sm" isSelected={debugMode} onChange={onDebugModeChange}>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch>
        </div>
      </div>
    </section>
  )
}

export default PreferencesSection
