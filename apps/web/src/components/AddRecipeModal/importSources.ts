export type ImportMode = 'url' | 'text' | 'image'

export type LinkPlatform = 'Website' | 'Instagram' | 'TikTok' | 'YouTube'

export interface SourceStyle {
  tile: string
  solid: string
  title: string
  hint: string
  ring: string
  soft: string
}

export const SOURCE_STYLES: Record<ImportMode, SourceStyle> = {
  url: {
    tile: '#FDEFE4',
    solid: '#E8894A',
    title: '#7A3A12',
    hint: '#9A5A30',
    ring: '#E8894A',
    soft: '#FDEFE4',
  },
  image: {
    tile: '#EEEAFE',
    solid: '#7C6AE0',
    title: '#3B2F8C',
    hint: '#5B4BC4',
    ring: '#7C6AE0',
    soft: '#EEEAFE',
  },
  text: {
    tile: '#E5F4EA',
    solid: '#3F9B62',
    title: '#1E5634',
    hint: '#2F7A4A',
    ring: '#3F9B62',
    soft: '#E5F4EA',
  },
}

export const PLATFORM_COLORS: Record<LinkPlatform, { bg: string; fg: string }> =
  {
    Instagram: { bg: '#FCE7F1', fg: '#B4236A' },
    TikTok: { bg: '#E9E8EE', fg: '#1F1D2B' },
    YouTube: { bg: '#FDE8E8', fg: '#C53030' },
    Website: { bg: '#E6EEFD', fg: '#2B5BC4' },
  }

export const detectPlatform = (value: string): LinkPlatform | null => {
  const text = value.trim().toLowerCase()
  if (!text) return null
  if (text.includes('instagram')) return 'Instagram'
  if (text.includes('tiktok')) return 'TikTok'
  if (text.includes('youtu')) return 'YouTube'
  if (/^https?:\/\/|^www\./.test(text)) return 'Website'

  return null
}

export interface ParsedRecipeText {
  title: string
  ingredients: number
  steps: number
  chars: number
}

// Recipe text can be in any supported language, independently of the UI locale.
const isStepLine = (line: string) =>
  /^(?:\d+[.)]\s|(?:step|schritt|krok|étape|etape|paso)\s*\d+(?!\d))/iu.test(
    line
  )

const INGREDIENT_AMOUNT_PATTERN =
  /^(?:\d+(?:[.,]\d+|\/\d+)?(?:\s+\d+\/\d+|\s*[½¼¾])?|[½¼¾])(?:\s|(?=[\p{L}]))/u
const INGREDIENT_CUE_PATTERN =
  /^(?:(?:(?:a|eine|una|une)\s+)?(?:pinch|prise|szczypta|szczyptę|szczypty|pincée|pincee|pizca))(?!\p{L})|^a\s|^[-•*]/iu

const isIngredientLine = (line: string) =>
  !isStepLine(line) &&
  (INGREDIENT_AMOUNT_PATTERN.test(line) || INGREDIENT_CUE_PATTERN.test(line))

export const parseRecipeText = (text: string): ParsedRecipeText => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return {
    title:
      lines.find((line) => !isStepLine(line) && !isIngredientLine(line)) ?? '',
    ingredients: lines.filter(isIngredientLine).length,
    steps: lines.filter(isStepLine).length,
    chars: text.length,
  }
}
