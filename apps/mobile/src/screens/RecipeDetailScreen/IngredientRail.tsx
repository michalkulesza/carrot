import { useEffect, useRef } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors } from '../../theme/colors'
import type { RailRow } from './helpers'

export const RAIL_ROW_H = 28
export const RAIL_VISIBLE_ROWS = 7
export const RAIL_MARGIN_TOP = 24
export const RAIL_MARGIN_BOTTOM = 14
const ROW_H = RAIL_ROW_H
const VISIBLE_ROWS = RAIL_VISIBLE_ROWS
const RAIL_HEIGHT = 196
const FADE_H = 16
const EDGE_PADDING = 8

const IngredientRail = ({
  rows,
  targetIndex,
  stepKey,
  text,
  muted,
}: {
  rows: RailRow[]
  targetIndex: number
  stepKey: number
  text: string
  muted: string
}) => {
  const listRef = useRef<FlatList<RailRow>>(null)

  useEffect(() => {
    if (rows.length === 0) return
    const index = Math.max(0, Math.min(rows.length - 1, targetIndex))
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, rows.length])

  if (rows.length === 0) return null

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={styles.list}
        getItemLayout={(_, index) => ({
          length: ROW_H,
          offset: EDGE_PADDING + ROW_H * index,
          index,
        })}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <View style={styles.row}>
              <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.header, { color: muted }]}>
                {item.text}
              </Text>
            </View>
          ) : (
            <View style={styles.row}>
              <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.ingredient, { color: text }]}>
                {item.text}
              </Text>
            </View>
          )
        }
      />
      <LinearGradient
        pointerEvents="none"
        colors={[colors.secondaryBackground, colors.secondaryBackgroundTransparent]}
        style={[styles.fade, styles.fadeTop]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[colors.secondaryBackgroundTransparent, colors.secondaryBackground]}
        style={[styles.fade, styles.fadeBottom]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: RAIL_HEIGHT,
    marginTop: RAIL_MARGIN_TOP,
    marginBottom: RAIL_MARGIN_BOTTOM,
    borderRadius: 16,
    backgroundColor: colors.secondaryBackground,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  row: {
    height: ROW_H,
    justifyContent: 'center',
  },
  list: { paddingVertical: EDGE_PADDING },
  header: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ingredient: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '400',
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: FADE_H,
  },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
})

export default IngredientRail
