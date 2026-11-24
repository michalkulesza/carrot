import { memo, useCallback } from 'react'
import { Pressable, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { useTranslation } from 'react-i18next'
import { palette } from '../../theme'
import { FONT_SIZES } from './helpers'
import { styles } from './styles'

interface TextSizeControlProps {
  fontSizeIndex: number
  onChange: (index: number) => void
}

const GLYPH_SIZE = 14
const LARGE_GLYPH_SIZE = 20

const TextSizeDot = memo(({ index, active, label, onSelect }: { index: number; active: boolean; label: string; onSelect: (index: number) => void }) => {
  const handlePress = useCallback(() => onSelect(index), [index, onSelect])

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={10}
      style={styles.textSizeDotWrapper}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.textSizeDot, active && styles.textSizeDotActive]} />
    </Pressable>
  )
})

const TextSizeControl = ({ fontSizeIndex, onChange }: TextSizeControlProps) => {
  const { t } = useTranslation()

  return (
    <View style={styles.textSizeControl}>
      <SymbolView name="textformat.size.smaller" size={GLYPH_SIZE} tintColor={palette.textSecondary} />
      <View style={styles.textSizeTrack}>
        <View style={styles.textSizeTrackLine} />
        {FONT_SIZES.map((_, index) => (
          <TextSizeDot
            key={index}
            index={index}
            active={fontSizeIndex === index}
            label={`${t('settings.textSize')} ${index + 1}`}
            onSelect={onChange}
          />
        ))}
      </View>
      <SymbolView name="textformat.size.larger" size={LARGE_GLYPH_SIZE} tintColor={palette.textSecondary} />
    </View>
  )
}

export default memo(TextSizeControl)
