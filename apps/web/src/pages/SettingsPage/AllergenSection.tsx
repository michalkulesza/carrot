import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Disclosure, toast } from '@heroui/react'
import type { AllergenData } from '@carrot/shared/types'
import { streamReanalyze } from '../../api/client'
import CheckboxGroup from './CheckboxGroup'
import { ALLERGEN_KEYS, INTOLERANCE_KEYS } from './helpers'

interface AllergenSectionProps {
  allergens: AllergenData
  scopeLabel: string
  onSave: (data: AllergenData) => Promise<void>
}

const AllergenSection = ({
  allergens,
  scopeLabel,
  onSave,
}: AllergenSectionProps) => {
  const { t } = useTranslation()
  const [predefined, setPredefined] = useState<string[]>(
    allergens.predefined ?? []
  )
  const [custom, setCustom] = useState<string[]>(allergens.custom ?? [])
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeProgress, setReanalyzeProgress] = useState<{
    done: number
    total: number
  } | null>(null)

  const togglePredefined = useCallback((key: string) => {
    setPredefined((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }, [])

  const addCustomTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase()
    if (tag && !custom.includes(tag)) {
      setCustom((prev) => [...prev, tag])
    }
    setTagInput('')
  }, [tagInput, custom])

  const removeCustomTag = useCallback((tag: string) => {
    setCustom((prev) => prev.filter((t) => t !== tag))
  }, [])

  const handleTagInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        addCustomTag()
      }
    },
    [addCustomTag]
  )

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await onSave({ predefined, custom })
      toast.success(t('settings.allergensSaved'), { timeout: 2000 })
    } catch (e) {
      toast.danger(
        e instanceof Error ? e.message : t('settings.failedToSave'),
        { timeout: 3000 }
      )
    } finally {
      setSaving(false)
    }
  }, [onSave, predefined, custom, t])

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

        <Disclosure>
          <Disclosure.Heading>
            <Disclosure.Trigger className="w-full flex items-center justify-between py-2 text-sm font-medium text-zinc-700">
              {t('settings.custom')}
              <Disclosure.Indicator />
            </Disclosure.Trigger>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="pb-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('settings.customPlaceholder')}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagInputKeyDown}
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <Button size="sm" variant="secondary" onPress={addCustomTag}>
                  {t('common.add')}
                </Button>
              </div>
              {custom.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {custom.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-600"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeCustomTag(tag)}
                        className="text-zinc-400 hover:text-zinc-700 ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="primary"
          onPress={handleSave}
          isDisabled={saving}
        >
          {saving ? t('common.saving') : t('common.save')}
        </Button>
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
