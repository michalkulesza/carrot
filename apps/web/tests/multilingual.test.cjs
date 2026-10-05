const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')
const i18next = require('i18next')

const webRoot = path.resolve(__dirname, '..')
const sharedRoot = path.resolve(webRoot, '../../packages/shared/src')
const cache = new Map()

// Exercise the pure TypeScript helpers without adding a browser test runner.
const load = (filename) => {
  if (cache.has(filename)) return cache.get(filename).exports

  const module = { exports: {} }
  cache.set(filename, module)
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
  const requireSource = (name) => {
    if (name.startsWith('@carrot/shared/')) {
      return load(
        path.join(sharedRoot, `${name.slice('@carrot/shared/'.length)}.ts`)
      )
    }
    if (name.startsWith('.')) {
      return load(path.resolve(path.dirname(filename), `${name}.ts`))
    }

    return require(name)
  }
  new Function('require', 'exports', 'module', source)(
    requireSource,
    module.exports,
    module
  )

  return module.exports
}

const aisles = load(path.join(webRoot, 'src/pages/ShoppingListPage/aisles.ts'))
const imports = load(
  path.join(webRoot, 'src/components/AddRecipeModal/importSources.ts')
)
const languages = ['en', 'de', 'pl', 'fr', 'es']
const resources = Object.fromEntries(
  languages.map((language) => [
    language,
    {
      translation: JSON.parse(
        readFileSync(path.join(sharedRoot, `locales/${language}.json`), 'utf8')
      ),
    },
  ])
)

test('shopping previews preserve decimal commas, fractions, and local units', () => {
  for (const [text, amount, name] of [
    ['1,5 kg Kartoffeln', '1,5 kg', 'Kartoffeln'],
    ['1.5 kg potatoes', '1.5 kg', 'potatoes'],
    ['2 EL Olivenöl', '2 EL', 'Olivenöl'],
    ['2 łyżki oliwy', '2 łyżki', 'oliwy'],
    ['2 cuillères à soupe de sucre', '2 cuillères à soupe', 'de sucre'],
    ['2 cucharadas de aceite', '2 cucharadas', 'de aceite'],
    ['½ kg pommes', '½ kg', 'pommes'],
    ['1 1/2 cups rice', '1 1/2 cups', 'rice'],
    ['500g mince', '500g', 'mince'],
    ['fresh apples', '', 'fresh apples'],
    ['2 limes', '2', 'limes'],
    ['2bananas', '', '2bananas'],
    ['12grain bread', '', '12grain bread'],
    ['1/0 kg sugar', '', '1/0 kg sugar'],
  ]) {
    assert.deepEqual(aisles.parseItemText(text), { amount, name }, text)
  }
})

test('shopping categories handle language collisions and French ligatures', () => {
  for (const [text, language, category] of [
    ['rote Paprika', 'de', 'produce'],
    ['Paprika', 'de', 'produce'],
    ['paprika', 'en', 'pantry'],
    ['paprika', 'fr', 'pantry'],
    ['raisins', 'en', 'pantry'],
    ['prunes', 'en', 'pantry'],
    ['raisins', 'fr', 'produce'],
    ['prunes', 'fr', 'produce'],
    ['raisins secs', 'fr', 'pantry'],
    ['raisins secs congelés', 'fr', 'frozen'],
    ['œufs', 'fr', 'dairy_eggs'],
    ['bœuf', 'fr', 'meat_seafood'],
    ['sucre glace', 'fr', 'pantry'],
    ['thé glacé', 'fr', 'pantry'],
    ['crème glacée', 'fr', 'frozen'],
    ['glace', 'fr', 'frozen'],
    ['mrożone truskawki', 'pl', 'frozen'],
  ]) {
    assert.equal(
      aisles.guessCategory(text, language),
      category,
      `${language}: ${text}`
    )
  }
})

test('import previews recognize recipe cues in every supported language', () => {
  for (const [title, ingredient, step] of [
    ['Soup', 'pinch of salt', 'Step 1: Stir'],
    ['Suppe', 'Prise Salz', 'Schritt 1: Rühren'],
    ['Zupa', 'szczypta soli', 'Krok 1: Wymieszaj'],
    ['Soupe', 'pincée de sel', 'Étape 1 : Mélanger'],
    ['Sopa', 'pizca de sal', 'Paso 1: Mezclar'],
  ]) {
    const parsed = imports.parseRecipeText(`${title}\n${ingredient}\n${step}`)
    assert.equal(parsed.title, title)
    assert.equal(parsed.ingredients, 1, title)
    assert.equal(parsed.steps, 1, title)
  }
})

test('recipe and shopping amount displays translate canonical units', async () => {
  const { formatIngredientParts } = load(
    path.join(webRoot, 'src/utils/ingredientDisplay.ts')
  )
  const { parseItemQuantity } = load(
    path.join(webRoot, 'src/pages/ShoppingListPage/itemQuantity.ts')
  )
  const instance = i18next.createInstance()
  await instance.init({ lng: 'en', resources, fallbackLng: false })

  for (const language of languages) {
    await instance.changeLanguage(language)
    for (const unit of ['tsp', 'tbsp', 'oz', 'lb']) {
      const translateUnit = (value) =>
        instance.t(`units.${value.toLowerCase()}`)
      for (const parse of [undefined, parseItemQuantity]) {
        assert.deepEqual(
          formatIngredientParts(`2 ${unit} salt`, translateUnit, parse),
          { amount: `2 ${instance.t(`units.${unit}`)}`, name: 'salt' },
          `${language}: ${unit}`
        )
      }
    }
    const translateUnit = (value) => instance.t(`units.${value.toLowerCase()}`)
    assert.deepEqual(
      formatIngredientParts('1-2 tsp salt', translateUnit),
      { amount: '', name: `1-2 ${instance.t('units.tsp')} salt` },
      `${language}: quantity range`
    )
    assert.deepEqual(
      formatIngredientParts('2 TBSP salt', translateUnit, parseItemQuantity),
      { amount: `2 ${instance.t('units.tbsp')}`, name: 'salt' },
      `${language}: uppercase canonical unit`
    )
  }
})

test('counts select correct singular and Polish few/many forms', async () => {
  const instance = i18next.createInstance()
  await instance.init({ lng: 'en', resources, fallbackLng: false })
  const singularServings = {
    en: 'For 1 serving',
    de: 'Für 1 Portion',
    pl: 'Dla 1 porcji',
    fr: 'Pour 1 portion',
    es: 'Para 1 ración',
  }
  for (const language of languages) {
    await instance.changeLanguage(language)
    assert.equal(
      instance.t('recipes.ingredientsForServings', { count: 1 }),
      singularServings[language]
    )
    for (const count of [1, 2, 5]) {
      for (const key of [
        'shoppingList.aisleLeft',
        'addRecipe.charCount',
        'recipes.ingredientsForServings',
      ]) {
        assert.ok(instance.exists(key, { count }), `${language}: ${key}`)
      }
    }
  }
  await instance.changeLanguage('pl')
  assert.equal(instance.t('addRecipe.charCount', { count: 1 }), '1 znak')
  assert.equal(instance.t('addRecipe.charCount', { count: 2 }), '2 znaki')
  assert.equal(instance.t('addRecipe.charCount', { count: 5 }), '5 znaków')
  assert.match(instance.t('shoppingList.aisleLeft', { count: 2 }), /zostały 2/i)
  await instance.changeLanguage('es')
  assert.equal(instance.t('shoppingList.aisleLeft', { count: 1 }), 'queda 1')
  await instance.changeLanguage('fr')
  assert.equal(instance.t('shoppingList.aisleLeft', { count: 1 }), '1 restant')
})

test('all fixed plural keys exist in every supported language', () => {
  for (const key of [
    'shoppingList.aisleLeft',
    'addRecipe.charCount',
    'recipes.ingredientsForServings',
  ]) {
    for (const suffix of ['one', 'other']) {
      for (const language of languages) {
        const value = `${key}_${suffix}`
          .split('.')
          .reduce(
            (object, part) => object?.[part],
            resources[language].translation
          )
        assert.equal(typeof value, 'string', `${language}: ${key}_${suffix}`)
      }
    }
  }
})
