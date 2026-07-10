import type { ChangeEvent, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@heroui/react'

interface DataSectionProps {
  exporting: boolean
  importing: boolean
  importResult: string | null
  fileRef: RefObject<HTMLInputElement | null>
  onExport: () => void
  onChooseFile: () => void
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
}

const DataSection = ({
  exporting,
  importing,
  importResult,
  fileRef,
  onExport,
  onChooseFile,
  onFileChange,
}: DataSectionProps) => {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t('settings.data')}
      </h2>

      <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium">{t('settings.exportRecipes')}</p>
        <p className="text-xs text-zinc-400">{t('settings.exportDesc')}</p>
        <Button
          size="sm"
          variant="secondary"
          onPress={onExport}
          isDisabled={exporting}
          className="self-start"
        >
          {exporting ? t('settings.exporting') : t('settings.exportCSV')}
        </Button>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-sm font-medium">{t('settings.importRecipes')}</p>
        <p className="text-xs text-zinc-400">{t('settings.importDesc')}</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={onFileChange}
        />
        <Button
          size="sm"
          variant="secondary"
          onPress={onChooseFile}
          isDisabled={importing}
          className="self-start"
        >
          {importing ? t('settings.importing') : t('settings.chooseCSV')}
        </Button>
        {importResult && (
          <p className="text-xs text-success font-medium">{importResult}</p>
        )}
      </div>
    </section>
  )
}

export default DataSection
