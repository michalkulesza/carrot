import { memo } from 'react'
import { Switch, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText, Card } from '../../components/ui'
import { palette } from '../../theme'
import TextSizeControl from './TextSizeControl'
import { styles } from './styles'

interface ReadingPrefsCardProps {
  keepScreenOn: boolean
  fontSizeIndex: number
  onToggleKeepScreenOn: (value: boolean) => void
  onFontSizeChange: (index: number) => void
}

const SWITCH_TRACK = { true: palette.action }

const ReadingPrefsCard = ({ keepScreenOn, fontSizeIndex, onToggleKeepScreenOn, onFontSizeChange }: ReadingPrefsCardProps) => {
  const { t } = useTranslation()

  return (
    <Card padding="lg" style={styles.prefsCard}>
      <View style={styles.prefsRow}>
        <AppText variant="controlLabel">{t('settings.screenAwake')}</AppText>
        <View style={styles.prefsControl}>
          <Switch
            value={keepScreenOn}
            onValueChange={onToggleKeepScreenOn}
            trackColor={SWITCH_TRACK}
            accessibilityLabel={t('settings.screenAwake')}
          />
        </View>
      </View>
      <View style={styles.prefsDivider} />
      <View style={styles.prefsRow}>
        <AppText variant="controlLabel">{t('settings.textSize')}</AppText>
        <TextSizeControl fontSizeIndex={fontSizeIndex} onChange={onFontSizeChange} />
      </View>
    </Card>
  )
}

export default memo(ReadingPrefsCard)
