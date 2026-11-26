import { memo, useMemo } from 'react'
import type { ViewStyle } from 'react-native'
import Animated, { type AnimatedStyle } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { getSourceHost, type IngredientEntry } from './helpers'
import LinkSideButton from './LinkSideButton'
import { styles } from './styles'
import { useIngredientLink } from './useIngredientLink'

interface IngredientLinkButtonProps {
  recipeId: string
  entry: IngredientEntry
  linkedRecipeTitle: string | undefined
  hidden: boolean
  columnAnimatedStyle: AnimatedStyle<ViewStyle>
  buttonAnimatedStyle: AnimatedStyle<ViewStyle>
}

const IngredientLinkButton = ({
  recipeId,
  entry,
  linkedRecipeTitle,
  hidden,
  columnAnimatedStyle,
  buttonAnimatedStyle,
}: IngredientLinkButtonProps) => {
  const { t } = useTranslation()
  const link = useIngredientLink({
    recipeId,
    url: entry.linkedRecipeUrl,
    kind: entry.linkedRecipeKind,
    linkedRecipeId: entry.linkedRecipeId,
  })

  const columnStyle = useMemo(() => [styles.linkColumn, columnAnimatedStyle], [columnAnimatedStyle])

  const getAccessibilityLabel = () => {
    if (link.isExternal) {
      const host = getSourceHost(entry.linkedRecipeUrl)

      return host ? t('recipes.openWebsiteLink', { host }) : link.fallbackLabel
    }

    return linkedRecipeTitle ? t('recipes.openRecipeLink', { title: linkedRecipeTitle }) : link.fallbackLabel
  }

  return (
    <Animated.View style={columnStyle}>
      <LinkSideButton
        isExternal={link.isExternal}
        disabled={!link.isExternal && link.isBusy}
        hidden={hidden}
        accessibilityLabel={getAccessibilityLabel()}
        animatedStyle={buttonAnimatedStyle}
        onPress={link.handlePress}
      />
    </Animated.View>
  )
}

export default memo(IngredientLinkButton)
