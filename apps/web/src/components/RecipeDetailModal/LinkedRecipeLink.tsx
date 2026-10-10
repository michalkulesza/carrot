import type { ReactNode } from 'react'
import UnresolvedLinkMenu from './UnresolvedLinkMenu'

interface LinkedRecipeLinkProps {
  url: string
  recipeId: string | null | undefined
  parentRecipeId?: string
  onOpenRecipe?: (id: string) => void
  className: string
  children: ReactNode
}

// A resolved link opens the imported recipe in-app; an unresolved one offers import or the source page.
const LinkedRecipeLink = ({
  url,
  recipeId,
  parentRecipeId,
  onOpenRecipe,
  className,
  children,
}: LinkedRecipeLinkProps) => {
  if (recipeId && onOpenRecipe)
    return (
      <button
        type="button"
        onClick={() => onOpenRecipe(recipeId)}
        className={className}
      >
        {children}
      </button>
    )

  if (parentRecipeId)
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
