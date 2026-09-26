import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Disclosure, toast } from '@heroui/react'
import {
  ALLERGEN_KEYS,
  INTOLERANCE_KEYS,
} from '@carrot/shared/utils/allergenKeys'
import CheckboxGroup from './CheckboxGroup'

const AUTO_SAVE_DELAY_MS = 500

interface AllergenSectionProps {
  allergens: string[]
  scopeLabel: string
  onSave: (data: string[]) => Promise<void>
}

const AllergenSection = ({
  allergens,
  scopeLabel,
  onSave,
}: AllergenSectionProps) => {
  const { t } = useTranslation()
  const [predefined, setPredefined] = useState<string[]>(allergens ?? [])
  const [editRevision, setEditRevision] = useState(0)
  const onSaveRef = useRef(onSave)
  const translateRef = useRef(t)

  useEffect(() => {
    onSaveRef.current = onSave
    translateRef.current = t
  }, [onSave, t])

  useEffect(() => {
    if (editRevision !== 0) return
    setPredefined((current) =>
      current.length === allergens.length &&
      current.every((key, index) => key === allergens[index])
        ? current
        : allergens
    )
  }, [allergens, editRevision])

  const togglePredefined = useCallback((key: string) => {
    setPredefined((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
    setEditRevision((revision) => revision + 1)
  }, [])

  useEffect(() => {
    if (editRevision === 0) return

    let active = true
    const timeoutId = setTimeout(() => {
      const save = onSaveRef.current

      save(predefined)
        .then(() => {
          if (active)
            toast.success(translateRef.current('settings.allergensSaved'), {
              timeout: 2000,
            })
        })
        .catch((error) => {
          if (active)
            toast.danger(
              error instanceof Error
                ? error.message
                : translateRef.current('settings.failedToSave'),
              { timeout: 3000 }
            )
        })
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      active = false
      clearTimeout(timeoutId)
    }
  }, [editRevision, predefined])

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-zinc-400">{scopeLabel}</p>

      <div className="flex flex-col divide-y divide-zinc-100">
        <Disclosure>
          <Disclosure.Heading>
            <Disclosure.Trigger className="w-full flex items-center justify-between py-2 text-sm font-medium text-zinc-700">
              {t('settings.allergens')}
              <Disclosure.Indicator />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="pb-3">
              <CheckboxGroup
                keys={ALLERGEN_KEYS}
                namespace="allergens"
                predefined={predefined}
                onToggle={togglePredefined}
              />
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>

        <Disclosure>
          <Disclosure.Heading>
            <Disclosure.Trigger className="w-full flex items-center justify-between py-2 text-sm font-medium text-zinc-700">
              {t('settings.intolerances')}
              <Disclosure.Indicator />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="pb-3">
              <CheckboxGroup
                keys={INTOLERANCE_KEYS}
                namespace="intolerances"
                predefined={predefined}
                onToggle={togglePredefined}
              />
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
      </div>
    </div>
  )
}

export default AllergenSection
