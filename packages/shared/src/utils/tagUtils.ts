export const tTag = (name: string, t: (key: string, options?: Record<string, unknown>) => string): string => {
  const key = name.replace(/[-\s]/g, '_')
  return t(`defaultTags.${key}`, { defaultValue: name })
}
