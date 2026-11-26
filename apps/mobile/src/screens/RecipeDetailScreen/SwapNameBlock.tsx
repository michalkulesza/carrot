import { memo, type ComponentProps, type ReactNode } from 'react'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'
import { StaticSwapChip } from './SwapChip'
import SwappedDetails from './SwappedDetails'
import SwapRewriteBlock from './SwapRewriteBlock'
import { styles } from './styles'
import type { SwapRewrite } from './useSwapRewriteAnimation'

interface SwapNameBlockProps {
  name: string
  nameStyle: ComponentProps<typeof Animated.Text>['style']
  applied: boolean
  swapRewrite: SwapRewrite | undefined
  restoreRewrite: SwapRewrite | undefined
  originalName: string
  substituteName: string
  swapChipLabel: string
  swapDisabled: boolean
  onUndo: () => void
  restoreChip: ReactNode
}

const SwapNameBlock = ({
  name,
  nameStyle,
  applied,
  swapRewrite,
  restoreRewrite,
  originalName,
  substituteName,
  swapChipLabel,
  swapDisabled,
  onUndo,
  restoreChip,
}: SwapNameBlockProps) => {
  const swappedDetails = applied ? <SwappedDetails oldName={originalName} disabled={swapDisabled} onUndo={onUndo} /> : null

  if (swapRewrite) {
    return (
      <SwapRewriteBlock
        key={swapRewrite.id}
        rewrite={swapRewrite}
        nameStyle={nameStyle}
        oldName={originalName}
        newName={name}
        oldExtra={<StaticSwapChip label={swapChipLabel} />}
        newExtra={swappedDetails}
      />
    )
  }

  if (restoreRewrite) {
    return (
      <SwapRewriteBlock
        key={restoreRewrite.id}
        rewrite={restoreRewrite}
        nameStyle={nameStyle}
        oldName={substituteName}
        newName={name}
        oldExtra={<SwappedDetails oldName={name} disabled onUndo={onUndo} />}
        newExtra={restoreChip}
      />
    )
  }

  if (applied) {
    return (
      <View style={styles.swapBlock}>
        <Animated.Text style={nameStyle}>{name}</Animated.Text>
        {swappedDetails}
      </View>
    )
  }

  return <Animated.Text style={nameStyle}>{name}</Animated.Text>
}

export default memo(SwapNameBlock)
