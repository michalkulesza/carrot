import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecipeOut } from '@carrot/shared/types'
import { useHousehold } from '../context/HouseholdContext'

interface HouseholdAvatar {
  id: string
  name: string
  label?: string
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
  const { households } = useHousehold()

  const avatars = useMemo<HouseholdAvatar[]>(
    () =>
      recipe.household_ids
        .map((id) => households.find((household) => household.id === id))
        .filter((household): household is NonNullable<typeof household> => !!household)
        .map((household) => ({
          id: household.id,
          name: household.name,
          color: household.color,
          tooltip: household.name,
        })),
    [recipe.household_ids, households]
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
          {avatar.label ?? getInitials(avatar.name)}
        </span>
      ))}
    </div>
  )
}

export default HouseholdAvatarIndicators
