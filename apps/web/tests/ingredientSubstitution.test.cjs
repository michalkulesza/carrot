const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')

const webRoot = path.resolve(__dirname, '..')
const sharedRoot = path.resolve(webRoot, '../../packages/shared/src')
const load = (filename) => {
  // These pure helpers only need the unit vocabulary from the browser API client.
  if (filename === path.join(webRoot, 'src/api/client.ts')) {
    return load(path.join(sharedRoot, 'types.ts'))
  }
  const module = { exports: {} }
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  const requireSource = (name) => {
    if (name.startsWith('@carrot/shared/')) {
      return load(path.join(sharedRoot, `${name.slice('@carrot/shared/'.length)}.ts`))
    }
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`))
    return require(name)
  }
  new Function('require', 'exports', 'module', source)(requireSource, module.exports, module)
  return module.exports
}
const { toEditable, serializeIngredient } = load(path.join(webRoot, 'src/components/AddRecipeModal/helpers.ts'))
const { applyIngredientReplace, applyIngredientRestore } = load(path.join(webRoot, 'src/components/RecipeDetailModal/helpers.ts'))

test('auto-apply parses replacement measurements and keeps the original for restoration', () => {
  const result = {
    stage: 'transcript', metadata: {}, recipe: {
      components: [{
        ingredients: [{ qty: '100', unit: 'g', name: 'peanut butter', allergen: 'peanuts', substitute: '60 g tahini' }],
        steps: [], metric_ingredients: ['100 g peanut butter'], imperial_ingredients: ['3.5 oz peanut butter'],
      }],
    },
  }
  const component = toEditable(result, true).components[0]
  assert.deepEqual(component.ingredients[0], { qty: '60', unit: 'g', name: 'tahini' })
  const saved = { ...component, ingredients: component.ingredients.map(serializeIngredient) }
  assert.equal(saved.ingredient_flags[0].original_display, '100 g peanut butter')
  const restored = applyIngredientRestore([saved], 0, 0)[0]
  assert.deepEqual(restored.ingredients, ['100 g peanut butter'])
  assert.deepEqual(restored.imperial_ingredients, ['3.5 oz peanut butter'])
  assert.deepEqual(restored.shopping_list_ingredients, ['100 g peanut butter'])
  const replaced = applyIngredientReplace([restored], 0, 0)[0]
  for (const field of ['ingredients', 'metric_ingredients', 'imperial_ingredients', 'shopping_list_ingredients']) {
    assert.deepEqual(replaced[field], ['60 g tahini'])
  }
  assert.equal(toEditable(result, false).components[0].ingredient_flags[0].substitute_applied, false)
})
