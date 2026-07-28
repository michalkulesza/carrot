import { useEffect, useRef } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { RailRow } from './helpers'

export const RAIL_ROW_H = 34
export const RAIL_VISIBLE_ROWS = 5
export const RAIL_MARGIN_TOP = 24
export const RAIL_MARGIN_BOTTOM = 14
const ROW_H = RAIL_ROW_H
const VISIBLE_ROWS = RAIL_VISIBLE_ROWS
const FADE_H = 26

const IngredientRail = ({
  rows,
  targetIndex,
  stepKey,
  text,
  muted,
  bg,
}: {
  rows: RailRow[]
  targetIndex: number
  stepKey: number
  text: string
  muted: string
  bg: string
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
        getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
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
        colors={[bg, `${bg}00`]}
        style={[styles.fade, styles.fadeTop]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[`${bg}00`, bg]}
        style={[styles.fade, styles.fadeBottom]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: ROW_H * VISIBLE_ROWS,
    marginTop: RAIL_MARGIN_TOP,
    marginBottom: RAIL_MARGIN_BOTTOM,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(128,130,120,0.25)',
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  row: {
    height: ROW_H,
    justifyContent: 'center',
  },
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
