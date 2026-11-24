export const radius = { input: 10, control: 14, card: 20, sheet: 28, round: 999 } as const

export type RadiusKey = keyof typeof radius
