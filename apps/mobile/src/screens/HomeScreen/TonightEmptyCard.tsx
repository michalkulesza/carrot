import { memo } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText, Button, Card, Thumbnail } from '../../components/ui'
import { styles } from './styles'

interface TonightEmptyCardProps {
  onPlanTonight: () => void
  onOpenMealPlan: () => void
}

const TonightEmptyCard = ({ onPlanTonight, onOpenMealPlan }: TonightEmptyCardProps) => {
  const { t } = useTranslation()

  return (
    <Card style={styles.tonightEmptyCard}>
      <View style={styles.tonightEmptyHeader}>
        <Thumbnail url={null} size="xs" radiusKey="control" glyph="calendar" tone="plain" />
        <View style={styles.flexFill}>
          <AppText variant="kicker" tone="actionText">
            {t('home.tonight')}
          </AppText>
          <AppText variant="cardTitle">{t('home.nothingPlanned')}</AppText>
        </View>
      </View>
      <View style={styles.tonightEmptyActions}>
        <View style={styles.flexFill}>
          <Button label={t('home.planTonight')} icon="plus" size="lg" fullWidth onPress={onPlanTonight} />
        </View>
        <View style={styles.flexFill}>
          <Button
            label={t('home.openMealPlan')}
            variant="secondary"
            size="lg"
            fullWidth
            onPress={onOpenMealPlan}
          />
        </View>
      </View>
    </Card>
  )
}

export default memo(TonightEmptyCard)
