import * as Crypto from 'expo-crypto'
import type { ShoppingCategory, ShoppingListItemInput } from '@carrot/shared/types'

export const createUuid = (): string => Crypto.randomUUID()

export const createShoppingListItemInput = (
  text: string,
  category: ShoppingCategory,
): ShoppingListItemInput => ({ id: createUuid(), text, category })
