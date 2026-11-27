import { memo, useMemo } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText, CheckboxCircle } from '../../components/ui'
import { useResolvedTone } from '../../hooks/useResolvedTone'
import { displayItemText } from './helpers'
import { styles } from './styles'

interface DragPreviewRowProps {
  text: string
  width?: number
  height?: number
}

const DragPreviewRow = ({ text, width, height }: DragPreviewRowProps) => {
  const { t } = useTranslation()

  const outlineColor = useResolvedTone('outlineSubtle')

  const displayText = useMemo(() => displayItemText(text, t), [text, t])
  const liftedStyle = useMemo(() => [styles.liftedRow, { width, height, borderColor: outlineColor }], [width, height, outlineColor])

  return (
    <View style={liftedStyle}>
      <View style={styles.liftedRowContent}>
        <CheckboxCircle checked={false} />
        <AppText variant="bodyLarge" style={styles.flex}>{displayText}</AppText>
      </View>
    </View>
  )
}

export default memo(DragPreviewRow)
