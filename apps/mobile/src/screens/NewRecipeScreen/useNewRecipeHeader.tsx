import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { NavigationProp, NavigationState } from '@react-navigation/native'
import { buildEditHeaderOptions } from '../RecipeDetailScreen/buildEditHeaderOptions'

type NewRecipeNavigation = Omit<NavigationProp<ReactNavigation.RootParamList>, 'getState'> & {
  getState(): NavigationState | undefined
}

export const useNewRecipeHeader = ({
  navigation,
  dirty,
  saveDisabled,
  onCancel,
  onSave,
}: {
  navigation: NewRecipeNavigation
  dirty: boolean
  saveDisabled: boolean
  onCancel: () => void
  onSave: () => void
}) => {
  const { t } = useTranslation()
  const cancelRef = useRef(onCancel)
  const saveRef = useRef(onSave)

  useEffect(() => {
    cancelRef.current = onCancel
    saveRef.current = onSave
  }, [onCancel, onSave])

  const handleCancelPress = useCallback(() => cancelRef.current(), [])
  const handleSavePress = useCallback(() => saveRef.current(), [])

  useLayoutEffect(() => {
    const headerOptions = buildEditHeaderOptions({
      t,
      dirty,
      saveDisabled,
      onCancel: handleCancelPress,
      onSave: handleSavePress,
    })

    navigation.setOptions(headerOptions)
  }, [navigation, t, dirty, saveDisabled, handleCancelPress, handleSavePress])
}
