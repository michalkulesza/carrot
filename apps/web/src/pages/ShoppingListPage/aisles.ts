import type { ShoppingCategory } from '@carrot/shared/types'
import { AISLE_STAGES } from './aisleKeywords'

export { parseItemText } from './itemQuantity'

export interface AisleStyle {
  bg: string
  fg: string
  dot: string
}

export const AISLE_STYLES: Record<ShoppingCategory, AisleStyle> = {
  produce: { bg: '#E5F4EA', fg: '#2F7A4A', dot: '#3F9B62' },
  meat_seafood: { bg: '#FDE8E8', fg: '#A83434', dot: '#D45454' },
  dairy_eggs: { bg: '#E6EEFD', fg: '#2B5BC4', dot: '#4A7BE0' },
  pantry: { bg: '#FEF3DC', fg: '#9A5508', dot: '#F0A43A' },
  frozen: { bg: '#E3F5F8', fg: '#1B6B7B', dot: '#3BAFC4' },
  other: { bg: '#F1EFF5', fg: '#4A4858', dot: '#8C8A99' },
}

// Lowercase, strip accents and punctuation so "Äpfel", "Brühe" and
// "jalapeño" match the accent-free keyword lists.
export const normalizeItemText = (text: string): string =>
  text
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_/,.;:()'’"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// "word" matches at the start of a word, "word$" the whole word, and
// "*word" anywhere inside a word.
const compileWord = (word: string): string => {
  const normalized = normalizeItemText(
    word.replace(/^\*/, '').replace(/\$$/, '')
  )
  const anywhere = word.startsWith('*')
  const whole = word.endsWith('$')
  const start = anywhere ? '' : '(?<![\\p{L}\\p{N}])'
  const end = whole ? '(?![\\p{L}\\p{N}])' : ''

  return `${start}${escape(normalized)}${end}`
}

const compilePattern = (words: string[]): RegExp | null =>
  words.length ? new RegExp(words.map(compileWord).join('|'), 'u') : null

const COMPILED_STAGES = AISLE_STAGES.map(
  ({ category, words, languageWords }) => ({
    category,
    pattern: compilePattern(words),
    languagePatterns: Object.fromEntries(
      Object.entries(languageWords ?? {}).map(([language, keywords]) => [
        language,
        compilePattern(keywords),
      ])
    ),
  })
)

export const guessCategory = (
  text: string,
  locale = 'en'
): ShoppingCategory => {
  const normalized = normalizeItemText(text)
  if (!normalized) return 'other'
  const language = locale.toLowerCase().split(/[-_]/)[0]
  const match = COMPILED_STAGES.find(
    ({ pattern, languagePatterns }) =>
      pattern?.test(normalized) || languagePatterns[language]?.test(normalized)
  )

  return match ? match.category : 'other'
}
