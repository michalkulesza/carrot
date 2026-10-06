import type { ComponentType } from 'react'
import AllergensCard from './cards/AllergensCard'
import HouseholdCard from './cards/HouseholdCard'
import LinkedRecipesCard from './cards/LinkedRecipesCard'
import MealPlanCard from './cards/MealPlanCard'
import ScalingCard from './cards/ScalingCard'
import TimerCard from './cards/TimerCard'
import UnitsCard from './cards/UnitsCard'

export type FeatureKey =
  | 'household'
  | 'allergens'
  | 'linkedRecipes'
  | 'scaling'
  | 'units'
  | 'timers'
  | 'mealPlan'

interface Feature {
  key: FeatureKey
  Card: ComponentType
  /** Prefix for this feature's translation keys, e.g. `auth.features.units`. */
  translationPrefix: string
}

const defineFeature = (key: FeatureKey, Card: ComponentType): Feature => ({
  key,
  Card,
  translationPrefix: `auth.features.${key}`,
})

export const FEATURES: Feature[] = [
  defineFeature('household', HouseholdCard),
  defineFeature('allergens', AllergensCard),
  defineFeature('linkedRecipes', LinkedRecipesCard),
  defineFeature('scaling', ScalingCard),
  defineFeature('units', UnitsCard),
  defineFeature('timers', TimerCard),
  defineFeature('mealPlan', MealPlanCard),
]
