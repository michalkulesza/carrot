import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FocusEventHandler,
} from 'react'
import { useTranslation } from 'react-i18next'

interface RecipeNotesSectionProps {
  value: string
  onChange: (v: string) => void
  onBlur: FocusEventHandler<HTMLTextAreaElement>
  saving: boolean
  fontSizeIndex: number
}

const TEXT_SIZE_CLASSES = [
  'text-sm',
  'text-base',
  'text-[17px]',
  'text-xl',
  'text-2xl',
] as const

const textareaStyle: CSSProperties = {
  minHeight: '4rem',
  fieldSizing: 'content',
} as CSSProperties

const RecipeNotesSection = ({
  value,
  onChange,
  onBlur,
  saving,
  fontSizeIndex,
}: RecipeNotesSectionProps) => {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) =>
    onChange(e.target.value)
  const handleBlur: FocusEventHandler<HTMLTextAreaElement> = (e) => {
    setEditing(false)
    onBlur(e)
  }

  return (
    <div className="pt-2 pb-4 border-b border-zinc-100">
      <p className="text-xs font-semibold uppercase text-zinc-400 mb-1.5">
        {t('recipes.notes')}
        {saving && (
          <span className="ml-2 font-normal normal-case text-zinc-400">
            {t('common.saving')}
          </span>
        )}
      </p>
      {editing ? (
        <textarea
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={t('common.tapToAddNotes')}
          rows={3}
          className={`w-full ${TEXT_SIZE_CLASSES[fontSizeIndex]} bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary resize-none leading-relaxed placeholder:text-zinc-400`}
          style={textareaStyle}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`w-full min-h-16 text-left ${TEXT_SIZE_CLASSES[fontSizeIndex]} rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 leading-relaxed text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30`}
        >
          {value || (
            <span className="text-zinc-400">{t('common.tapToAddNotes')}</span>
          )}
        </button>
      )}
    </div>
  )
}

export default RecipeNotesSection
