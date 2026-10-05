import { useTranslation } from 'react-i18next'

interface EditDeleteZoneProps {
  confirming: boolean
  busy: boolean
  canDelete: boolean
  householdName: string | null
  isAuthor: boolean
  onRequestDelete: () => void
  onCancelDelete: () => void
  onRemoveFromHousehold: () => void
  onDeleteEverywhere: () => void
}

const CONFIRM_BUTTON =
  'flex h-12 w-full items-center justify-center rounded-xl px-3 text-center text-[15px] font-extrabold disabled:opacity-60 lg:h-auto lg:py-[9px] lg:text-sm'

const EditDeleteZone = ({
  confirming,
  busy,
  canDelete,
  householdName,
  isAuthor,
  onRequestDelete,
  onCancelDelete,
  onRemoveFromHousehold,
  onDeleteEverywhere,
}: EditDeleteZoneProps) => {
  const { t } = useTranslation()
  if (!canDelete && !confirming) return null

  return (
    <div className="border-t border-[#ECEAF0] pt-3 lg:pt-3.5">
      {confirming ? (
        <div className="flex flex-col gap-2.5 rounded-[14px] bg-[#FDE8E8] p-3.5 lg:rounded-xl lg:px-3.5 lg:py-3">
          <span className="text-[15px] font-extrabold text-[#7A1E1E] lg:text-sm">
            {t('recipes.deleteThisRecipe')}
          </span>
          <div className="flex flex-col gap-2">
            {householdName && (
              <button
                type="button"
                onClick={onRemoveFromHousehold}
                disabled={busy}
                className={`${CONFIRM_BUTTON} bg-white text-[#C53030]`}
              >
                {t('recipes.deleteFromHousehold', { name: householdName })}
              </button>
            )}
            {isAuthor && (
              <button
                type="button"
                onClick={onDeleteEverywhere}
                disabled={busy}
                className={`${CONFIRM_BUTTON} bg-[#C53030] text-white`}
              >
                {t('recipes.deleteEverywhere')}
              </button>
            )}
            <button
              type="button"
              onClick={onCancelDelete}
              disabled={busy}
              className={`${CONFIRM_BUTTON} bg-white text-[#1F1D2B]`}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onRequestDelete}
          disabled={busy}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#FDE8E8] text-base font-extrabold text-[#C53030] disabled:opacity-60 lg:h-auto lg:justify-start lg:rounded-none lg:bg-transparent lg:py-2 lg:text-sm"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          </svg>
          {t('recipes.deleteRecipe')}
        </button>
      )}
    </div>
  )
}

export default EditDeleteZone
