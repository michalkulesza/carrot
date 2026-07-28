import {
  DEFAULT_SHOPPING_CATEGORIES,
  type ShoppingCategory,
  type ShoppingCategoryOrders,
  type ShoppingListItem,
} from '@carrot/shared/types'

export type ShoppingListRow =
  | { kind: 'section'; category: ShoppingCategory; collapsed: boolean }
  | { kind: 'item'; category: ShoppingCategory; item: ShoppingListItem }
  | { kind: 'add'; category: ShoppingCategory }
  | { kind: 'completed'; category: ShoppingCategory; item: ShoppingListItem }

export const visibleShoppingCategories = (categories: ShoppingCategory[] | null | undefined) => {
  const enabled = categories ?? DEFAULT_SHOPPING_CATEGORIES
  return DEFAULT_SHOPPING_CATEGORIES.filter((category) => enabled.includes(category))
}

export const displayedShoppingCategory = (
  item: ShoppingListItem,
  enabledCategories: ShoppingCategory[]
): ShoppingCategory => enabledCategories.includes(item.category) ? item.category : 'other'

export const buildShoppingListRows = ({
  items,
  categories,
  collapsedCategories,
  showCompleted,
  recentCompletedIds,
}: {
  items: ShoppingListItem[]
  categories: ShoppingCategory[]
  collapsedCategories: Partial<Record<ShoppingCategory, boolean>>
  showCompleted: boolean
  recentCompletedIds: Set<string>
}): ShoppingListRow[] => {
  const rows: ShoppingListRow[] = []
  for (const category of categories) {
    const categoryItems = items.filter((item) => displayedShoppingCategory(item, categories) === category)
    const activeItems = categoryItems.filter((item) => !item.completed).sort((a, b) => a.position - b.position)
    const completedItems = categoryItems
      .filter((item) => item.completed && (showCompleted || recentCompletedIds.has(item.id)))
      .sort((a, b) => a.position - b.position)
    const collapsed = collapsedCategories[category] ?? false

    rows.push({ kind: 'section', category, collapsed })
    if (collapsed) continue
    rows.push(...activeItems.map((item) => ({ kind: 'item' as const, category, item })))
    rows.push({ kind: 'add', category })
    rows.push(...completedItems.map((item) => ({ kind: 'completed' as const, category, item })))
  }
  return rows
}

export const normalizeShoppingListRows = (rows: ShoppingListRow[]): ShoppingListRow[] => {
  const normalizedRows: ShoppingListRow[] = []
  let categoryRows: ShoppingListRow[] = []

  const appendCategoryRows = () => {
    const addRow = categoryRows.find((row) => row.kind === 'add')
    if (!addRow) {
      normalizedRows.push(...categoryRows)
      categoryRows = []
      return
    }

    normalizedRows.push(
      ...categoryRows.filter((row) => row.kind === 'item'),
      addRow,
      ...categoryRows.filter((row) => row.kind !== 'item' && row.kind !== 'add'),
    )
    categoryRows = []
  }

  for (const row of rows) {
    if (row.kind === 'section') {
      appendCategoryRows()
      normalizedRows.push(row)
      continue
    }
    categoryRows.push(row)
  }
  appendCategoryRows()

  return normalizedRows
}

export const categoryOrdersFromRows = (rows: ShoppingListRow[]): ShoppingCategoryOrders => {
  const orders: ShoppingCategoryOrders = {}
  let destinationCategory: ShoppingCategory | null = null

  for (const row of rows) {
    if (row.kind === 'section') {
      destinationCategory = row.collapsed ? null : row.category
      continue
    }
    if (row.kind === 'add') {
      destinationCategory = null
      continue
    }
    if (row.kind !== 'item' || destinationCategory === null) continue

    const category = destinationCategory === 'other' ? row.item.category : destinationCategory
    const categoryOrder = orders[category] ?? []
    categoryOrder.push(row.item.id)
    orders[category] = categoryOrder
  }
  return orders
}
