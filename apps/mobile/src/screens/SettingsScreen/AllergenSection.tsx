import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ALLERGEN_KEYS, INTOLERANCE_KEYS } from '@carrot/shared/utils/allergenKeys'
import { iKey } from './helpers'
import { styles } from './styles'

type ExpandedSection = 'allergens' | 'intolerances' | null

const AccordionGroup = ({
  keysList,
  namespace,
  sectionKey,
  label,
  expanded,
  onToggleExpand,
  predefined,
  onToggleKey,
}: {
  keysList: string[]
  namespace: 'allergens' | 'intolerances'
  sectionKey: 'allergens' | 'intolerances'
  label: string
  expanded: ExpandedSection
  onToggleExpand: (key: ExpandedSection) => void
  predefined: string[]
  onToggleKey: (key: string) => void
}) => {
  const { t } = useTranslation()
  const isExpanded = expanded === sectionKey

  return (
    <View style={styles.accordionBlock}>
      <Pressable
        style={({ pressed }) => [styles.accordionHeader, pressed && { opacity: 0.7 }]}
        onPress={() => onToggleExpand(isExpanded ? null : sectionKey)}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
      >
        <Text style={styles.accordionLabel}>{label}</Text>
        <Text style={styles.accordionChevron}>{isExpanded ? '▲' : '▼'}</Text>
      </Pressable>
      {isExpanded && (
        <View style={styles.accordionBody}>
          {keysList.map((key) => {
            const k = iKey(key)
            const desc = t(`${namespace}.${k}_desc`, { defaultValue: '' })
            const isSelected = predefined.includes(key)
            return (
              <Pressable
                key={key}
                style={({ pressed }) => [styles.checkRow, pressed && { opacity: 0.7 }]}
                onPress={() => onToggleKey(key)}
                accessibilityLabel={t(`${namespace}.${k}`)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={styles.checkContent}>
                  <Text style={styles.checkLabel}>{t(`${namespace}.${k}`)}</Text>
                  {desc ? <Text style={styles.checkDesc}>{desc}</Text> : null}
                </View>
              </Pressable>
            )
          })}
        </View>
      )}
    </View>
  )
}

const AllergenSection = ({
  allergens,
  scopeLabel,
  onSave,
}: {
  allergens: string[]
  scopeLabel: string
  onSave: (data: string[]) => Promise<void>
}) => {
  const { t } = useTranslation()
  const [predefined, setPredefined] = useState<string[]>(allergens ?? [])
  const predefinedRef = useRef(predefined)
  const saveQueueRef = useRef(Promise.resolve())
  const [expanded, setExpanded] = useState<ExpandedSection>(null)

  useEffect(() => {
    if (predefinedRef.current.join('\u0000') === allergens.join('\u0000')) return
    predefinedRef.current = allergens
    setPredefined(allergens)
  }, [allergens])

  const togglePredefined = useCallback((key: string) => {
    const next = predefinedRef.current.includes(key)
      ? predefinedRef.current.filter((item) => item !== key)
      : [...predefinedRef.current, key]
    predefinedRef.current = next
    setPredefined(next)
    saveQueueRef.current = saveQueueRef.current
      .then(() => onSave(next))
      .catch(() => undefined)
  }, [onSave])

  return (
    <View>
      <Text style={styles.scopeLabel}>{scopeLabel}</Text>
      <Text style={styles.allergenDisclaimer}>{t('settings.allergenDisclaimer')}</Text>

      <AccordionGroup
        keysList={ALLERGEN_KEYS}
        namespace="allergens"
        sectionKey="allergens"
        label={t('settings.allergens')}
        expanded={expanded}
        onToggleExpand={setExpanded}
        predefined={predefined}
        onToggleKey={togglePredefined}
      />
      <AccordionGroup
        keysList={INTOLERANCE_KEYS}
        namespace="intolerances"
        sectionKey="intolerances"
        label={t('settings.intolerances')}
        expanded={expanded}
        onToggleExpand={setExpanded}
        predefined={predefined}
        onToggleKey={togglePredefined}
      />

    </View>
  )
}

export default AllergenSection
