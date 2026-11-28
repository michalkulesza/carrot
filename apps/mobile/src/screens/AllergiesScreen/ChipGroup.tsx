import { memo, useCallback } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Pill, SectionHeader } from '../../components/ui'
import { allergenShortLabel, type AllergenNamespace } from '@carrot/shared/utils/allergenKeys'
import { styles } from './styles'

interface AllergenChipProps {
  value: string
  label: string
  selected: boolean
  onToggle: (key: string) => void
}

const AllergenChip = memo(({ value, label, selected, onToggle }: AllergenChipProps) => {
  const handlePress = useCallback(() => onToggle(value), [onToggle, value])

  return <Pill size="lg" label={label} selected={selected} onPress={handlePress} />
})

interface ChipGroupProps {
  title: string
  namespace: AllergenNamespace
  keys: string[]
  selected: string[]
  onToggle: (key: string) => void
}

const ChipGroup = ({ title, namespace, keys, selected, onToggle }: ChipGroupProps) => {
  const { t } = useTranslation()

  return (
    <>
      <SectionHeader variant="caption" title={title} />
      <View style={styles.chips}>
        {keys.map((key) => (
          <AllergenChip
            key={key}
            value={key}
            label={allergenShortLabel(t, namespace, key)}
            selected={selected.includes(key)}
            onToggle={onToggle}
          />
        ))}
      </View>
    </>
  )
}

export default memo(ChipGroup)
