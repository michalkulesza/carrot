import { useTranslation } from 'react-i18next'
import { proxyUrl } from '../../utils/imageUtils'
import NetworkImage from '../NetworkImage'

export interface PopupRelatedItem {
  id: string
  title: string
  thumbnail_url: string | null
}

interface PopupRelatedProps {
  items: PopupRelatedItem[]
  onOpen: (id: string) => void
  onLink: () => void
  desktop: boolean
}

const PopupRelated = ({
  items,
  onOpen,
  onLink,
  desktop,
}: PopupRelatedProps) => {
  const { t } = useTranslation()
  const tile = desktop ? 'w-[92px]' : 'w-[110px]'
  const image = desktop ? 'h-[68px] rounded-[10px]' : 'h-20 rounded-xl'

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold uppercase tracking-[0.07em] text-[#8C8A99]">
        {t('relatedRecipes.title')}
      </span>
      <div className={`flex overflow-x-auto ${desktop ? 'gap-2' : 'gap-2.5'}`}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item.id)}
            className={`flex shrink-0 flex-col gap-1.5 text-left ${tile}`}
          >
            <NetworkImage
              src={proxyUrl(item.thumbnail_url)}
              alt={item.title}
              className={`${image} w-full bg-[#EDE7E0]`}
            />
            <span
              className={`font-bold ${desktop ? 'text-xs leading-tight' : 'text-[13px]'}`}
            >
              {item.title}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={onLink}
          className={`flex shrink-0 items-center justify-center border-[1.5px] border-dashed border-[#E4E1EA] font-extrabold text-[#E07B39] hover:bg-[#FDF4EC] ${tile} ${
            desktop
              ? 'h-[68px] rounded-[10px] text-[13px]'
              : 'h-20 rounded-xl text-sm'
          }`}
        >
          {t('recipes.linkRecipe')}
        </button>
      </div>
    </div>
  )
}

export default PopupRelated
