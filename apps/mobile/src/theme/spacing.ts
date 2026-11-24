export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 } as const

export type SpaceKey = keyof typeof space

export const screenGutter = 20
export const sectionGap = 28
