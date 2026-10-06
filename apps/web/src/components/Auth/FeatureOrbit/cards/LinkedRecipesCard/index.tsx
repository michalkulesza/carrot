import { useTranslation } from 'react-i18next'
import FeatureCard from '../../FeatureCard'
import { LinkIcon } from '../../Icons'

const LinkedRecipesCard = () => {
  const { t } = useTranslation()

  return (
    <FeatureCard
      label={t('auth.features.linkedRecipes.label')}
      icon={<LinkIcon />}
      accentClassName="bg-blue-100 text-blue-700"
    >
      <div className="flex flex-col">
        <div className="flex items-center gap-2.5">
          <span className="size-[38px] shrink-0 rounded-[10px] bg-linear-to-br from-green-300 to-green-600" />
          <span className="text-sm leading-tight font-extrabold">
            {t('auth.features.linkedRecipes.recipe')}
          </span>
        </div>
        <div className="flex h-[22px] items-center gap-2 pl-[18px]">
          <span className="h-full w-0.5 bg-blue-200" />
          <span className="text-[11px] font-extrabold text-blue-700">
            {t('auth.features.linkedRecipes.uses')}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-green-100 font-extrabold text-green-700">
            P
          </span>
          <span className="text-sm leading-tight font-extrabold">
            {t('auth.features.linkedRecipes.component')}
          </span>
        </div>
      </div>
    </FeatureCard>
  )
}

export default LinkedRecipesCard
