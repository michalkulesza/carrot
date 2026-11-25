import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { LayoutChangeEvent, PixelRatio, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ProgressBar } from '../../components/ui'
import { countGathered, type CookIngredientGroup } from './helpers'
import { AnchorMarker, GroupFooter, GroupHeader, IngredientRow } from './IngredientParts'
import { styles } from './styles'

interface IngredientsTabProps {
  groups: CookIngredientGroup[]
  checked: Set<string>
  fontScale: number
  anchorKey: string | undefined
  stepNumber: number
  active: boolean
  fallbackGroupTitle: string
  onToggle: (key: string) => void
}

const IngredientsTab = ({
  groups,
  checked,
  fontScale,
  anchorKey,
  stepNumber,
  active,
  fallbackGroupTitle,
  onToggle,
}: IngredientsTabProps) => {
  const { t } = useTranslation()
  const scrollRef = useRef<ScrollView>(null)
  const anchorLayoutRef = useRef<{ key: string | undefined; y: number } | null>(null)
  const hasScrolledRef = useRef(false)
  const viewportHeightRef = useRef(0)

  const total = useMemo(() => groups.reduce((sum, group) => sum + group.ingredients.length, 0), [groups])
  const gathered = countGathered(groups, checked)
  const progress = total === 0 ? 0 : gathered / total

  const scrollToAnchor = useCallback((y: number) => {
    if (viewportHeightRef.current === 0) return

    const centeredY = PixelRatio.roundToNearestPixel(y - viewportHeightRef.current / 2)

    scrollRef.current?.scrollTo({ y: Math.max(0, centeredY), animated: hasScrolledRef.current })
    hasScrolledRef.current = true
  }, [])

  useEffect(() => {
    const layout = anchorLayoutRef.current
    if (active && layout && layout.key === anchorKey) scrollToAnchor(layout.y)
  }, [active, anchorKey, scrollToAnchor])

  const handleAnchorLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { y } = event.nativeEvent.layout
      const isNewAnchor = anchorLayoutRef.current?.key !== anchorKey

      anchorLayoutRef.current = { key: anchorKey, y }
      if (active && isNewAnchor) scrollToAnchor(y)
    },
    [active, anchorKey, scrollToAnchor],
  )

  const handleScrollLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const isFirstLayout = viewportHeightRef.current === 0
      const layout = anchorLayoutRef.current

      viewportHeightRef.current = event.nativeEvent.layout.height
      if (isFirstLayout && active && layout && layout.key === anchorKey) scrollToAnchor(layout.y)
    },
    [active, anchorKey, scrollToAnchor],
  )

  const { rows, stickyIndices } = useMemo(() => {
    const nodes: React.ReactNode[] = []
    const sticky: number[] = []

    groups.forEach((group, groupIndex) => {
      const done = group.ingredients.filter(({ key }) => checked.has(key)).length

      sticky.push(nodes.length)
      nodes.push(
        <GroupHeader
          key={`${group.key}-header`}
          title={group.name ?? fallbackGroupTitle}
          done={done}
          count={group.ingredients.length}
          first={groupIndex === 0}
        />,
      )

      group.ingredients.forEach((ingredient, ingredientIndex) => {
        if (ingredient.key === anchorKey) {
          nodes.push(<AnchorMarker key={`${ingredient.key}-anchor`} stepNumber={stepNumber} onLayout={handleAnchorLayout} />)
        }

        nodes.push(
          <IngredientRow
            key={ingredient.key}
            ingredient={ingredient}
            checked={checked.has(ingredient.key)}
            fontScale={fontScale}
            last={ingredientIndex === group.ingredients.length - 1}
            onToggle={onToggle}
          />,
        )
      })

      nodes.push(<GroupFooter key={`${group.key}-footer`} />)
    })

    return { rows: nodes, stickyIndices: sticky }
  }, [anchorKey, checked, fallbackGroupTitle, fontScale, groups, handleAnchorLayout, onToggle, stepNumber])

  return (
    <>
      <View style={styles.gatheredHeader}>
        <View style={styles.gatheredRow}>
          <Text style={styles.gatheredText}>{t('cookMode.gathered', { done: gathered, total })}</Text>
          <Text style={styles.toGoText}>{t('cookMode.toGo', { count: total - gathered })}</Text>
        </View>
        <ProgressBar value={progress} />
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.ingredientsScroll}
        contentContainerStyle={styles.ingredientsContent}
        stickyHeaderIndices={stickyIndices}
        showsVerticalScrollIndicator={false}
        onLayout={handleScrollLayout}
      >
        {rows}
      </ScrollView>
    </>
  )
}

export default memo(IngredientsTab)
