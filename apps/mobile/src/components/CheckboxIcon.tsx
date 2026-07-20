import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme/colors'

const CheckboxIcon = ({ checked }: { checked: boolean }) => (
  <Ionicons
    name={checked ? 'checkmark-circle' : 'ellipse-outline'}
    size={24}
    color={checked ? colors.brand : colors.secondaryLabel}
  />
)

export default CheckboxIcon
