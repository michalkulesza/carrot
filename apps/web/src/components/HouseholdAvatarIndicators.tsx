import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { useAuth } from '../context/AuthContext'
import { useHousehold } from '../context/HouseholdContext'

interface HouseholdAvatar {
  id: string
  name: string
  color?: string
  tooltip: string
}

interface HouseholdAvatarIndicatorsProps {
  recipe: RecipeOut
  size?: 'sm' | 'md'
  className?: string
}

const getInitials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const firstInitial = words[0]?.[0] ?? ''
  const secondInitial =
    words.length > 1 ? (words[1]?.[0] ?? '') : (words[0]?.[1] ?? '')

  return `${firstInitial}${secondInitial}`.toUpperCase()
}

const HouseholdAvatarIndicators = ({
  recipe,
  size = 'md',
  className = '',
}: HouseholdAvatarIndicatorsProps) => {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { households } = useHousehold()
  const personalName = user?.nickname || user?.email || t('households.personal')
  const recipeHousehold = recipe.household_id
    ? households.find((household) => household.id === recipe.household_id)
    : undefined

  const avatars = useMemo<HouseholdAvatar[]>(
    () => [
      ...(!recipe.household_id || recipe.shared_to_personal
        ? [
            {
              id: 'personal',
              name: personalName,
              tooltip: t('households.personalHousehold'),
            },
          ]
        : []),
      ...(recipeHousehold
        ? [
            {
              id: recipeHousehold.id,
              name: recipeHousehold.name,
              color: recipeHousehold.color,
              tooltip: recipeHousehold.name,
            },
          ]
        : []),
    ],
    [
      personalName,
      recipe.household_id,
      recipe.shared_to_personal,
      recipeHousehold,
      t,
    ]
  )
  const avatarClassName =
    size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-7 w-7 text-[11px]'

  if (avatars.length === 0) return null

  return (
    <div
      className={`flex -space-x-1.5 ${className}`}
      role="group"
      aria-label={t('recipes.colHousehold')}
    >
      {avatars.map((avatar) => (
        <span
          key={avatar.id}
          className={`inline-flex ${avatarClassName} items-center justify-center rounded-full border-2 border-white font-bold ${
            avatar.color ? 'text-white' : 'bg-zinc-200 text-zinc-500'
          }`}
          style={avatar.color ? { backgroundColor: avatar.color } : undefined}
          title={avatar.tooltip}
          role="img"
          aria-label={avatar.tooltip}
        >
          {getInitials(avatar.name)}
        </span>
      ))}
    </div>
  )
}

export default HouseholdAvatarIndicators
