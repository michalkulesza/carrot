# Recipes table, tag bar & next-meal sidebar redesign (web)

Status legend: ☐ todo · ◐ in progress · ☑ done

## Context
Implements claude.ai design `Recipes Table Final.dc.html` (project 33a73ec1-15e7-4f03-99ad-f2937f852f31)
for the desktop web Recipes page: a photo-led "Next planned meal" card in the sidebar, a two-row
filter/tag bar, and a restyled recipes table with macro bars. Mobile keeps its current card list
and a compact filter row.

## Decisions
| Topic | Decision |
| --- | --- |
| Scope | Sidebar next-meal card, FilterBar, RecipesTable only. Page shell / header untouched. |
| Next meal meta | `"<Today/Tomorrow/date> · <total time>"`; time omitted when `total_time_minutes` is null. |
| Macro bars | Width = value / max of that macro across the currently displayed rows. |
| Tags row | Wraps on desktop (`md:`), keeps HorizontalScrollStrip on mobile. |
| Count + Clear all | Desktop only; "Clear all" shown only when any filter is active. |
| Mobile filter chips | Show category name when empty, value when selected (current behaviour); `Label Any` style on `md:`. |

## Design tokens (add to `@theme` in `apps/web/src/index.css`)
```
--color-protein: #7c6ae0;  --color-protein-ink: #5b4bc4;  --color-protein-track: #eeebfa;
--color-fat: #f0a43a;      --color-fat-ink: #b87516;      --color-fat-track: #fcf0dc;
--color-carbs: #e8894a;    --color-carbs-ink: #c4652a;    --color-carbs-track: #fbe9dc;
--color-row-hover: #fbfafd; --color-toolbar: #f8f7fa; --color-ink-ghost: #c9c6d2;
```
Existing tokens to reuse: `ink`, `ink-soft`, `ink-muted`, `ink-subtle`, `ink-faint`, `line`, `mist`,
`carrot`, `carrot-strong`, `font-nunito`.

## File ownership (parallel agents)
| Agent | Files | 
| --- | --- |
| A – next meal | `components/NextMealCard.tsx`, `components/NextMealCardSkeleton.tsx`, new `utils/formatCookingTime.ts` (moved from `RecipeDetailModal/helpers.ts`), `RecipeDetailModal/helpers.ts`, `RecipeDetailModal/RecipeMetaBar.tsx` |
| B – filter bar | `pages/RecipesPage/FilterBar/**`, `pages/RecipesPage/index.tsx`, `packages/shared/src/locales/*.json` |
| C – table | `components/RecipesTable/**`, `index.css` |

## New i18n keys (agent B, all 5 locales)
`recipes.filterAny` "Any" · `recipes.shownOfTotal` "{{shown}} of {{total}} recipes" · `recipes.clearAll` "Clear all".
Reuse `recipes.filterFavourites`, `tags.tags`, `tags.category.*`.

## Tasks
- ☑ A: Next-meal card — label (11px extrabold tracking-[.08em] ink-muted uppercase), 132px cover image rounded-xl, title 15px extrabold, meta 12px semibold ink-muted; card `bg-white border-line rounded-2xl p-3 gap-2.5`. Restyle empty/error/compact states to match; skeleton mirrors loaded layout.
- ☑ B: FilterBar — row 1 on `bg-toolbar px-[22px] py-3`: Favourites chip, 5 category chips (`Label Value ▾`, rounded-[10px], white, border-line; active border-carrot + value carrot-ink), spacer, count, Clear all. Row 2: `TAGS` label + pill tags (rounded-full white border-line; active bg-ink text-white), border-b.
- ☑ C: Table — flush in content area (no card wrapper), columns per design, header 12px extrabold tracking-[.06em] ink-subtle with macro headers coloured, rows 15px with hover `bg-row-hover`, 56px thumbs, title extrabold, macro cells value + 6px bar.
- ◐ Verify: `tsc`, eslint, build and i18n tests pass; visual check in browser pending.
