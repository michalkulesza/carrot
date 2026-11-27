import type { TFunction } from 'i18next'
import { makeMutable, type SharedValue } from 'react-native-reanimated'
import {
  displayIngredientWithLocalizedUnit,
  getIngredientQuantityCount,
} from '@carrot/shared/utils/ingredientUtils'
import {
  DEFAULT_SHOPPING_CATEGORIES,
  destinationShoppingCategory,
  displayedShoppingCategory as displayedCategory,
  normalizeShoppingCategories,
  type ShoppingCategory,
  type ShoppingCategoryOrders,
  type ShoppingListItem,
} from '@carrot/shared/types'
import { compareShoppingTiebreak } from '@carrot/shared/utils/shoppingListOrder'

type RowGroup = 'item' | 'ticked'

export interface RowStay {
  group: RowGroup
  position: number
}

export type RowPhase = 'idle' | 'ticking' | 'moving' | 'collapsing' | 'expanding' | 'removing' | 'clearing'

const HEIGHT_PHASES: ReadonlySet<RowPhase> = new Set(['collapsing', 'expanding', 'removing', 'clearing'])

export const isHeightPhase = (phase: RowPhase) => HEIGHT_PHASES.has(phase)

export const isMovePhase = (phase: RowPhase) => phase === 'ticking' || phase === 'moving'

export type CollapsedCategories = Partial<Record<ShoppingCategory, boolean>>

export interface ShoppingAisle {
  category: ShoppingCategory
  left: number
  total: number
  collapsed: boolean
  items: ShoppingListItem[]
  ticked: ShoppingListItem[]
}

export const shoppingItemKey = (item: ShoppingListItem) => item.id

export const visibleShoppingCategories = (categories: ShoppingCategory[] | null | undefined) => {
  return normalizeShoppingCategories(categories ?? DEFAULT_SHOPPING_CATEGORIES)
}

export const displayedShoppingCategory = (
  item: ShoppingListItem,
  enabledCategories: ShoppingCategory[]
): ShoppingCategory => displayedCategory(item.category, enabledCategories)

export const progressOf = (items: ShoppingListItem[]) => {
  const done = items.reduce((count, item) => count + (item.completed ? 1 : 0), 0)
  return { done, total: items.length, value: done / Math.max(1, items.length) }
}

interface BuildAislesParams {
  items: ShoppingListItem[]
  categories: ShoppingCategory[]
  collapsedCategories: CollapsedCategories
  showCompleted: boolean
  stay: ReadonlyMap<string, RowStay>
  grace: ReadonlySet<string>
}

export const buildShoppingAisles = ({
  items,
  categories,
  collapsedCategories,
  showCompleted,
  stay,
  grace,
}: BuildAislesParams): ShoppingAisle[] => {
  const itemsByCategory = new Map<ShoppingCategory, ShoppingListItem[]>(categories.map((category) => [category, []]))
  for (const item of items) itemsByCategory.get(displayedShoppingCategory(item, categories))?.push(item)

  const effectivePosition = (item: ShoppingListItem) => stay.get(item.id)?.position ?? item.position
  const byPosition = (a: ShoppingListItem, b: ShoppingListItem) =>
    effectivePosition(a) - effectivePosition(b) || compareShoppingTiebreak(a, b)

  return categories.map((category) => {
    const categoryItems = itemsByCategory.get(category) ?? []
    const left = categoryItems.reduce((count, item) => count + (item.completed ? 0 : 1), 0)

    const unticked: ShoppingListItem[] = []
    const ticked: ShoppingListItem[] = []
    for (const item of categoryItems) {
      const group = stay.get(item.id)?.group ?? (item.completed ? 'ticked' : 'item')
      if (group === 'item') unticked.push(item)
      else if (showCompleted || grace.has(item.id) || stay.has(item.id)) ticked.push(item)
    }

    return {
      category,
      left,
      total: categoryItems.length,
      collapsed: collapsedCategories[category] ?? false,
      items: unticked.sort(byPosition),
      ticked: ticked.sort(byPosition),
    }
  })
}

const hasSameItems = (first: ShoppingListItem[], second: ShoppingListItem[]) =>
  first.length === second.length && first.every((item, index) => item === second[index])

const isSameAisle = (first: ShoppingAisle, second: ShoppingAisle) =>
  first.category === second.category &&
  first.left === second.left &&
  first.total === second.total &&
  first.collapsed === second.collapsed &&
  hasSameItems(first.items, second.items) &&
  hasSameItems(first.ticked, second.ticked)

export const reuseUnchangedAisles = (previous: ShoppingAisle[], next: ShoppingAisle[]) => {
  const previousByCategory = new Map(previous.map((aisle) => [aisle.category, aisle]))
  const reused = next.map((aisle) => {
    const before = previousByCategory.get(aisle.category)
    return before && isSameAisle(before, aisle) ? before : aisle
  })
  const unchanged = reused.length === previous.length && reused.every((aisle, index) => aisle === previous[index])
  return unchanged ? previous : reused
}

const hasSameItemOrder = (first: ShoppingListItem[], second: ShoppingListItem[]) =>
  first.length === second.length && first.every((item, index) => item.id === second[index].id)

export const hasSameAisleOrder = (first: ShoppingAisle[], second: ShoppingAisle[]) =>
  first.length === second.length &&
  first.every((aisle, index) => aisle.category === second[index].category && hasSameItemOrder(aisle.items, second[index].items))

export const withReorderedAisle = (aisles: ShoppingAisle[], category: ShoppingCategory, items: ShoppingListItem[]) =>
  aisles.map((aisle) => (aisle.category === category ? { ...aisle, items } : aisle))

interface TransferParams {
  item: ShoppingListItem
  from: ShoppingCategory
  to: ShoppingCategory
  toIndex: number
}

export const withTransferredItem = (aisles: ShoppingAisle[], { item, from, to, toIndex }: TransferParams) =>
  aisles.map((aisle) => {
    if (aisle.category === from) {
      const items = aisle.items.filter((candidate) => candidate.id !== item.id)
      return { ...aisle, items, left: aisle.left - 1, total: aisle.total - 1 }
    }
    if (aisle.category !== to) return aisle

    const items = [...aisle.items]
    items.splice(toIndex, 0, item)
    return { ...aisle, items, left: aisle.left + 1, total: aisle.total + 1 }
  })

export const categoryOrdersFromAisles = (
  aisles: ShoppingAisle[],
  enabledCategories: ShoppingCategory[],
  incompleteItems: ShoppingListItem[],
): ShoppingCategoryOrders => {
  const incompleteIds = new Set(incompleteItems.map((item) => item.id))
  const included = new Set<string>()
  const orders: ShoppingCategoryOrders = {}

  const append = (category: ShoppingCategory, id: string) => {
    const order = orders[category] ?? []
    order.push(id)
    orders[category] = order
    included.add(id)
  }

  for (const aisle of aisles) {
    for (const item of aisle.items) {
      if (incompleteIds.has(item.id)) append(destinationShoppingCategory(item.category, aisle.category, enabledCategories), item.id)
    }
  }
  for (const item of incompleteItems) {
    if (!included.has(item.id)) append(item.category, item.id)
  }
  return orders
}

export const displayItemText = (text: string, t: TFunction) =>
  displayIngredientWithLocalizedUnit(text, (unit, qty) =>
    t(`units.${unit}`, {
      count: ['cl', 'piece', 'sprig', 'leaf', 'sheet'].includes(unit) && qty ? getIngredientQuantityCount(qty) : 1,
      defaultValue: unit,
    }),
  )

export const withMapEntry = <K extends string, V>(map: ReadonlyMap<K, V>, key: K, value: V | null): Map<K, V> => {
  const next = new Map(map)
  if (value === null) next.delete(key)
  else next.set(key, value)
  return next
}

export const withSetMember = (set: ReadonlySet<string>, member: string, present: boolean): Set<string> => {
  const next = new Set(set)
  if (present) next.add(member)
  else next.delete(member)
  return next
}

const SORTABLE_ID_PREFIX = 'aisle-'

export const aisleSortableId = (category: ShoppingCategory) => `${SORTABLE_ID_PREFIX}${category}`

export const categoryFromSortableId = (id: string): ShoppingCategory | null => {
  const category = id.slice(SORTABLE_ID_PREFIX.length)
  return DEFAULT_SHOPPING_CATEGORIES.find((candidate) => candidate === category) ?? null
}

const EMPTY_PHASES: ReadonlyMap<string, RowPhase> = new Map()

export const aislePhases = (
  aisle: ShoppingAisle,
  phases: ReadonlyMap<string, RowPhase>,
  clearing: boolean,
): ReadonlyMap<string, RowPhase> => {
  const entries: [string, RowPhase][] = []
  for (const item of [...aisle.items, ...aisle.ticked]) {
    const phase = clearing && item.completed ? 'clearing' : phases.get(item.id)
    if (phase && phase !== 'idle') entries.push([item.id, phase])
  }
  return entries.length > 0 ? new Map(entries) : EMPTY_PHASES
}

export const isSamePhases = (first: ReadonlyMap<string, RowPhase>, second: ReadonlyMap<string, RowPhase>) =>
  first.size === second.size && [...first].every(([id, phase]) => second.get(id) === phase)

export type CategoryValues = Record<ShoppingCategory, SharedValue<number>>

export const createCategoryValues = () => {
  const values = {} as CategoryValues
  for (const category of DEFAULT_SHOPPING_CATEGORIES) values[category] = makeMutable(0)
  return values
}
