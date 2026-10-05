import { useTranslation } from 'react-i18next'
import { SOURCE_STYLES, type ImportMode } from './importSources'

interface ImportLoadingStateProps {
  mode: ImportMode
}

const ImportLoadingState = ({ mode }: ImportLoadingStateProps) => {
  const { t } = useTranslation()
  const style = SOURCE_STYLES[mode]

  return (
    <div
      aria-live="polite"
      className="flex min-h-[200px] flex-col items-center justify-center gap-3.5 rounded-[18px] p-[22px] text-center sm:min-h-0"
      style={{ background: style.tile }}
    >
      <div
        className="h-11 w-11 animate-spin rounded-full border-4 border-white/80"
        style={{ borderTopColor: style.title }}
      />
      <span className="text-xl font-extrabold" style={{ color: style.title }}>
        {t('importJobs.running')}
      </span>
    </div>
  )
}

export default ImportLoadingState
