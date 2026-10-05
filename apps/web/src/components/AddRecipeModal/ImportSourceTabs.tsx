import { useTranslation } from 'react-i18next'
import { SourceIcon } from './ImportIcons'
import { SOURCE_STYLES, type ImportMode } from './importSources'

interface ImportSourceTabsProps {
  mode: ImportMode
  onModeChange: (mode: ImportMode) => void
}

const MODES: ImportMode[] = ['url', 'image', 'text']

const ImportSourceTabs = ({ mode, onModeChange }: ImportSourceTabsProps) => {
  const { t } = useTranslation()
  const titles: Record<ImportMode, [string, string, string]> = {
    url: [
      t('addRecipe.tileLinkTitle'),
      t('addRecipe.tileLinkHint'),
      t('addRecipe.linkShort'),
    ],
    image: [
      t('addRecipe.tilePhotoTitle'),
      t('addRecipe.tilePhotoHint'),
      t('addRecipe.photoShort'),
    ],
    text: [
      t('addRecipe.tileTextTitle'),
      t('addRecipe.tileTextHint'),
      t('addRecipe.textShort'),
    ],
  }

  return (
    <div role="tablist" className="grid grid-cols-3 gap-2 sm:gap-3">
      {MODES.map((key) => {
        const s = SOURCE_STYLES[key]
        const on = mode === key
        const [title, hint, short] = titles[key]

        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onModeChange(key)}
            className={`flex flex-col items-center gap-2 rounded-2xl border-2 px-2.5 py-3 text-left transition-all duration-200 sm:items-start sm:gap-2.5 sm:rounded-[18px] sm:p-4 ${
              on
                ? '-translate-y-0.5 opacity-100'
                : mode === 'url'
                  ? 'opacity-100'
                  : 'opacity-60 sm:opacity-[0.55]'
            }`}
            style={{
              background: s.tile,
              borderColor: on ? s.ring : 'transparent',
            }}
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white sm:h-11 sm:w-11"
              style={{ background: s.solid }}
            >
              <SourceIcon mode={key} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span
                className="text-sm font-extrabold sm:text-base"
                style={{ color: s.title }}
              >
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{title}</span>
              </span>
              <span
                className="hidden text-[13px] font-semibold sm:block"
                style={{ color: s.hint }}
              >
                {hint}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default ImportSourceTabs
