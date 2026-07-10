import { useTranslation } from 'react-i18next'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { RecipeOut } from '@carrot/shared/types'
import ColHeader from './ColHeader'
import GripIcon from './GripIcon'
import SortableRow from './SortableRow'
import { getTableColumns } from './helpers'
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

  return (
    <div className="px-4 mt-4 pb-6">
      <div className="rounded-xl bg-white shadow-sm border border-zinc-100 overflow-hidden">
        <div className="overflow-x-auto">
          <div
            className="grid items-center gap-2 px-2 py-2.5 border-b-2 border-zinc-100 bg-zinc-50 rounded-t-xl"
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
  )
}

export default RecipesTable
