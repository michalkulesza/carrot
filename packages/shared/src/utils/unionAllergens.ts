export const unionAllergens = (
  household: string[] | null | undefined,
  personal: string[] | null | undefined
): string[] => Array.from(new Set([...(household ?? []), ...(personal ?? [])]))
