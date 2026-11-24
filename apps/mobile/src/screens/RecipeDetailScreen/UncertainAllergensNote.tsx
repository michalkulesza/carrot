import { useTranslation } from 'react-i18next'
import { AppText, Card } from '../../components/ui'

const UncertainAllergensNote = () => {
  const { t } = useTranslation()

  return (
    <Card tone="allergen" padding="md">
      <AppText variant="meta" tone="allergenText">
        {t('recipes.allergensUncertain')}
      </AppText>
    </Card>
  )
}

export default UncertainAllergensNote
