import { memo, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import GlassViewSafe, { glassAvailable } from '../../components/GlassViewSafe'
import { palette } from '../../theme'
import { styles } from './styles'

const PILL_STYLE = [styles.editStatusPill, !glassAvailable && styles.editStatusPillFallback]

export const EditHeaderTitle = memo(({ dirty }: { dirty: boolean }) => {
  const { t } = useTranslation()

  const label = dirty ? `● ${t('recipes.unsavedChanges')}` : t('recipes.noChanges')
  const textStyle = useMemo(
    () => [styles.editStatusText, { color: dirty ? palette.action : palette.textTertiary }],
    [dirty],
  )

  return (
    <View style={PILL_STYLE} accessibilityLiveRegion="polite">
      {glassAvailable ? <GlassViewSafe style={StyleSheet.absoluteFill} /> : null}
      <Text style={textStyle}>{label}</Text>
    </View>
  )
})
