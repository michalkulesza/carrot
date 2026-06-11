import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { usePreferences } from '@platekeeper/shared/hooks/usePreferences'
import { useHouseholds } from '@platekeeper/shared/hooks/useHouseholds'
import { useApiClient } from '@platekeeper/shared/api/context'
import type { UserPreferences, AllergenData } from '@platekeeper/shared/types'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'
import { useTimers, getRemainingSeconds, formatCountdown } from '../context/TimerContext'
import type { SettingsStackParamList } from '../navigation/SettingsStack'

type Props = NativeStackScreenProps<SettingsStackParamList, 'SettingsMain'>

const LANGUAGES: { code: string; labelKey: string }[] = [
  { code: 'en', labelKey: 'languages.en' },
  { code: 'de', labelKey: 'languages.de' },
  { code: 'pl', labelKey: 'languages.pl' },
  { code: 'fr', labelKey: 'languages.fr' },
  { code: 'es', labelKey: 'languages.es' },
]

const WEEK_START_OPTIONS: { value: number; labelKey: string }[] = [
  { value: 0, labelKey: 'settings.sunday' },
  { value: 1, labelKey: 'settings.monday' },
  { value: 6, labelKey: 'settings.saturday' },
]

const ALLERGEN_KEYS = [
  'gluten', 'crustaceans', 'tree nuts', 'celery', 'mustard',
  'sulphites', 'lupin', 'molluscs', 'eggs', 'fish',
  'peanuts', 'soybeans', 'milk', 'sesame',
]

const INTOLERANCE_KEYS = [
  'lactose', 'ncgs', 'fructose', 'histamine', 'fodmap',
  'caffeine', 'sulphite-sensitivity', 'sorbitol', 'salicylates', 'msg',
]

const iKey = (k: string) => k.replace(/[- ]/g, '_')

const SectionHeader = ({ label }: { label: string }) => (
  <Text style={styles.sectionHeader}>{label}</Text>
)

// ── Allergen section ──────────────────────────────────────────────────────────

const AllergenSection = ({
  allergens,
  scopeLabel,
  onSave,
}: {
  allergens: AllergenData
  scopeLabel: string
  onSave: (data: AllergenData) => Promise<void>
}) => {
  const { t } = useTranslation()
  const [predefined, setPredefined] = useState<string[]>(allergens.predefined ?? [])
  const [custom, setCustom] = useState<string[]>(allergens.custom ?? [])
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<'allergens' | 'intolerances' | 'custom' | null>(null)

  const togglePredefined = (key: string) => {
    setPredefined((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  const addCustom = () => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !custom.includes(tag)) setCustom((prev) => [...prev, tag])
    setTagInput('')
  }

  const removeCustom = (tag: string) => {
    setCustom((prev) => prev.filter((t) => t !== tag))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ predefined, custom })
      Alert.alert(t('common.ok'), t('settings.allergensSaved'))
    } catch (e) {
      Alert.alert(t('common.ok'), e instanceof Error ? e.message : t('settings.failedToSave'))
    } finally {
      setSaving(false)
    }
  }

  const renderGroup = (
    keys: string[],
    namespace: 'allergens' | 'intolerances',
    sectionKey: 'allergens' | 'intolerances',
    label: string,
  ) => (
    <View style={styles.accordionBlock}>
      <TouchableOpacity
        style={styles.accordionHeader}
        onPress={() =>
          setExpanded((prev) => (prev === sectionKey ? null : sectionKey))
        }
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ expanded: expanded === sectionKey }}
      >
        <Text style={styles.accordionLabel}>{label}</Text>
        <Text style={styles.accordionChevron}>
          {expanded === sectionKey ? '▲' : '▼'}
        </Text>
      </TouchableOpacity>
      {expanded === sectionKey && (
        <View style={styles.accordionBody}>
          {keys.map((key) => {
            const k = iKey(key)
            const desc = t(`${namespace}.${k}_desc`, { defaultValue: '' })
            const isSelected = predefined.includes(key)
            return (
              <TouchableOpacity
                key={key}
                style={styles.checkRow}
                onPress={() => togglePredefined(key)}
                accessibilityLabel={t(`${namespace}.${k}`)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={styles.checkContent}>
                  <Text style={styles.checkLabel}>{t(`${namespace}.${k}`)}</Text>
                  {desc ? (
                    <Text style={styles.checkDesc}>{desc}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
    </View>
  )

  return (
    <View>
      <Text style={styles.scopeLabel}>{scopeLabel}</Text>

      {renderGroup(ALLERGEN_KEYS, 'allergens', 'allergens', t('settings.allergens'))}
      {renderGroup(INTOLERANCE_KEYS, 'intolerances', 'intolerances', t('settings.intolerances'))}

      {/* Custom */}
      <View style={styles.accordionBlock}>
        <TouchableOpacity
          style={styles.accordionHeader}
          onPress={() =>
            setExpanded((prev) => (prev === 'custom' ? null : 'custom'))
          }
          accessibilityLabel={t('settings.custom')}
          accessibilityRole="button"
          accessibilityState={{ expanded: expanded === 'custom' }}
        >
          <Text style={styles.accordionLabel}>{t('settings.custom')}</Text>
          <Text style={styles.accordionChevron}>
            {expanded === 'custom' ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>
        {expanded === 'custom' && (
          <View style={styles.accordionBody}>
            <View style={styles.customInputRow}>
              <TextInput
                style={styles.customInput}
                value={tagInput}
                onChangeText={setTagInput}
                placeholder={t('settings.customPlaceholder')}
                onSubmitEditing={addCustom}
                returnKeyType="done"
                accessibilityLabel={t('settings.custom')}
              />
              <TouchableOpacity
                style={styles.addBtn}
                onPress={addCustom}
                accessibilityLabel={t('common.add')}
                accessibilityRole="button"
              >
                <Text style={styles.addBtnText}>{t('common.add')}</Text>
              </TouchableOpacity>
            </View>
            {custom.length > 0 && (
              <View style={styles.tagCloud}>
                {custom.map((tag) => (
                  <View key={tag} style={styles.customTag}>
                    <Text style={styles.customTagText}>{tag}</Text>
                    <TouchableOpacity
                      onPress={() => removeCustom(tag)}
                      accessibilityLabel={t('common.delete')}
                      accessibilityRole="button"
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.customTagRemove}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
        accessibilityLabel={t('common.save')}
        accessibilityRole="button"
      >
        <Text style={styles.saveBtnText}>
          {saving ? t('common.saving') : t('common.save')}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

// ── Timers section ────────────────────────────────────────────────────────────

const TimersSection = () => {
  const { t } = useTranslation()
  const { timers, pauseTimer, resumeTimer, cancelTimer, keepScreenOn, setKeepScreenOn } = useTimers()
  const timerList = [...timers.values()]

  return (
    <View>
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchLabelBlock}>
            <Text style={styles.cardLabel}>{t('timers.keepScreenOn')}</Text>
            <Text style={styles.cardDesc}>{t('timers.keepScreenOnDesc')}</Text>
          </View>
          <Switch
            value={keepScreenOn}
            onValueChange={setKeepScreenOn}
            accessibilityLabel={t('timers.keepScreenOn')}
            trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
            thumbColor={keepScreenOn ? '#2563eb' : '#9ca3af'}
          />
        </View>
      </View>
      {timerList.length > 0 && (
        <View style={[styles.card, { marginTop: 8 }]}>
          {timerList.map((timer) => {
            const remaining = getRemainingSeconds(timer)
            const isRunning = timer.status === 'running'
            return (
              <View key={timer.id} style={styles.timerRow}>
                <View style={styles.timerInfo}>
                  <Text style={styles.timerTitle} numberOfLines={1}>
                    {timer.recipeTitle}
                  </Text>
                  <Text style={styles.timerStep} numberOfLines={1}>
                    {t('common.step')} {timer.stepIndex + 1}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.timerCountdown,
                    {
                      color: timer.status === 'done'
                        ? '#10b981'
                        : isRunning
                          ? '#d97706'
                          : '#9ca3af',
                    },
                  ]}
                >
                  {timer.status === 'done'
                    ? t('common.doneCheck')
                    : formatCountdown(remaining)}
                </Text>
                <View style={styles.timerBtns}>
                  {isRunning ? (
                    <TouchableOpacity
                      onPress={() => pauseTimer(timer.id)}
                      accessibilityLabel={t('common.pause')}
                      accessibilityRole="button"
                    >
                      <Text style={styles.timerBtnText}>⏸</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => resumeTimer(timer.id)}
                      accessibilityLabel={t('common.resume')}
                      accessibilityRole="button"
                    >
                      <Text style={styles.timerBtnText}>▶</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => cancelTimer(timer.id)}
                    accessibilityLabel={t('common.cancel')}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.timerBtnText, { color: '#dc2626' }]}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

const SettingsScreen = ({ navigation }: Props) => {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const { preferences, isLoading, error, update } = usePreferences()
  const { households, activeHouseholdId, activeHousehold, refetchHouseholds } = useHousehold()
  const { create: createHousehold } = useHouseholds()
  const api = useApiClient()

  const handleLanguageChange = useCallback(
    (code: string) => {
      void i18n.changeLanguage(code)
      update.mutate({ language: code } as Partial<UserPreferences>)
    },
    [i18n, update],
  )

  const handleUnitSystemToggle = useCallback(
    (isMetric: boolean) => {
      update.mutate({ unit_system: isMetric ? 'metric' : 'imperial' } as Partial<UserPreferences>)
    },
    [update],
  )

  const handleWeekStartChange = useCallback(
    (value: number) => {
      update.mutate({ week_start_day: value } as Partial<UserPreferences>)
    },
    [update],
  )

  const handleCreateHousehold = useCallback(() => {
    Alert.prompt(
      t('settings.newHouseholdTitle'),
      t('settings.householdNameOptional'),
      async (name) => {
        try {
          await createHousehold.mutateAsync({ name: name?.trim() || undefined })
          refetchHouseholds()
        } catch (e) {
          Alert.alert(t('common.ok'), e instanceof Error ? e.message : 'Error')
        }
      },
      'plain-text',
      '',
    )
  }, [createHousehold, refetchHouseholds, t])

  const handleSaveAllergens = useCallback(
    async (data: AllergenData) => {
      if (activeHousehold) {
        await api.updateHouseholdAllergens(activeHousehold.id, data)
        refetchHouseholds()
      } else {
        await api.updatePreferences({ personal_allergens: data } as Partial<UserPreferences>)
      }
    },
    [activeHousehold, api, refetchHouseholds],
  )

  const allergenScopeLabel = activeHousehold
    ? t('settings.householdScope', { name: activeHousehold.name })
    : t('settings.personalScope')

  const currentAllergens: AllergenData =
    (activeHousehold?.allergens ?? (preferences as any)?.personal_allergens) ?? {
      predefined: [],
      custom: [],
    }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Account */}
      <SectionHeader label={t('settings.account')} />
      <View style={styles.card}>
        {user && (
          <View style={styles.row}>
            <Text style={styles.label}>{t('auth.email')}</Text>
            <Text style={styles.value} numberOfLines={1}>
              {user.email}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.logoutRow}
          onPress={logout}
          accessibilityLabel={t('settings.logOut')}
          accessibilityRole="button"
        >
          <Text style={styles.logoutText}>{t('settings.logOut')}</Text>
        </TouchableOpacity>
      </View>

      {/* Preferences */}
      <SectionHeader label={t('settings.preferences')} />
      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        </View>
      ) : error ? (
        <View style={styles.card}>
          <Text style={styles.errorText}>{error.message}</Text>
        </View>
      ) : (
        <>
          {/* Language */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('settings.language')}</Text>
            <View style={styles.chipRow}>
              {LANGUAGES.map(({ code, labelKey }) => {
                const isSelected = (preferences?.language ?? i18n.language) === code
                return (
                  <TouchableOpacity
                    key={code}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => handleLanguageChange(code)}
                    accessibilityLabel={t(labelKey)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[styles.chipText, isSelected && styles.chipTextSelected]}
                    >
                      {t(labelKey)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Unit system */}
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <Text style={styles.cardLabel}>{t('settings.unitSystem')}</Text>
              <View style={styles.unitToggleRow}>
                <Text
                  style={[
                    styles.unitLabel,
                    preferences?.unit_system !== 'metric' && styles.unitLabelActive,
                  ]}
                >
                  {t('settings.imperial')}
                </Text>
                <Switch
                  value={preferences?.unit_system !== 'imperial'}
                  onValueChange={handleUnitSystemToggle}
                  accessibilityLabel={t('settings.unitSystem')}
                  trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                  thumbColor={
                    preferences?.unit_system !== 'imperial' ? '#2563eb' : '#9ca3af'
                  }
                />
                <Text
                  style={[
                    styles.unitLabel,
                    preferences?.unit_system !== 'imperial' && styles.unitLabelActive,
                  ]}
                >
                  {t('settings.metric')}
                </Text>
              </View>
            </View>
          </View>

          {/* Week start day */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('settings.weekStartsOn')}</Text>
            <View style={styles.chipRow}>
              {WEEK_START_OPTIONS.map(({ value, labelKey }) => {
                const isSelected = (preferences?.week_start_day ?? 1) === value
                return (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => handleWeekStartChange(value)}
                    accessibilityLabel={t(labelKey)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[styles.chipText, isSelected && styles.chipTextSelected]}
                    >
                      {t(labelKey)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        </>
      )}

      {/* Timers */}
      <SectionHeader label={t('settings.timers')} />
      <TimersSection />

      {/* Households */}
      <SectionHeader label={t('settings.households')} />
      <View style={styles.card}>
        {households.length === 0 ? (
          <Text style={styles.emptyHouseholds}>{t('settings.noHouseholds')}</Text>
        ) : (
          households.map((h, index) => (
            <View
              key={h.id}
              style={[
                styles.householdRow,
                index < households.length - 1 && styles.householdRowBorder,
              ]}
            >
              <View
                style={[styles.householdDot, { backgroundColor: h.color }]}
              />
              <View style={styles.householdInfo}>
                <Text style={styles.householdName}>{h.name}</Text>
                {h.id === activeHouseholdId && (
                  <Text style={styles.householdActive}>{t('settings.active')}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.manageBtn}
                onPress={() =>
                  navigation.navigate('HouseholdDetail', {
                    householdId: h.id,
                    householdName: h.name,
                  })
                }
                accessibilityLabel={t('settings.manage')}
                accessibilityRole="button"
              >
                <Text style={styles.manageBtnText}>{t('settings.manage')}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <TouchableOpacity
          style={styles.newHouseholdRow}
          onPress={handleCreateHousehold}
          accessibilityLabel={t('settings.newHousehold')}
          accessibilityRole="button"
        >
          <Text style={styles.newHouseholdText}>{t('settings.newHousehold')}</Text>
        </TouchableOpacity>
      </View>

      {/* Allergens */}
      <SectionHeader label={t('settings.allergiesIntolerances')} />
      <View style={styles.card}>
        <View style={styles.allergenPad}>
          <AllergenSection
            key={activeHouseholdId ?? 'personal'}
            allergens={currentAllergens}
            scopeLabel={allergenScopeLabel}
            onSave={handleSaveAllergens}
          />
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { paddingBottom: 48 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  label: { fontSize: 15, color: '#374151' },
  value: { fontSize: 14, color: '#6b7280', maxWidth: '60%' },
  logoutRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'flex-start',
  },
  logoutText: { color: '#dc2626', fontSize: 15, fontWeight: '500' },
  loadingRow: { padding: 24, alignItems: 'center' },
  errorText: { color: '#dc2626', fontSize: 14, padding: 16 },
  cardLabel: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  cardDesc: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#f9fafb',
  },
  chipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextSelected: { color: '#fff' },
  switchRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabelBlock: { flex: 1, marginRight: 12 },
  unitToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  unitLabel: { fontSize: 14, color: '#9ca3af', fontWeight: '500' },
  unitLabelActive: { color: '#2563eb' },
  // Timer section
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 8,
  },
  timerInfo: { flex: 1 },
  timerTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  timerStep: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  timerCountdown: { fontFamily: 'monospace', fontSize: 14, fontWeight: '700' },
  timerBtns: { flexDirection: 'row', gap: 12 },
  timerBtnText: { fontSize: 16, color: '#6b7280' },
  // Household section
  householdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  householdRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  householdDot: { width: 14, height: 14, borderRadius: 7 },
  householdInfo: { flex: 1 },
  householdName: { fontSize: 14, fontWeight: '500', color: '#111' },
  householdActive: { fontSize: 12, color: '#2563eb', marginTop: 1 },
  manageBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  manageBtnText: { fontSize: 13, fontWeight: '500', color: '#374151' },
  newHouseholdRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  newHouseholdText: { fontSize: 14, color: '#2563eb', fontWeight: '500' },
  emptyHouseholds: {
    fontSize: 14,
    color: '#9ca3af',
    padding: 16,
    textAlign: 'center',
  },
  // Allergen section
  allergenPad: { padding: 16 },
  scopeLabel: { fontSize: 12, color: '#9ca3af', marginBottom: 12 },
  accordionBlock: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    marginTop: 4,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  accordionLabel: { fontSize: 14, fontWeight: '500', color: '#374151' },
  accordionChevron: { fontSize: 10, color: '#9ca3af' },
  accordionBody: { paddingBottom: 12 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  checkContent: { flex: 1 },
  checkLabel: { fontSize: 14, color: '#111' },
  checkDesc: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  customInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111',
  },
  addBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  addBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  tagCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  customTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  customTagText: { fontSize: 13, color: '#374151' },
  customTagRemove: { fontSize: 16, color: '#9ca3af', lineHeight: 18 },
  saveBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
})

export default SettingsScreen
