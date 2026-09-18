import { useTranslation } from 'react-i18next'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { RecipeOut } from '@carrot/shared/types'
import ColHeader from './ColHeader'
import GripIcon from './GripIcon'
import SortableRow from './SortableRow'
import { getTableColumns, getTableMinWidth } from './helpers'
import { useSortableRecipes } from './useSortableRecipes'

interface RecipesTableProps {
  recipes: RecipeOut[]
  showAddedBy: boolean
  onView: (recipe: RecipeOut) => void
  onEdit: (recipe: RecipeOut) => void
  onDelete: (recipe: RecipeOut) => void
  onToggleFavourite: (recipe: RecipeOut) => void
}

const RecipesTable = ({
  recipes,
  showAddedBy,
  onView,
  onEdit,
  onDelete,
  onToggleFavourite,
}: RecipesTableProps) => {
  const { t } = useTranslation()
  const { sort, displayed, sensors, handleDragEnd, toggleSort } =
    useSortableRecipes(recipes)

  const cols = getTableColumns(showAddedBy)
  const tableContentStyle = { minWidth: getTableMinWidth(showAddedBy) }

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col px-4 md:px-6 pb-6 pt-4">
      <div className="min-h-0 min-w-0 w-full flex-1 overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
        <div className="h-full min-w-0 w-full overflow-auto">
          <div style={tableContentStyle}>
            <div
              className="sticky top-0 z-10 grid items-center gap-2 rounded-t-xl border-b-2 border-zinc-100 bg-zinc-50 px-2 py-2.5"
              style={{ gridTemplateColumns: cols }}
            >
              <div
                className="flex items-center justify-center text-zinc-300"
                title={t('recipes.dragToReorder')}
              >
                <GripIcon />
              </div>
              <div />
              <div />
              <ColHeader
                label={t('recipes.colTitle')}
                field="title"
                sort={sort}
                onToggleSort={toggleSort}
              />
              <div className="flex justify-end">
                <ColHeader
                  label={t('recipes.colServings')}
                  field="servings"
                  sort={sort}
                  onToggleSort={toggleSort}
                  align="right"
                />
              </div>
              <div className="flex justify-end">
                <ColHeader
                  label={t('recipes.colKcal')}
                  field="kcal_per_serving"
                  sort={sort}
                  onToggleSort={toggleSort}
                  align="right"
                />
              </div>
              <div className="flex justify-end">
                <ColHeader
                  label={t('recipes.colProtein')}
                  field="protein_per_serving"
                  sort={sort}
                  onToggleSort={toggleSort}
                  align="right"
                />
              </div>
              <div className="flex justify-end">
                <ColHeader
                  label={t('recipes.colFat')}
                  field="fat_per_serving"
                  sort={sort}
                  onToggleSort={toggleSort}
                  align="right"
                />
              </div>
              <div className="flex justify-end">
                <ColHeader
                  label={t('recipes.colCarbs')}
                  field="carbs_per_serving"
                  sort={sort}
                  onToggleSort={toggleSort}
                  align="right"
                />
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {t('recipes.colHousehold')}
              </div>
              <ColHeader
                label={t('recipes.colAuthor')}
                field="creator_handle"
                sort={sort}
                onToggleSort={toggleSort}
              />
              {showAddedBy && (
                <ColHeader
                  label={t('recipes.colAddedBy')}
                  field="added_by"
                  sort={sort}
                  onToggleSort={toggleSort}
                />
              )}
              <ColHeader
                label={t('recipes.colAdded')}
                field="created_at"
                sort={sort}
                onToggleSort={toggleSort}
              />
              <div className="sticky right-0 z-[1] bg-zinc-50 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.06)]" />
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={displayed.map((r) => r.id)}
                strategy={verticalListSortingStrategy}
              >
                {displayed.map((recipe) => (
                  <SortableRow
                    key={recipe.id}
                    recipe={recipe}
                    showAddedBy={showAddedBy}
                    cols={cols}
                    onView={() => onView(recipe)}
                    onEdit={() => onEdit(recipe)}
                    onDelete={() => onDelete(recipe)}
                    onToggleFavourite={() => onToggleFavourite(recipe)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RecipesTable
