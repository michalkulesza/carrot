import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useTranslation } from 'react-i18next'
import RecipesScreen from '../screens/RecipesScreen'
import RecipeDetailScreen from '../screens/RecipeDetailScreen'
import ImportRecipeScreen from '../screens/ImportRecipeScreen'
import EditRecipeScreen from '../screens/EditRecipeScreen'

export type RecipesStackParamList = {
  RecipesList: undefined
  RecipeDetail: { recipeId: string; title?: string }
  ImportRecipe: undefined
  EditRecipe: { recipeId: string }
}

const Stack = createNativeStackNavigator<RecipesStackParamList>()

const RecipesStack = () => {
  const { t } = useTranslation()
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="RecipesList"
        component={RecipesScreen}
        options={{ title: t('nav.recipes') }}
      />
      <Stack.Screen
        name="RecipeDetail"
        component={RecipeDetailScreen}
        options={({ route }) => ({ title: route.params.title ?? t('nav.recipes') })}
      />
      <Stack.Screen
        name="ImportRecipe"
        component={ImportRecipeScreen}
        options={{ title: t('addRecipe.importRecipe') }}
      />
      <Stack.Screen
        name="EditRecipe"
        component={EditRecipeScreen}
        options={{ title: t('common.edit') }}
      />
    </Stack.Navigator>
  )
}

export default RecipesStack
