import { useTranslation } from 'react-i18next'
import ImportFoundChip from './ImportFoundChip'
import { PasteIcon } from './ImportIcons'
import { parseRecipeText } from './importSources'

interface ImportTextPanelProps {
  text: string
  onTextChange: (value: string) => void
  onPasteText: () => void
}

const TITLE_PREVIEW_LENGTH = 26

const ImportTextPanel = ({
  text,
  onTextChange,
  onPasteText,
}: ImportTextPanelProps) => {
  const { t } = useTranslation()
  const parsed = parseRecipeText(text)
  const titlePreview =
    parsed.title.length > TITLE_PREVIEW_LENGTH
      ? `${parsed.title.slice(0, TITLE_PREVIEW_LENGTH)}…`
      : parsed.title

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex flex-col overflow-hidden rounded-[18px] border-[1.5px] transition-colors"
        style={{ borderColor: text.trim() ? '#3F9B62' : '#E4E1EA' }}
      >
        <div className="flex items-center gap-2 border-b border-[#E5F4EA] bg-[#F5FAF7] py-2.5 pl-4 pr-3">
          <span className="flex-1 text-[13px] font-bold text-[#2F7A4A]">
            {t('addRecipe.pasteAnything')}
          </span>
          <button
            type="button"
            onClick={onPasteText}
            className="flex items-center gap-1.5 rounded-[9px] bg-[#3F9B62] px-3 py-[7px] text-[13px] font-extrabold text-white"
          >
            <PasteIcon />
            {t('addRecipe.paste')}
          </button>
        </div>
        <textarea
          id="recipe-text"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder={t('addRecipe.pasteTextPlaceholder')}
          aria-label={t('addRecipe.methodText')}
          className="h-[260px] w-full resize-none bg-white p-4 text-base leading-[1.55] text-[#1F1D2B] outline-none placeholder:text-[#A9A6B4] sm:h-[220px]"
        />
        <div className="flex items-center border-t border-[#F4F3F7] px-4 py-2">
          <span className="flex-1 text-[13px] font-semibold text-[#8C8A99]">
            {!parsed.chars
              ? ''
              : parsed.ingredients && parsed.steps
                ? t('addRecipe.hintReady')
                : t('addRecipe.hintMissing')}
          </span>
          <span className="text-xs font-semibold text-[#A9A6B4]">
            {parsed.chars
              ? t('addRecipe.charCount', { count: parsed.chars })
              : ''}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <ImportFoundChip
          found={!!parsed.title}
          label={t('addRecipe.foundTitle', { title: titlePreview })}
          missingLabel={t('addRecipe.noTitleYet')}
        />
        <ImportFoundChip
          found={parsed.ingredients > 0}
          label={t('addRecipe.foundIngredients', {
            count: parsed.ingredients,
          })}
          missingLabel={t('addRecipe.noIngredientsYet')}
        />
        <ImportFoundChip
          found={parsed.steps > 0}
          label={t('addRecipe.foundSteps', { count: parsed.steps })}
          missingLabel={t('addRecipe.noStepsYet')}
        />
      </div>
    </div>
  )
}

export default ImportTextPanel
