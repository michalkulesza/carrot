import { StyleSheet, View } from 'react-native'
import HeaderTitle from './HeaderTitle'
import ScrollEdgeEffectAnchor from './ScrollEdgeEffectAnchor'

const EdgeEffectHeaderTitle = ({ title }: { title: string }) => (
  <View style={styles.container}>
    <ScrollEdgeEffectAnchor />
    <HeaderTitle title={title} />
  </View>
)

const styles = StyleSheet.create({
  container: { width: '100%', justifyContent: 'center' },
})

export default EdgeEffectHeaderTitle
