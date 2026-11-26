import { memo, useMemo } from 'react'
import type { ViewStyle } from 'react-native'
import Animated, { type AnimatedStyle } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { getSourceHost, type IngredientEntry } from './helpers'
import LinkSideButton from './LinkSideButton'
import { styles } from './styles'
import { useIngredientLink } from './useIngredientLink'

interface IngredientLinkButtonProps {
  entry: IngredientEntry
  linkedRecipeTitle: string | undefined
  hidden: boolean
  columnAnimatedStyle: AnimatedStyle<ViewStyle>
  buttonAnimatedStyle: AnimatedStyle<ViewStyle>
}

const IngredientLinkButton = ({
  entry,
  linkedRecipeTitle,
  hidden,
  columnAnimatedStyle,
  buttonAnimatedStyle,
}: IngredientLinkButtonProps) => {
  const { t } = useTranslation()
  const link = useIngredientLink({
    url: entry.linkedRecipeUrl,
    kind: entry.linkedRecipeKind,
    linkedRecipeId: entry.linkedRecipeId,
  })

  const columnStyle = useMemo(() => [styles.linkColumn, columnAnimatedStyle], [columnAnimatedStyle])

  const accessibilityLabel = useMemo(() => {
    if (link.isExternal) {
      const host = getSourceHost(entry.linkedRecipeUrl)

      return host ? t('recipes.openWebsiteLink', { host }) : t('recipes.openLink')
    }

    return linkedRecipeTitle ? t('recipes.openRecipeLink', { title: linkedRecipeTitle }) : t('recipes.openLinkedRecipe')
  }, [link.isExternal, entry.linkedRecipeUrl, linkedRecipeTitle, t])

  return (
    <Animated.View style={columnStyle}>
      <LinkSideButton
        isExternal={link.isExternal}
        hidden={hidden}
        accessibilityLabel={accessibilityLabel}
        animatedStyle={buttonAnimatedStyle}
        onPress={link.handlePress}
      />
    </Animated.View>
  )
}

export default memo(IngredientLinkButton)
