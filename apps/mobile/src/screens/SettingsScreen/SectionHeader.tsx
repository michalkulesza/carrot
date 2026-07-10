import { Text } from 'react-native'
import { styles } from './styles'

const SectionHeader = ({ label }: { label: string }) => (
  <Text style={styles.sectionHeader}>{label}</Text>
)

export default SectionHeader
