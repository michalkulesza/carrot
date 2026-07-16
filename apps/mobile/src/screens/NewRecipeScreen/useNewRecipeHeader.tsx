import { useCallback, useLayoutEffect } from 'react'
import { Alert, PlatformColor, Pressable, Text } from 'react-native'
import type { NavigationProp, NavigationState } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'
import BugReportButton from '../../components/BugReportButton'
import type { EditableRecipe } from './helpers'
import { isBlankRecipe } from './helpers'
import { styles } from './styles'

export const useNewRecipeHeader = ({
  navigation,
  editable,
  t,
  onDiscard,
}: {
  navigation: Omit<NavigationProp<ReactNavigation.RootParamList>, 'getState'> & {
    getState(): NavigationState | undefined
  }
  editable: EditableRecipe
  t: ReturnType<typeof useTranslation>['t']
  onDiscard: () => void
}) => {
  const handleBackPress = useCallback(() => {
    if (isBlankRecipe(editable)) {
      navigation.goBack()
      return
    }
    Alert.alert(t('addRecipe.discard'), t('addRecipe.discardMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('addRecipe.discard'), style: 'destructive', onPress: onDiscard },
    ])
  }, [editable, navigation, onDiscard, t])

  useLayoutEffect(() => {
    navigation.setOptions({
      gestureEnabled: false,
      headerTransparent: true,
      headerTitle: '',
      headerShadowVisible: false,
      headerLeft: () => (
        <Pressable
          onPress={handleBackPress}
          hitSlop={8}
          style={({ pressed }) => [styles.headerBackBtnWrap, pressed && { opacity: 0.5 }]}
          accessibilityLabel={t('common.back')}
        >
          <Feather name="chevron-left" size={24} color={PlatformColor('label') as unknown as string} style={styles.headerBackChevron} />
          <Text style={styles.headerBackBtn}>{t('common.back')}</Text>
        </Pressable>
      ),
      headerRight: () => <BugReportButton />,
    })
  }, [navigation, t, handleBackPress])
}
