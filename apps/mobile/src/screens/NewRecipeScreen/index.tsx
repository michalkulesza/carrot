import { useCallback, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigation, useRouter } from 'expo-router'
import { useApiClient } from '@carrot/shared/api/context'
import { useHousehold } from '../../context/HouseholdContext'
import { useTags } from '@carrot/shared/hooks/useTags'
import { usePreferences } from '@carrot/shared/hooks/usePreferences'
import type { Tag } from '@carrot/shared/types'
import { blankRecipe, buildRecipeSavePayload } from './helpers'
import ActionBar from './ActionBar'
import RecipeFormView from './RecipeFormView'
import { useNewRecipeHeader } from './useNewRecipeHeader'
import { styles } from './styles'

const NewRecipeScreen = () => {
  const navigation = useNavigation()
  const router = useRouter()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const api = useApiClient()
  const qc = useQueryClient()
  const { tags } = useTags()
  const { preferences } = usePreferences()
  const { activeHouseholdId } = useHousehold()

  const [editable, setEditable] = useState(() => blankRecipe())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])

  const activeAllergens = useMemo(() => preferences?.personal_allergens ?? [], [preferences])
  const selectedTagIds = useMemo(() => new Set(selectedTags.map((tag) => tag.id)), [selectedTags])

  const handleDiscard = useCallback(() => router.back(), [router])

  useNewRecipeHeader({ navigation, editable, t, onDiscard: handleDiscard })

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const sharedToPersonal = activeHouseholdId !== null && !!preferences?.share_imports_to_personal
      await api.saveRecipe(buildRecipeSavePayload(editable, selectedTags, sharedToPersonal))
      await qc.invalidateQueries({ queryKey: ['recipes'] })
      router.back()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addRecipe.failedToSave'))
    } finally {
      setSaving(false)
    }
  }, [editable, selectedTags, activeHouseholdId, preferences, api, qc, t, router])

  const handleTagAdd = useCallback((tag: Tag) => setSelectedTags((prev) => [...prev, tag]), [])
  const handleTagRemove = useCallback((id: string) => setSelectedTags((prev) => prev.filter((tag) => tag.id !== id)), [])

  return (
    <KeyboardAvoidingView
      style={[styles.flex, styles.screenBackground]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={88}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
      >
        <RecipeFormView
          recipe={editable}
          editing
          onChange={setEditable}
          selectedTags={selectedTags}
          selectedTagIds={selectedTagIds}
          allTags={tags}
          onTagAdd={handleTagAdd}
          onTagRemove={handleTagRemove}
          activeAllergens={activeAllergens}
        />

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>{t('addRecipe.failedToSave')}</Text>
            <Text style={styles.errorMsg}>{error}</Text>
          </View>
        )}
      </ScrollView>

      <ActionBar
        saving={saving}
        bottomInset={insets.bottom}
        onDiscard={handleDiscard}
        onSave={handleSave}
      />
    </KeyboardAvoidingView>
  )
}

export default NewRecipeScreen
