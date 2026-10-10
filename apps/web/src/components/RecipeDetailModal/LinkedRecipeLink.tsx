import type { ReactNode } from 'react'
import type { IngredientLinkKind } from '@carrot/shared/types'
import UnresolvedLinkMenu from './UnresolvedLinkMenu'

interface LinkedRecipeLinkProps {
  url: string
  kind?: IngredientLinkKind | null
  recipeId: string | null | undefined
  parentRecipeId?: string
  onOpenRecipe?: (id: string) => void
  className: string
  children: ReactNode
}

// A resolved link opens the imported recipe in-app; an unresolved one offers import or the source page; an external one is a plain link.
const LinkedRecipeLink = ({
  url,
  kind,
  recipeId,
  parentRecipeId,
  onOpenRecipe,
  className,
  children,
}: LinkedRecipeLinkProps) => {
  const isExternal = kind === 'external'

  if (recipeId && onOpenRecipe && !isExternal)
    return (
      <button
        type="button"
        onClick={() => onOpenRecipe(recipeId)}
        className={className}
      >
        {children}
      </button>
    )

  if (parentRecipeId && !isExternal)
    return (
      <UnresolvedLinkMenu
        url={url}
        parentRecipeId={parentRecipeId}
        onOpenRecipe={onOpenRecipe}
        className={className}
      >
        {children}
      </UnresolvedLinkMenu>
    )

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  )
}

export default LinkedRecipeLink
