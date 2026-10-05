import assert from 'node:assert/strict'
import test from 'node:test'
import { substituteIngredient } from '../src/utils/ingredientSubstitution.ts'

const component = () => ({
  ingredients: ['100 g peanut butter', '1 banana'],
  metric_ingredients: ['100 g peanut butter', '1 banana'],
  imperial_ingredients: ['3.5 oz peanut butter', '1 banana'],
  shopping_list_ingredients: ['100 g peanut butter', '1 banana'],
  ingredient_flags: [{ allergen: 'peanuts', substitute: '60 g tahini', substitute_applied: false, original_display: null }, null],
})

test('apply updates every variant and restore recovers the original quantities', () => {
  const original = component()
  const applied = substituteIngredient(original, original.ingredients, 0, true)
  for (const field of ['metric_ingredients', 'imperial_ingredients', 'shopping_list_ingredients']) {
    assert.deepEqual(applied[field], ['60 g tahini', '1 banana'])
  }
  assert.equal(applied.ingredient_flags[0].original_display, '100 g peanut butter')
  const restored = substituteIngredient(applied, ['60 g tahini', '1 banana'], 0, false)
  for (const field of ['metric_ingredients', 'imperial_ingredients', 'shopping_list_ingredients']) {
    assert.deepEqual(restored[field], original[field])
  }
  assert.equal(restored.ingredient_flags[0].substitute_applied, false)
  assert.equal(restored.ingredient_flags[0].original_display, null)
  assert.deepEqual(original, component())
  assert.equal(substituteIngredient(applied, ['60 g tahini', '1 banana'], 0, true), applied)
})

test('missing arrays and legacy flags fall back to complete ingredient text', () => {
  const original = component()
  original.metric_ingredients = null
  original.imperial_ingredients = []
  original.shopping_list_ingredients = null
  const applied = substituteIngredient(original, original.ingredients, 0, true)
  assert.deepEqual(applied.imperial_ingredients, ['60 g tahini', '1 banana'])
  delete applied.ingredient_flags[0].original_values
  const restored = substituteIngredient(applied, ['60 g tahini', '1 banana'], 0, false)
  assert.deepEqual(restored.metric_ingredients, ['100 g peanut butter', '1 banana'])
  assert.equal(substituteIngredient(original, original.ingredients, 1, true), original)
})
