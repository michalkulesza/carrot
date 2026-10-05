import type { StructuredIngredient } from '@carrot/shared/utils/ingredientUtils'

const FRACTION = '(?:\\d+[\\/⁄][1-9]\\d*|[¼½¾⅓⅔⅛⅜⅝⅞])'
const NUMBER = `(?:\\d+\\s+${FRACTION}|\\d+[¼½¾⅓⅔⅛⅜⅝⅞]|${FRACTION}|\\d+(?:[.,]\\d+)?)`
const QUANTITY_PATTERN = new RegExp(
  `^(${NUMBER}(?:\\s*[–—-]\\s*${NUMBER})?)(?=\\s|[\\p{L}]|$)`,
  'u'
)

// Match complete unit tokens only. Keep the spelling the user entered;
// localized labels and ingredient names are never rewritten in stored text.
const UNIT_PATTERN =
  /^(?:cuillères?\s+à\s+(?:soupe|café)|cucharadas?\s+soperas?|cucharaditas?\s+de\s+(?:café|té)|łyż(?:ka|ki|ek|kę)|łyżecz(?:ka|ki|ek|kę)|esslöffel|teelöffel|łyż\.|łyżecz\.|c\.?\s*à\s*[sc]\.?|tbsp|tsp|cups?|cloves?|pieces?|sprigs?|leaves|leaf|sheets?|slices?|cans?|bunch(?:es)?|pinch(?:es)?|handfuls?|cuillères?|cucharadas?|cucharaditas?|tazas?|gousses?|feuilles?|grammes?|gramos?|grams?|kilogrammes?|kilogramos?|kilograms?|millilitres?|milliliters?|mililitros?|litres?|liters?|litros?|szklank(?:a|i|ę|ek)|ząb(?:ek|ki|ków)|szt\.?|el|tl|kg|ml|cl|lb|oz|g|l|x)(?=\s|$)/iu

export const parseItemQuantity = (text: string): StructuredIngredient => {
  const trimmed = text.trim()
  const quantity = QUANTITY_PATTERN.exec(trimmed)
  if (!quantity) return { qty: '', unit: '', name: trimmed }

  const afterQuantity = trimmed.slice(quantity[0].length)
  const remainder = afterQuantity.trimStart()
  const unit = UNIT_PATTERN.exec(remainder)
  const name = unit ? remainder.slice(unit[0].length).trimStart() : remainder
  // An attached word must be a recognized unit; "2bananas" is not
  // interpreted as a quantity. A quantity also needs an ingredient name.
  if (!name || (!/^\s/.test(afterQuantity) && !unit)) {
    return { qty: '', unit: '', name: trimmed }
  }

  return { qty: quantity[1], unit: unit?.[0] ?? '', name }
}

export const parseItemText = (
  text: string
): { amount: string; name: string } => {
  const parsed = parseItemQuantity(text)

  return {
    amount: parsed.qty
      ? text.trim().slice(0, -parsed.name.length).trimEnd()
      : '',
    name: parsed.name,
  }
}
