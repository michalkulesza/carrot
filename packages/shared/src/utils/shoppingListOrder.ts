import type { ShoppingListItem } from '../types'

const TIMEZONE_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i

// The API serialises naive UTC timestamps without an offset; Date.parse would read those as local time.
const timeOf = (timestamp: string) => Date.parse(TIMEZONE_SUFFIX.test(timestamp) ? timestamp : `${timestamp}Z`)

const compareOrdinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export const compareShoppingTiebreak = (a: ShoppingListItem, b: ShoppingListItem) =>
  timeOf(a.created_at) - timeOf(b.created_at) || compareOrdinal(a.id, b.id)

export const compareShoppingItems = (a: ShoppingListItem, b: ShoppingListItem) =>
  a.position - b.position || compareShoppingTiebreak(a, b)

const nextPosition = (items: ShoppingListItem[]) =>
  items.length === 0 ? 0 : Math.max(...items.map((item) => item.position)) + 1

const resolveRestoreAnchor = (
  item: ShoppingListItem,
  others: ShoppingListItem[]
): ShoppingListItem | null => {
  const byId = new Map(others.map((other) => [other.id, other]))
  const visited = new Set([item.id])
  let anchorId = item.restore_before_id

  while (anchorId !== null && !visited.has(anchorId)) {
    const anchor = byId.get(anchorId)
    if (!anchor) return null
    if (!anchor.completed) return anchor
    visited.add(anchorId)
    anchorId = anchor.restore_before_id
  }

  return null
}

const tick = (items: ShoppingListItem[], target: ShoppingListItem): ShoppingListItem[] => {
  const categoryItems = items.filter((item) => item.category === target.category)
  const others = categoryItems.filter((item) => item.id !== target.id)
  const unticked = categoryItems.filter((item) => !item.completed).sort(compareShoppingItems)
  const following = unticked[unticked.indexOf(target) + 1]
  const tickedPosition = nextPosition(others.filter((item) => item.completed))

  return items.map((item) =>
    item.id === target.id
      ? {
          ...item,
          completed: true,
          position: tickedPosition,
          restore_before_id: following?.id ?? null,
        }
      : item
  )
}

const untick = (items: ShoppingListItem[], target: ShoppingListItem): ShoppingListItem[] => {
  const others = items.filter((item) => item.category === target.category && item.id !== target.id)
  const anchor = resolveRestoreAnchor(target, others)
  const ordered = others.filter((item) => !item.completed).sort(compareShoppingItems)
  const anchorIndex = anchor ? ordered.indexOf(anchor) : ordered.length
  const orderedIds = [
    ...ordered.slice(0, anchorIndex).map((item) => item.id),
    target.id,
    ...ordered.slice(anchorIndex).map((item) => item.id),
  ]
  const positionById = new Map(orderedIds.map((id, position) => [id, position]))

  return items.map((item) => {
    if (item.id === target.id) {
      return { ...item, completed: false, restore_before_id: null, position: positionById.get(item.id) ?? 0 }
    }
    const position = positionById.get(item.id)
    return position === undefined || position === item.position ? item : { ...item, position }
  })
}

export const toggleShoppingItem = (
  items: ShoppingListItem[],
  id: string,
  completed: boolean
): ShoppingListItem[] => {
  const target = items.find((item) => item.id === id)
  if (!target || target.completed === completed) return items

  return completed ? tick(items, target) : untick(items, target)
}
