export const radius = { badge: 6, chipThumb: 8, input: 10, thumb: 12, control: 14, card: 20, sheet: 36, round: 999 } as const

export type RadiusKey = keyof typeof radius
