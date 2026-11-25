import { memo } from 'react'
import { Switch, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
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
    <View style={styles.prefsRow}>
      <Text style={styles.prefsLabel} numberOfLines={1}>
        {t('settings.screenAwake')}
      </Text>
      <View style={styles.prefsSwitch}>
        <Switch
          value={keepScreenOn}
          onValueChange={onToggleKeepScreenOn}
          trackColor={SWITCH_TRACK}
          accessibilityLabel={t('settings.screenAwake')}
        />
      </View>
      <View style={styles.prefsDivider} />
      <TextSizeControl fontSizeIndex={fontSizeIndex} onChange={onFontSizeChange} />
    </View>
  )
}

export default memo(ReadingPrefsCard)
