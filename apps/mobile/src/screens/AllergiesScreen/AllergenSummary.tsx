import { memo } from 'react'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { AppText } from '../../components/ui'
import { useMotion } from '../../theme'
import { styles } from './styles'

interface AllergenSummaryProps {
  avoidText: string
}

const AllergenSummary = ({ avoidText }: AllergenSummaryProps) => {
  const { t } = useTranslation()
  const { fade, layout } = useMotion()
  const empty = avoidText.length === 0

  return (
    <Animated.View style={styles.summary} layout={layout}>
      <AppText variant="kicker" tone="actionText">
        {t('settings.avoiding')}
      </AppText>
      <Animated.View key={avoidText} entering={fade}>
        <AppText variant="cardTitle" tone={empty ? 'textTertiary' : 'ink'}>
          {empty ? t('settings.nothingYet') : avoidText}
        </AppText>
      </Animated.View>
      <AppText variant="tileMeta" tone="textSecondary">
        {t('settings.avoidingHint')}
      </AppText>
    </Animated.View>
  )
}

export default memo(AllergenSummary)
