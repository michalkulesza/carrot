# Recipes Table — Design Plan

## Desktop Table

Columns (left → right):

| # | Column | Sortable | Notes |
|---|--------|----------|-------|
| 1 | ≡ drag handle | — | Triggers drag-to-reorder |
| 2 | Thumbnail | — | 48×48px, fixed width |
| 3 | Title | ↕ | |
| 4 | Servings | ↕ | |
| 5 | Kcal | ↕ | |
| 6 | Author | ↕ | `creator_handle` |
| 7 | Added by | ↕ | `added_by` — hidden when no active household |
| 8 | Added | ↕ | `created_at`, default sort desc |
| 9 | ⋯ menu | — | View / Edit / Delete |

## Sorting & Reordering

- **Default sort:** Added date descending (newest first)
- **Column sort:** clicking a header sorts asc → desc → asc; clears any custom drag order
- **Drag reorder:** grabbing ≡ enables row drag; clears the active column sort (reverts to unsorted / manual mode)
- These two modes are mutually exclusive — sorting overrides drag order

## Drag Order Persistence

- Persisted server-side via `PATCH /api/recipes/order`
- Payload: `{ "ids": ["uuid1", "uuid2", ...] }` — full ordered list of recipe IDs
- Needs a new `position` column on the Recipe model and a new route

## 3-dot Menu (⋯)

Actions in order: **View**, **Edit**, **Delete**

- **View** → opens `RecipeDetailModal` (read-only)
- **Edit** → opens `RecipeDetailModal` in edit mode (existing behavior)
- **Delete** → confirmation dialog before calling delete endpoint

## Tag Filter Bar

Unchanged — stays above the table. No tags column in the table itself.

## Mobile

- Keep existing card layout (thumbnail + title + author + servings/kcal pills + tags)
- Add ⋯ menu to each card (same View / Edit / Delete with delete confirmation)
- Tapping the card still opens detail modal
- No table on mobile

## "Added by" Column

- Shown only when a household is active
- Hidden in personal-only context (would always show the same user)

## Implementation Steps

1. **Backend:** add `position` int column to Recipe, migration, `PATCH /api/recipes/order` route
2. **API client:** add `reorderRecipes(ids: string[])` function
3. **Desktop table:** build `RecipesTable` component with sortable headers, thumbnail, drag handles, ⋯ dropdown
4. **Drag-to-reorder:** integrate a drag library (e.g. `@dnd-kit/sortable`) for row dragging
5. **Mobile cards:** add ⋯ menu to existing `RecipeCard`
6. **Delete confirmation:** shared confirm dialog used by both table and card ⋯ menu
7. **Wire up** in `RecipesPage` — responsive switch between table (md+) and cards (mobile)
