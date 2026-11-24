import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'recent-activity:v1'

export type CookSession = {
  recipeId: string
  stepIndex: number
  totalSteps: number
  updatedAt: number
}

export type LastViewed = {
  recipeId: string
  viewedAt: number
}

export type RecentActivity = {
  cook?: CookSession
  lastViewed?: LastViewed
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseCook = (value: unknown): CookSession | undefined => {
  if (!isRecord(value)) return undefined
  const { recipeId, stepIndex, totalSteps, updatedAt } = value
  if (
    typeof recipeId !== 'string' ||
    typeof stepIndex !== 'number' ||
    typeof totalSteps !== 'number' ||
    typeof updatedAt !== 'number'
  ) {
    return undefined
  }

  return { recipeId, stepIndex, totalSteps, updatedAt }
}

const parseLastViewed = (value: unknown): LastViewed | undefined => {
  if (!isRecord(value)) return undefined
  const { recipeId, viewedAt } = value
  if (typeof recipeId !== 'string' || typeof viewedAt !== 'number') return undefined

  return { recipeId, viewedAt }
}

const parseActivity = (raw: string | null): RecentActivity => {
  if (!raw) return {}

  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) return {}

  const activity: RecentActivity = {}
  const cook = parseCook(parsed.cook)
  const lastViewed = parseLastViewed(parsed.lastViewed)
  if (cook) activity.cook = cook
  if (lastViewed) activity.lastViewed = lastViewed

  return activity
}

export const readRecentActivity = async (): Promise<RecentActivity> => {
  try {
    return parseActivity(await AsyncStorage.getItem(STORAGE_KEY))
  } catch {
    return {}
  }
}

const persist = async (activity: RecentActivity): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(activity))
  } catch {}
}

export const writeCookSession = async (session: CookSession): Promise<RecentActivity> => {
  const activity = { ...(await readRecentActivity()), cook: session }
  await persist(activity)

  return activity
}

export const clearCookSession = async (recipeId: string): Promise<RecentActivity> => {
  const current = await readRecentActivity()
  if (current.cook?.recipeId !== recipeId) return current

  const { cook: _cook, ...activity } = current
  await persist(activity)

  return activity
}

export const writeLastViewed = async (recipeId: string): Promise<RecentActivity> => {
  const activity = {
    ...(await readRecentActivity()),
    lastViewed: { recipeId, viewedAt: Date.now() },
  }
  await persist(activity)

  return activity
}
