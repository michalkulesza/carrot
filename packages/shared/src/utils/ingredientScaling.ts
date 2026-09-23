import { UNITS } from '../types'

const VULGAR_FRACTIONS: Record<string, number> = {
  '⅛': 1 / 8,
  '¼': 1 / 4,
  '⅓': 1 / 3,
  '⅜': 3 / 8,
  '½': 1 / 2,
  '⅝': 5 / 8,
  '⅔': 2 / 3,
  '¾': 3 / 4,
  '⅞': 7 / 8,
}

const VULGAR_FRACTION_PATTERN = Object.keys(VULGAR_FRACTIONS).join('')
const SIMPLE_QUANTITY_PATTERN = `(?:\\d+(?:[.,]\\d+)?(?:[${VULGAR_FRACTION_PATTERN}]|\\s+(?:\\d+[\\/⁄]\\d+|[${VULGAR_FRACTION_PATTERN}]))?|\\d+[\\/⁄]\\d+|[${VULGAR_FRACTION_PATTERN}])`
const QUANTITY_RANGE_PATTERN = `(${SIMPLE_QUANTITY_PATTERN})(?:\\s*(?:-|–|—)\\s*|\\s+to\\s+)(${SIMPLE_QUANTITY_PATTERN})`
const LEADING_QUANTITY_PATTERN = new RegExp(
  `^(\\s*)(?:${QUANTITY_RANGE_PATTERN}|(${SIMPLE_QUANTITY_PATTERN}))(?=\\s|$|[x×])`,
  'i',
)
const UNIT_PATTERN = UNITS.join('|')
const EMBEDDED_QUANTITY_PATTERN = new RegExp(
  `(?:${QUANTITY_RANGE_PATTERN}|(${SIMPLE_QUANTITY_PATTERN}))(\\s*)((?:${UNIT_PATTERN})(?:es|s)?)\\b`,
  'gi',
)
const CUP_PATTERN = new RegExp(
  `(?:${QUANTITY_RANGE_PATTERN}|(${SIMPLE_QUANTITY_PATTERN}))\\s+cups?\\b`,
  'i',
)

const parseSlashFraction = (value: string): number | null => {
  const [numeratorText, denominatorText] = value.split(/[\/⁄]/)
  const numerator = Number(numeratorText)
  const denominator = Number(denominatorText)

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null
  }

  return numerator / denominator
}

const parseQuantity = (quantity: string): number | null => {
  const normalized = quantity.trim()
  const vulgarFraction = normalized.charAt(normalized.length - 1)
  const vulgarValue = vulgarFraction ? VULGAR_FRACTIONS[vulgarFraction] : undefined

  if (vulgarValue !== undefined) {
    const wholeText = normalized.slice(0, -1).trim()
    const whole = wholeText === '' ? 0 : Number(wholeText.replace(',', '.'))

    return Number.isFinite(whole) ? whole + vulgarValue : null
  }

  const mixedSlashMatch = normalized.match(/^(\d+(?:[.,]\d+)?)\s+(\d+[\/⁄]\d+)$/)
  if (mixedSlashMatch) {
    const whole = Number(mixedSlashMatch[1].replace(',', '.'))
    const fraction = parseSlashFraction(mixedSlashMatch[2])

    return fraction === null ? null : whole + fraction
  }

  if (normalized.includes('/') || normalized.includes('⁄')) {
    return parseSlashFraction(normalized)
  }

  const decimal = Number(normalized.replace(',', '.'))

  return Number.isFinite(decimal) ? decimal : null
}

const formatQuantity = (value: number, decimalSeparator: '.' | ','): string => {
  if (value > 0 && value < 0.005) {
    const decimal = Number(value.toPrecision(6)).toString()

    return decimalSeparator === ',' ? decimal.replace('.', ',') : decimal
  }

  const whole = Math.floor(value)
  const remainder = value - whole

  if (remainder < 0.005) return whole.toString()
  if (1 - remainder < 0.005) return (whole + 1).toString()

  const fraction = Object.entries(VULGAR_FRACTIONS).find(
    ([, fractionValue]) => Math.abs(remainder - fractionValue) < 0.005,
  )
  if (fraction) return `${whole || ''}${fraction[0]}`

  const decimal = Number(value.toFixed(2)).toString()

  return decimalSeparator === ',' ? decimal.replace('.', ',') : decimal
}

const scaleEmbeddedQuantities = (text: string, scale: number): string =>
  text.replace(
    EMBEDDED_QUANTITY_PATTERN,
    (matchText, rangeStart, rangeEnd, single, spacing, unitText, offset) => {
      if (/(?:\bx|×|\beach)\s*$/i.test(text.slice(0, offset))) return matchText
      if (/^\s*(?:each\b|per\s+\w+\b)/i.test(text.slice(offset + matchText.length))) {
        return matchText
      }

      const format = (quantityText: string): string => {
        const quantity = parseQuantity(quantityText)
        if (quantity === null) return quantityText

        return formatQuantity(quantity * scale, quantityText.includes(',') ? ',' : '.')
      }

      if (rangeStart && rangeEnd) {
        return `${format(rangeStart)}-${format(rangeEnd)}${spacing}${unitText}`
      }

      return `${format(single)}${spacing}${unitText}`
    },
  )

export const scaleIngredientQuantity = (ingredient: string, scale: number): string => {
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return ingredient

  const match = ingredient.match(LEADING_QUANTITY_PATTERN)
  if (!match) return scaleEmbeddedQuantities(ingredient, scale)

  const format = (quantityText: string): string => {
    const quantity = parseQuantity(quantityText)
    if (quantity === null) return quantityText

    return formatQuantity(quantity * scale, quantityText.includes(',') ? ',' : '.')
  }
  const scaledQuantity =
    match[2] && match[3]
      ? `${format(match[2])}-${format(match[3])}`
      : format(match[4] ?? '')
  const rest = scaleEmbeddedQuantities(ingredient.slice(match[0].length), scale)

  return `${match[1]}${scaledQuantity}${rest}`
}

export const getImperialCupQty = (
  imperialIngredient: string | undefined,
  servingScale: number,
  metricIngredient?: string,
): string | null => {
  if (!imperialIngredient || (metricIngredient && CUP_PATTERN.test(metricIngredient))) {
    return null
  }

  const scaled = scaleIngredientQuantity(imperialIngredient, servingScale)
  const match = scaled.match(CUP_PATTERN)

  if (!match) return null

  return match[1] && match[2] ? `${match[1]}-${match[2]}` : (match[3] ?? null)
}
