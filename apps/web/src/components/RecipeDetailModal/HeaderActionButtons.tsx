import { Edit2, Trash2 } from 'react-feather'
import { useTranslation } from 'react-i18next'

interface HeaderActionButtonsProps {
  variant: 'overlay' | 'light'
  onEdit: () => void
  onDelete: () => void
}

const overlayButtonClass =
  'w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors backdrop-blur-sm'
const overlayDeleteButtonClass =
  'w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-danger/80 transition-colors backdrop-blur-sm'
const lightButtonClass =
  'w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors'
const lightDeleteButtonClass =
  'w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 text-danger hover:bg-danger-100 transition-colors'

const HeaderActionButtons = ({
  variant,
  onEdit,
  onDelete,
}: HeaderActionButtonsProps) => {
  const { t } = useTranslation()
  const editClass =
    variant === 'overlay' ? overlayButtonClass : lightButtonClass
  const deleteClass =
    variant === 'overlay' ? overlayDeleteButtonClass : lightDeleteButtonClass

  return (
    <div className="absolute top-3 right-3 flex gap-1.5 z-10">
      <button
        type="button"
        onClick={onEdit}
        aria-label={t('common.edit')}
        className={editClass}
      >
        <Edit2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={t('recipes.remove')}
        className={deleteClass}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

export default HeaderActionButtons
