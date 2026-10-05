# Multilingual review fixes

## Scope

Resolve the multilingual issues found in the staged shopping-list redesign and
the six unpushed commits, preserving the existing work and index.

## Plan

1. Restore localized units in recipe and shopping ingredient displays. Recognize
   decimal commas, fractions, and supported local unit names in shopping previews.
2. Resolve category keyword collisions (German peppers, English dried fruit),
   French ligatures, and phrase precedence. Recognize recipe step headings and
   ingredient cues in English, German, Polish, French, and Spanish.
3. Add correct plural forms for remaining-item counts, character counts, and
   serving labels in all five locales. Replace the existing English drag label.
4. Run regression checks for the reported examples, translation-key parity,
   formatting, lint, TypeScript, and the production web build.

## Acceptance criteria

- Canonical teaspoon/tablespoon/ounce/pound units use the selected UI language.
- `1,5 kg Kartoffeln` and `2 EL Olivenöl` produce complete amount previews.
- German `rote Paprika` is Produce; English raisins/prunes are Pantry.
- French `œufs` is Dairy and eggs; `bœuf` is Meat and seafood.
- French `raisins secs`, `sucre glace`, and `thé glacé` are Pantry.
- Import previews recognize Step/Schritt/Krok/Étape/Paso headings and localized
  ingredient cues regardless of the selected UI language.
- Counts use correct singular and plural forms, including Polish few/many.
- Existing staged work is preserved; no commit or remote write is performed.

## Status

Complete. Three agents implemented quantity/unit formatting, category/import
detection, and plural translations with separate file ownership.

## Verification

- `pnpm --filter web test:i18n`: all six regression groups pass, covering the
  reported examples, all five locales, range fallback, and invalid quantities.
- `pnpm --filter web build`: TypeScript and production build pass.
- Focused ESLint: no errors; existing Fast Refresh warning in ShoppingItemPreview.
- Formatting and diff whitespace checks pass.
- Full-project lint reports existing errors in unrelated files; these fixes do
  not introduce additional lint errors.
- Original staging was preserved during implementation.
