import { memo } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppText } from '../../components/ui'
import { screenGutter, space } from '../../theme'
import { NO_RESULTS_HEIGHT, SEMANTIC_HEADER_HEIGHT, SEMANTIC_LOADING_HEIGHT } from './helpers'

export const SemanticHeader = memo(({ label }: { label: string }) => (
  <View style={styles.semanticHeader}>
    <AppText variant="caption" tone="textSecondary">
      {label}
    </AppText>
  </View>
))

export const SemanticLoading = memo(({ label }: { label: string }) => (
  <View style={styles.semanticLoading} accessibilityLiveRegion="polite">
    <ActivityIndicator accessibilityLabel={label} />
    <AppText variant="body" tone="textSecondary">
      {label}
    </AppText>
  </View>
))

export const NoResults = memo(({ query }: { query: string }) => {
  const { t } = useTranslation()

  return (
    <View style={styles.noResults}>
      <AppText variant="body" tone="textSecondary" style={styles.centered}>
        {t('browse.noResults', { query })}
      </AppText>
    </View>
  )
})

const styles = StyleSheet.create({
  semanticHeader: { height: SEMANTIC_HEADER_HEIGHT, justifyContent: 'flex-end', paddingHorizontal: screenGutter, paddingBottom: space.xs },
  semanticLoading: {
    height: SEMANTIC_LOADING_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  noResults: { height: NO_RESULTS_HEIGHT, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xxl },
  centered: { textAlign: 'center' },
})
