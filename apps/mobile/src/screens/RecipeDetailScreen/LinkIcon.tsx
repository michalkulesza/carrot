import { memo, useMemo } from 'react'
import { View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { palette } from '../../theme'
import { styles } from './styles'

const LINK_ICON_SIZE = 26
const GLYPH_RATIO = 12 / LINK_ICON_SIZE

interface LinkIconProps {
  isExternal: boolean
  size?: number
}

const LinkIcon = ({ isExternal, size = LINK_ICON_SIZE }: LinkIconProps) => {
  const circleStyle = useMemo(
    () => [
      styles.linkIcon,
      { width: size, height: size, borderRadius: size / 2 },
      isExternal ? styles.linkIconExternal : styles.linkIconInternal,
    ],
    [size, isExternal],
  )

  return (
    <View style={circleStyle}>
      <SymbolView
        name={isExternal ? 'arrow.up.right' : 'chevron.right'}
        size={Math.round(size * GLYPH_RATIO)}
        weight="bold"
        tintColor={isExternal ? palette.actionText : palette.onAction}
      />
    </View>
  )
}

export default memo(LinkIcon)
