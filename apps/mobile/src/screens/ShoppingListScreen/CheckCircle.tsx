import { Pressable } from 'react-native'
import CheckboxIcon from '../../components/CheckboxIcon'
import { styles } from './styles'

const CheckCircle = ({
  checked,
  onPress,
  accessibilityLabel,
}: {
  checked: boolean
  onPress: () => void
  accessibilityLabel?: string
}) => (
  <Pressable
    onPress={onPress}
    hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
    style={styles.circleBtn}
    accessibilityRole="checkbox"
    accessibilityState={{ checked }}
    accessibilityLabel={accessibilityLabel}
  >
    <CheckboxIcon checked={checked} />
  </Pressable>
)

export default CheckCircle
