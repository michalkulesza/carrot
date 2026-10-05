import type { ChangeEvent, FocusEventHandler } from 'react'
import { useTranslation } from 'react-i18next'

interface PopupNotesProps {
  value: string
  onChange: (value: string) => void
  onBlur: FocusEventHandler<HTMLTextAreaElement>
  desktop: boolean
}

const PopupNotes = ({ value, onChange, onBlur, desktop }: PopupNotesProps) => {
  const { t } = useTranslation()

  return (
    <div className={`flex flex-col gap-2 ${desktop ? '' : 'pt-1.5'}`}>
      <label
        htmlFor="popup-notes"
        className="text-xs font-bold uppercase tracking-[0.07em] text-[#8C8A99]"
      >
        {t('recipes.notes')}
      </label>
      <textarea
        id="popup-notes"
        value={value}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          onChange(event.target.value)
        }
        onBlur={onBlur}
        placeholder={t('recipes.notesPlaceholder')}
        className={`w-full rounded-xl border border-[#ECEAF0] bg-[#FBFAFC] text-[#1F1D2B] outline-none placeholder:text-[#8C8A99] focus:border-[#E8894A] ${
          desktop
            ? 'min-h-[76px] resize-y px-3 py-2.5 text-sm'
            : 'min-h-[84px] resize-none p-3 text-base'
        }`}
        style={{ font: 'inherit', fontSize: desktop ? 14 : 16 }}
      />
    </div>
  )
}

export default PopupNotes
