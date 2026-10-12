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
    if (name.endsWith('.json')) {
      const json = JSON.parse(
        readFileSync(path.resolve(path.dirname(filename), name), 'utf8')
      )

      return { __esModule: true, default: json }
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
const { SUPPORTED_LOCALES, resolveSupportedLocale } = load(
  path.join(sharedRoot, 'supportedLocales.ts')
)
const languages = [...SUPPORTED_LOCALES]
const showcaseRoot = path.resolve(webRoot, '../showcase/src')
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
    ['2 cucchiai di zucchero', '2 cucchiai', 'di zucchero'],
    ['1 cucchiaino di sale', '1 cucchiaino', 'di sale'],
    ['3 tazze di latte', '3 tazze', 'di latte'],
    ['2 colheres de sopa de açúcar', '2 colheres de sopa', 'de açúcar'],
    ['1 colher de chá de sal', '1 colher de chá', 'de sal'],
    ['1 xícara de farinha', '1 xícara', 'de farinha'],
    ['2 chávenas de leite', '2 chávenas', 'de leite'],
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
    ['latte intero', 'it', 'dairy_eggs'],
    ['parmigiano reggiano', 'it', 'dairy_eggs'],
    ['petto di pollo', 'it', 'meat_seafood'],
    ['carne macinata', 'it', 'meat_seafood'],
    ['tonno in scatola', 'it', 'pantry'],
    ['pomodori pelati', 'it', 'pantry'],
    ['pomodorini', 'it', 'produce'],
    ['fagiolini', 'it', 'produce'],
    ['spinaci surgelati', 'it', 'frozen'],
    ['carta igienica', 'it', 'other'],
    ['latte di cocco', 'it', 'pantry'],
    ['melassa', 'it', 'other'],
    ['leite', 'pt', 'dairy_eggs'],
    ['presunto', 'pt', 'meat_seafood'],
    ['carne moída', 'pt', 'meat_seafood'],
    ['ananás', 'pt', 'produce'],
    ['salsa', 'pt', 'produce'],
    ['feijão verde', 'pt', 'produce'],
    ['pimenta do reino', 'pt', 'pantry'],
    ['leite condensado', 'pt', 'pantry'],
    ['molho de tomate', 'pt', 'pantry'],
    ['sorvete de chocolate', 'pt', 'frozen'],
    ['papel higiénico', 'pt', 'other'],
    ['batata frita', 'pt', 'pantry'],
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
    ['Zuppa', 'pizzico di sale', 'Passaggio 1: Mescolare'],
    ['Zuppa', 'un pizzico di sale', 'Passo 1: Mescolare'],
    ['Sopa', 'pitada de sal', 'Passo 1: Misturar'],
    ['Sopa', 'uma pitada de sal', 'Etapa 1: Misturar'],
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
    const singular = instance.t('recipes.ingredientsForServings', { count: 1 })
    // it/pt wording is owned by the translators; the other five are pinned.
    if (singularServings[language]) {
      assert.equal(singular, singularServings[language])
    } else {
      assert.match(singular, /\b1\b/, `${language}: singular servings`)
    }
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

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/
const flatten = (object, prefix = '') =>
  Object.entries(object).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? flatten(value, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  )
const pluralCategories = (language) => {
  // Categories reachable by whole recipe quantities. "many" in fr/es/it/pt only
  // applies to compact millions, so it is not required there; pl needs it.
  const rules = new Intl.PluralRules(language)
  const used = new Set(['other'])
  for (let count = 0; count <= 1000; count++) used.add(rules.select(count))

  return { used, allowed: new Set(rules.resolvedOptions().pluralCategories) }
}

// Compares base keys across languages; plural keys (key_one, key_few, ...) are
// grouped under their base key and checked against the language's plural rules.
const assertKeyParity = (label, readLocale) => {
  const describe = (language) => {
    const bases = new Set()
    const plurals = new Map()
    const keys = flatten(readLocale(language))
    for (const key of keys) {
      const match = PLURAL_SUFFIX.exec(key)
      if (match) {
        const base = key.slice(0, match.index)
        plurals.set(base, (plurals.get(base) ?? new Set()).add(match[1]))
      }
    }
    // A plural group is a key with suffix variants; the plain key doubles as
    // the "other" form (e.g. foundIngredients + foundIngredients_one).
    for (const key of keys) {
      if (!PLURAL_SUFFIX.test(key)) {
        bases.add(key)
        if (plurals.has(key)) plurals.get(key).add('other')
      }
    }
    for (const base of plurals.keys()) bases.add(base)

    return { bases, plurals }
  }
  const reference = describe('en')
  for (const language of languages) {
    const { bases, plurals } = describe(language)
    const { used, allowed } = pluralCategories(language)
    assert.deepEqual(
      [...bases].filter((key) => !reference.bases.has(key)),
      [],
      `${label} ${language}: keys not in en`
    )
    assert.deepEqual(
      [...reference.bases].filter((key) => !bases.has(key)),
      [],
      `${label} ${language}: keys missing`
    )
    // Some languages legitimately express a count with a single plain form
    // (pl "Składniki: {{count}}"), so groups are not required to match en.
    for (const [base, suffixes] of plurals) {
      for (const category of used) {
        assert.ok(suffixes.has(category), `${label} ${language}: ${base}_${category}`)
      }
      for (const suffix of suffixes) {
        assert.ok(
          allowed.has(suffix),
          `${label} ${language}: ${base}_${suffix} is not a plural form of ${language}`
        )
      }
    }
  }
}

const readJson = (filename) => JSON.parse(readFileSync(filename, 'utf8'))

test('shared locale files have identical key sets in every language', () => {
  assertKeyParity('shared', (language) =>
    readJson(path.join(sharedRoot, `locales/${language}.json`))
  )
})

test('showcase locale files have identical key sets in every language', () => {
  assertKeyParity('showcase', (language) =>
    readJson(path.join(showcaseRoot, `locales/${language}.json`))
  )
})

test('every supported language is named in every shared locale', () => {
  for (const language of languages) {
    for (const code of languages) {
      assert.equal(
        typeof resources[language].translation.languages[code],
        'string',
        `${language}: languages.${code}`
      )
    }
  }
})

test('showcase keeps its own language list in sync with the shared one', () => {
  const source = readFileSync(path.join(showcaseRoot, 'i18n.ts'), 'utf8')
  const listed = /SUPPORTED_LNGS\s*=\s*\[([^\]]*)\]/.exec(source)?.[1]
  assert.ok(listed, 'showcase SUPPORTED_LNGS')
  assert.deepEqual(
    [...listed.matchAll(/'([a-z]+)'/g)].map((match) => match[1]).sort(),
    [...languages].sort()
  )
  for (const language of languages) {
    assert.ok(
      source.includes(`from './locales/${language}.json'`),
      `showcase imports ${language}.json`
    )
  }
})

test('regional device locales resolve to a supported base locale', async () => {
  for (const [code, expected] of [
    ['pt-BR', 'pt'],
    ['pt-PT', 'pt'],
    ['pt_BR', 'pt'],
    ['it-IT', 'it'],
    ['it-CH', 'it'],
    ['de-AT', 'de'],
    ['en-US', 'en'],
    ['pt', 'pt'],
    ['tr-TR', null],
    ['', null],
    [null, null],
  ]) {
    assert.equal(resolveSupportedLocale(code), expected, String(code))
  }

  const { i18nBaseConfig } = load(path.join(sharedRoot, 'i18n.ts'))
  for (const [code, resolved] of [
    ['pt-BR', 'pt'],
    ['pt-PT', 'pt'],
    ['it-IT', 'it'],
    ['it-CH', 'it'],
    ['de-AT', 'de'],
  ]) {
    const instance = i18next.createInstance()
    await instance.init({ ...i18nBaseConfig, lng: code })
    assert.equal(instance.resolvedLanguage, resolved, code)
    assert.equal(
      instance.t('settings.language'),
      resources[resolved].translation.settings.language,
      `${code}: translations come from ${resolved}`
    )
  }
})

test('the browser language detector maps pt-BR and it-IT to pt and it', async () => {
  const detectorModule = require('i18next-browser-languagedetector')
  const LanguageDetector = detectorModule.default ?? detectorModule
  const { i18nBaseConfig } = load(path.join(sharedRoot, 'i18n.ts'))
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  try {
    for (const [browserLanguages, expected] of [
      [['pt-BR', 'pt', 'en'], 'pt'],
      [['pt-PT'], 'pt'],
      [['it-IT'], 'it'],
      [['it-CH', 'de-CH'], 'it'],
      [['tr-TR', 'fr-FR'], 'fr'],
    ]) {
      Object.defineProperty(globalThis, 'navigator', {
        value: { languages: browserLanguages, language: browserLanguages[0] },
        configurable: true,
      })
      const instance = i18next.createInstance()
      await instance
        .use(LanguageDetector)
        .init({ ...i18nBaseConfig, detection: { order: ['navigator'] } })
      assert.equal(instance.resolvedLanguage, expected, browserLanguages.join(','))
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
  }
})
