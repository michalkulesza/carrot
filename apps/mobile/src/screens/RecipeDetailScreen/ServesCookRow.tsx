import { memo } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText, Button, Stepper } from '../../components/ui'
import { styles } from './styles'

interface ServesCookRowProps {
  servings: number | null
  hasSteps?: boolean
  onDecreaseServings: () => void
  onIncreaseServings: () => void
  onOpenCookMode?: () => void
}

export const MIN_SERVINGS = 1
export const MAX_SERVINGS = 99

const ServesCookRow = ({
  servings,
  hasSteps = true,
  onDecreaseServings,
  onIncreaseServings,
  onOpenCookMode,
}: ServesCookRowProps) => {
  const { t } = useTranslation()

  return (
    <View style={styles.servesBlock}>
      <View style={styles.servesRow}>
        {servings !== null ? (
          <Stepper
            label={t('recipes.serves')}
            value={servings}
            onDecrease={onDecreaseServings}
            onIncrease={onIncreaseServings}
            canDecrease={servings > MIN_SERVINGS}
            canIncrease={servings < MAX_SERVINGS}
            decreaseLabel={t('recipes.decreaseServings')}
            increaseLabel={t('recipes.increaseServings')}
            valueLabel={t('recipes.servings', { count: servings })}
          />
        ) : null}
        {onOpenCookMode ? (
          <Button
            label={t('cookMode.cook')}
            accessibilityLabel={t('cookMode.start')}
            icon="play.fill"
            size="xl"
            fullWidth={servings === null}
            disabled={!hasSteps}
            onPress={onOpenCookMode}
          />
        ) : null}
      </View>
      {onOpenCookMode && !hasSteps ? (
        <AppText variant="meta" tone="textSecondary">
          {t('recipes.cookModeUnavailable')}
        </AppText>
      ) : null}
    </View>
  )
}

export default memo(ServesCookRow)
