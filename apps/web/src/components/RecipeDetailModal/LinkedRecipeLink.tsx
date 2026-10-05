import type { ReactNode } from 'react'

interface LinkedRecipeLinkProps {
  url: string
  recipeId: string | null | undefined
  onOpenRecipe?: (id: string) => void
  className: string
  children: ReactNode
}

// A resolved link opens the imported recipe in-app; otherwise it opens the source page.
const LinkedRecipeLink = ({
  url,
  recipeId,
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
