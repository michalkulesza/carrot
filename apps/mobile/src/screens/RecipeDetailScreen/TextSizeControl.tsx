import { memo, useCallback, useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { styles } from './styles'

interface TextSizeControlProps {
  fontSizeIndex: number
  onChange: (index: number) => void
}

const OPTIONS = [
  { labelKey: 'recipes.textSizeSmall', glyphSize: 13 },
  { labelKey: 'recipes.textSizeDefault', glyphSize: 16 },
  { labelKey: 'recipes.textSizeLarge', glyphSize: 20 },
] as const

interface TextSizeOptionProps {
  index: number
  active: boolean
  label: string
  glyphSize: number
  onSelect: (index: number) => void
}

const TextSizeOption = memo(({ index, active, label, glyphSize, onSelect }: TextSizeOptionProps) => {
  const handlePress = useCallback(() => onSelect(index), [index, onSelect])
  const optionStyle = useMemo(() => [styles.textSizeOption, active && styles.textSizeOptionActive], [active])
  const glyphStyle = useMemo(() => [styles.textSizeGlyph, { fontSize: glyphSize, lineHeight: glyphSize + 4 }], [glyphSize])
  const accessibilityState = useMemo(() => ({ selected: active }), [active])

  return (
    <Pressable
      onPress={handlePress}
      style={optionStyle}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={accessibilityState}
    >
      <Text style={glyphStyle} allowFontScaling={false}>
        A
      </Text>
    </Pressable>
  )
})

const TextSizeControl = ({ fontSizeIndex, onChange }: TextSizeControlProps) => {
  const { t } = useTranslation()

  return (
    <View style={styles.textSizeGroup} accessibilityRole="radiogroup" accessibilityLabel={t('settings.textSize')}>
      {OPTIONS.map(({ labelKey, glyphSize }, index) => (
        <TextSizeOption
          key={labelKey}
          index={index}
          active={fontSizeIndex === index}
          label={t(labelKey)}
          glyphSize={glyphSize}
          onSelect={onChange}
        />
      ))}
    </View>
  )
}

export default memo(TextSizeControl)
