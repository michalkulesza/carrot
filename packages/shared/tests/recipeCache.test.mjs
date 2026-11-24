import assert from 'node:assert/strict'
import test from 'node:test'
import { mealPlanDataReferencesRecipe, removeRecipeById, upsertRecipe } from '../src/utils/recipeCache.ts'

const recipe = (id, title = id) => ({ id, title })

test('upsertRecipe replaces an existing recipe in place', () => {
  const result = upsertRecipe([recipe('a'), recipe('b')], recipe('b', 'new'))
  assert.deepEqual(result.map((r) => r.title), ['a', 'new'])
})

test('upsertRecipe inserts a missing recipe at the front', () => {
  const result = upsertRecipe([recipe('a')], recipe('c'))
  assert.deepEqual(result.map((r) => r.id), ['c', 'a'])
})

test('upsertRecipe handles an empty cache', () => {
  assert.deepEqual(upsertRecipe(undefined, recipe('a')).map((r) => r.id), ['a'])
})

test('removeRecipeById drops the recipe and tolerates an empty cache', () => {
  assert.deepEqual(removeRecipeById([recipe('a'), recipe('b')], 'a').map((r) => r.id), ['b'])
  assert.deepEqual(removeRecipeById(undefined, 'a'), [])
})

test('mealPlanDataReferencesRecipe checks arrays, single entries and nulls', () => {
  const ids = new Set(['r1'])
  assert.equal(mealPlanDataReferencesRecipe([{ recipe: recipe('r1') }], ids), true)
  assert.equal(mealPlanDataReferencesRecipe({ recipe: recipe('r1') }, ids), true)
  assert.equal(mealPlanDataReferencesRecipe([{ recipe: recipe('r2') }, { recipe: null }], ids), false)
  assert.equal(mealPlanDataReferencesRecipe(null, ids), false)
})
