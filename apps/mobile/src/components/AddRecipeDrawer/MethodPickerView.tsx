import type { ComponentProps } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import { colors } from '../../theme/colors'
import type { AddRecipeMethod } from './helpers'
import { styles } from './styles'

type FeatherIconName = ComponentProps<typeof Feather>['name']

const METHODS: { key: AddRecipeMethod; icon: FeatherIconName; titleKey: string; descKey: string }[] = [
  { key: 'camera', icon: 'camera', titleKey: 'addRecipe.methodCamera', descKey: 'addRecipe.methodCameraDesc' },
  { key: 'gallery', icon: 'image', titleKey: 'addRecipe.methodGallery', descKey: 'addRecipe.methodGalleryDesc' },
  { key: 'text', icon: 'clipboard', titleKey: 'addRecipe.methodText', descKey: 'addRecipe.methodTextDesc' },
  { key: 'scratch', icon: 'edit-3', titleKey: 'addRecipe.methodScratch', descKey: 'addRecipe.methodScratchDesc' },
]

const MethodPickerView = ({
  showPersonalLibrary,
  onSelect,
}: {
  showPersonalLibrary: boolean
  onSelect: (method: AddRecipeMethod) => void
}) => {
  const { t } = useTranslation()
  const methods = showPersonalLibrary
    ? [
        ...METHODS,
        {
          key: 'personal-library' as const,
          icon: 'book-open' as FeatherIconName,
          titleKey: 'addRecipe.fromPersonalLibrary',
          descKey: 'addRecipe.fromPersonalLibraryDesc',
        },
      ]
    : METHODS

  return (
    <View style={styles.pickerWrap}>
      <View style={styles.pickerGroup}>
        {methods.map((method, mi) => (
          <Pressable
            key={method.key}
            style={({ pressed }) => [
              styles.methodRow,
              mi < methods.length - 1 && styles.methodRowBorder,
              pressed && styles.methodRowPressed,
            ]}
            onPress={() => onSelect(method.key)}
            accessibilityLabel={t(method.titleKey)}
            accessibilityHint={t(method.descKey)}
          >
            <View style={styles.methodIconWrap}>
              <Feather name={method.icon} size={20} color={colors.blue} />
            </View>
            <View style={styles.methodTextWrap}>
              <Text style={styles.methodTitle}>{t(method.titleKey)}</Text>
              <Text style={styles.methodDesc}>{t(method.descKey)}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      <View style={styles.shareTipCard}>
        <Text style={styles.shareTipText}>{t('addRecipe.shareTip')}</Text>
      </View>
    </View>
  )
}

export default MethodPickerView
