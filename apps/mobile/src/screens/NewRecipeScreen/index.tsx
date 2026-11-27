import { useMemo } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useNavigation } from 'expo-router'
import { useApiClient } from '@carrot/shared/api/context'
import EditView, { type EditViewSource } from '../RecipeDetailScreen/EditView'
import { useNewRecipeDraft } from './useNewRecipeDraft'
import { useNewRecipeHeader } from './useNewRecipeHeader'

const NewRecipeScreen = () => {
  const navigation = useNavigation()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const api = useApiClient()
  const state = useNewRecipeDraft({ api, t })

  useNewRecipeHeader({
    navigation,
    dirty: state.isDirty,
    saveDisabled: !state.canSave,
    onCancel: state.handleCancel,
    onSave: state.handleSave,
  })

  const { tags, setTags, notes, handleNotesChange, handleNotesInput, related, setRelated } = state
  const source = useMemo<EditViewSource>(
    () => ({
      mode: 'new',
      tags,
      onTagsChange: setTags,
      notes,
      onNotesChange: handleNotesChange,
      onNotesInput: handleNotesInput,
      related,
      onRelatedChange: setRelated,
    }),
    [tags, setTags, notes, handleNotesChange, handleNotesInput, related, setRelated],
  )

  if (!state.draft) return null

  return (
    <EditView
      source={source}
      draft={state.draft}
      saving={state.saving}
      insets={insets}
      handlePickThumbnail={state.handlePickThumbnail}
      handleNutritionChange={state.handleNutritionChange}
      handleServingsChange={state.handleServingsChange}
      updateComp={state.updateComp}
      setIngredient={state.setIngredient}
      setIngredientCategory={state.setIngredientCategory}
      addIngredient={state.addIngredient}
      removeIngredient={state.removeIngredient}
      setStep={state.setStep}
      addStep={state.addStep}
      removeStep={state.removeStep}
      setDraft={state.setDraft}
      setThumbErrored={state.setThumbErrored}
      uploadingThumb={state.uploadingThumb}
      thumbErrored={state.thumbErrored}
    />
  )
}

export default NewRecipeScreen
