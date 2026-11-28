import { useMemo } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { Trans, useTranslation } from 'react-i18next'
import { ALLERGEN_KEYS, INTOLERANCE_KEYS, allergenShortLabel } from '@carrot/shared/utils/allergenKeys'
import { AppText, EnterSection, Notice } from '../../components/ui'
import { useEdgeEffectHeader } from '../../hooks/useEdgeEffectHeader'
import { useInsetContentStyle } from '../../hooks/useInsetContentStyle'
import { space } from '../../theme'
import AllergenCheckStatus from './AllergenCheckStatus'
import AllergenSummary from './AllergenSummary'
import ChipGroup from './ChipGroup'
import { styles } from './styles'
import { useAllergenSelection } from './useAllergenSelection'

const AVOID_SEPARATOR = ', '
const CONTENT_PADDING_TOP = space.xs
const CONTENT_PADDING_BOTTOM = space.xxl

const AllergiesScreen = () => {
  const { t } = useTranslation()
  const { selected, toggle, recheckStatus, householdName } = useAllergenSelection()

  const headerOptions = useEdgeEffectHeader(t('settings.allergiesTitle'))

  const avoidText = useMemo(
    () =>
      [
        ...ALLERGEN_KEYS.filter((key) => selected.includes(key)).map((key) => allergenShortLabel(t, 'allergens', key)),
        ...INTOLERANCE_KEYS.filter((key) => selected.includes(key)).map((key) => allergenShortLabel(t, 'intolerances', key)),
      ].join(AVOID_SEPARATOR),
    [selected, t],
  )

  const noticeKey = householdName ? 'settings.allergenNoticeHousehold' : 'settings.allergenNoticePersonal'
  const noticeComponents = useMemo(() => ({ b: <Text style={styles.noticeBold} /> }), [])
  const contentStyle = useInsetContentStyle(CONTENT_PADDING_BOTTOM, CONTENT_PADDING_TOP)

  return (
    <ScrollView style={styles.container} contentContainerStyle={contentStyle} contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={headerOptions} />

      <EnterSection index={0}>
        <View style={styles.inset}>
          <Notice>
            <AppText variant="meta" tone="allergenText">
              <Trans i18nKey={noticeKey} values={{ name: householdName }} components={noticeComponents} />
            </AppText>
          </Notice>
        </View>
      </EnterSection>

      <EnterSection index={1}>
        <AllergenSummary avoidText={avoidText} />
        <AllergenCheckStatus status={recheckStatus} />
      </EnterSection>

      <EnterSection index={2}>
        <ChipGroup
          title={t('settings.allergensEu14')}
          namespace="allergens"
          keys={ALLERGEN_KEYS}
          selected={selected}
          onToggle={toggle}
        />
        <ChipGroup
          title={t('settings.intolerances')}
          namespace="intolerances"
          keys={INTOLERANCE_KEYS}
          selected={selected}
          onToggle={toggle}
        />
      </EnterSection>
    </ScrollView>
  )
}

export default AllergiesScreen
