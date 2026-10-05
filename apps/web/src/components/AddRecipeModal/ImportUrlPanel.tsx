import { useTranslation } from 'react-i18next'
import { PasteIcon } from './ImportIcons'
import { PLATFORM_COLORS, detectPlatform } from './importSources'

interface ImportUrlPanelProps {
  url: string
  onUrlChange: (value: string) => void
  onPasteUrl: () => void
}

const ImportUrlPanel = ({
  url,
  onUrlChange,
  onPasteUrl,
}: ImportUrlPanelProps) => {
  const { t } = useTranslation()
  const platform = detectPlatform(url)
  const platformColors = platform ? PLATFORM_COLORS[platform] : null
  const platformLabel = (value: string) =>
    value === 'Website' ? t('addRecipe.platformWebsite') : value

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-2">
        <div
          className="flex h-14 items-center gap-2.5 sm:flex-1 rounded-[14px] border-[1.5px] px-3.5 transition-colors sm:h-[52px]"
          style={{ borderColor: platformColors?.fg ?? '#E4E1EA' }}
        >
          {platform && platformColors && (
            <span
              className="shrink-0 rounded-full px-[9px] py-[3px] text-xs font-extrabold"
              style={{
                background: platformColors.bg,
                color: platformColors.fg,
              }}
            >
              {platformLabel(platform)}
            </span>
          )}
          <input
            id="recipe-url"
            type="url"
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder={t('addRecipe.pasteLinkPlaceholder')}
            aria-label={t('addRecipe.recipeUrl')}
            className="min-w-0 flex-1 bg-transparent text-base text-[#1F1D2B] outline-none placeholder:text-[#A9A6B4]"
          />
        </div>
        <button
          type="button"
          onClick={onPasteUrl}
          className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-[#FDEFE4] px-[18px] text-base font-extrabold text-[#C4652A] hover:bg-[#FBE2CF] sm:text-[15px]"
        >
          <span className="sm:hidden">
            <PasteIcon size={16} />
          </span>
          {t('addRecipe.paste')}
        </button>
      </div>
    </div>
  )
}

export default ImportUrlPanel
