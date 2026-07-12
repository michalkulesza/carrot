import type { Tag, TagCategory } from '../types'

export const TAG_CATEGORIES: TagCategory[] = ['protein', 'carb', 'cuisine', 'time']

export const groupTagsByCategory = (
  tags: Tag[]
): Record<TagCategory, Tag[]> & { other: Tag[] } => {
  const grouped: Record<TagCategory, Tag[]> & { other: Tag[] } = {
    protein: [],
    carb: [],
    cuisine: [],
    time: [],
    other: [],
  }
  for (const tag of tags) {
    if (tag.category && TAG_CATEGORIES.includes(tag.category)) {
      grouped[tag.category].push(tag)
    } else {
      grouped.other.push(tag)
    }
  }
  return grouped
}

export const matchesTagFilters = (
  recipeTags: Tag[],
  allTags: Tag[],
  selectedTagIds: Set<string>
): boolean => {
  if (selectedTagIds.size === 0) return true

  const categoryById = new Map(allTags.map((tag) => [tag.id, tag.category ?? 'other']))
  const selectedByGroup = new Map<string, Set<string>>()
  for (const tagId of selectedTagIds) {
    const group = categoryById.get(tagId) ?? 'other'
    if (!selectedByGroup.has(group)) selectedByGroup.set(group, new Set())
    selectedByGroup.get(group)!.add(tagId)
  }

  const recipeTagIds = new Set(recipeTags.map((tag) => tag.id))
  for (const groupSelection of selectedByGroup.values()) {
    let matchesGroup = false
    for (const tagId of groupSelection) {
      if (recipeTagIds.has(tagId)) {
        matchesGroup = true
        break
      }
    }
    if (!matchesGroup) return false
  }
  return true
}
