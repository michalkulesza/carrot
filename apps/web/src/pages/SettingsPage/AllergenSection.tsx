import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Disclosure, toast } from '@heroui/react'
import {
  ALLERGEN_KEYS,
  INTOLERANCE_KEYS,
} from '@carrot/shared/utils/allergenKeys'
import { streamReanalyze } from '../../api/client'
import CheckboxGroup from './CheckboxGroup'

const AUTO_SAVE_DELAY_MS = 3000

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
  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeProgress, setReanalyzeProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const isFirstRender = useRef(true)

  const togglePredefined = useCallback((key: string) => {
    setPredefined((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }, [])

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    const timeoutId = setTimeout(() => {
      onSave(predefined)
        .then(() =>
          toast.success(t('settings.allergensSaved'), { timeout: 2000 })
        )
        .catch((e) =>
          toast.danger(
            e instanceof Error ? e.message : t('settings.failedToSave'),
            { timeout: 3000 }
          )
        )
    }, AUTO_SAVE_DELAY_MS)

    return () => clearTimeout(timeoutId)
  }, [predefined, onSave, t])

  const handleReanalyze = useCallback(() => {
    setReanalyzing(true)
    setReanalyzeProgress({ done: 0, total: 0 })
    streamReanalyze({
      onStart: (total) => setReanalyzeProgress({ done: 0, total }),
      onProgress: (done, total) => setReanalyzeProgress({ done, total }),
      onComplete: (analyzed) => {
        setReanalyzing(false)
        setReanalyzeProgress(null)
        toast.success(t('settings.reanalyzedRecipes', { count: analyzed }), {
          timeout: 3000,
        })
      },
      onError: (msg) => {
        setReanalyzing(false)
        setReanalyzeProgress(null)
        toast.danger(msg, { timeout: 3000 })
      },
    })
  }, [t])

  const hasProgress = reanalyzeProgress && reanalyzeProgress.total > 0
  const reanalyzeButtonLabel = reanalyzing
    ? hasProgress
      ? t('settings.analyzingProgress', {
          done: reanalyzeProgress.done,
          total: reanalyzeProgress.total,
        })
      : t('settings.starting')
    : t('settings.reAnalyzeRecipes')

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

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="secondary"
          onPress={handleReanalyze}
          isDisabled={reanalyzing}
        >
          {reanalyzeButtonLabel}
        </Button>
      </div>
    </div>
  )
}

export default AllergenSection
