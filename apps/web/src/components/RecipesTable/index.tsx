import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { RecipeOut } from '@carrot/shared/types'
import ColHeader from './ColHeader'
import GripIcon from './GripIcon'
import SortableRow from './SortableRow'
import { getMacroMax, getTableColumns, getTableMinWidth } from './helpers'
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

  const macroMax = useMemo(() => getMacroMax(displayed), [displayed])
  const cols = getTableColumns(showAddedBy)
  const tableContentStyle = { minWidth: getTableMinWidth(showAddedBy) }

  return (
    <div className="h-full min-h-0 min-w-0 w-full flex-1 overflow-auto bg-white font-nunito text-ink">
      <div style={tableContentStyle}>
        <div
          className="sticky top-0 z-10 grid items-center gap-3.5 border-b border-mist-soft bg-white px-5 py-3"
          style={{ gridTemplateColumns: cols }}
        >
          <div
            className="flex items-center justify-center text-ink-ghost"
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
          <ColHeader
            label={t('recipes.colServings')}
            field="servings"
            sort={sort}
            onToggleSort={toggleSort}
            align="center"
          />
          <ColHeader
            label={t('recipes.colKcal')}
            field="kcal_per_serving"
            sort={sort}
            onToggleSort={toggleSort}
          />
          <ColHeader
            label={t('recipes.colProtein')}
            field="protein_per_serving"
            sort={sort}
            onToggleSort={toggleSort}
            idleClassName="text-protein-ink"
          />
          <ColHeader
            label={t('recipes.colFat')}
            field="fat_per_serving"
            sort={sort}
            onToggleSort={toggleSort}
            idleClassName="text-fat-ink"
          />
          <ColHeader
            label={t('recipes.colCarbs')}
            field="carbs_per_serving"
            sort={sort}
            onToggleSort={toggleSort}
            idleClassName="text-carbs-ink"
          />
          <div className="text-xs font-extrabold uppercase tracking-[.06em] text-ink-subtle">
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
          <div className="sticky right-0 z-[1] bg-white" />
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
                macroMax={macroMax}
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
  )
}

export default RecipesTable
