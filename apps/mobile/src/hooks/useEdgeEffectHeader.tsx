import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import EdgeEffectHeaderTitle from '../components/EdgeEffectHeaderTitle'

export const useEdgeEffectHeader = (title: string) => {
  const { t } = useTranslation()

  return useMemo(
    () => ({
      headerTitle: () => <EdgeEffectHeaderTitle title={title} />,
      headerBackTitle: t('common.back'),
    }),
    [title, t],
  )
}
