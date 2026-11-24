# Recipe app — Design spec

Source of truth: `Mobile Screens.dc.html`. Other canvases hold explorations and history.

## Principles
- **Warm and calm.** Warm neutrals instead of cool iOS greys. Orange only for actions and highlights.
- **One screen, two states.** Edit is Recipe Details made editable. The layout, type, colours and components stay the same. Edit only adds fields, remove (×) buttons and "+ Add" rows.
- **Content first.** Quantities sit in their own column, step titles come before the step text, and side remarks go on a quiet grey line.
- **Native chrome stays native.** The status bar, bottom tab bar, search bar and "Home" title are system UI, so we don't restyle them.

## Colour
| Role | Hex |
|---|---|
| Ink (primary text) | `#1C1C1E` |
| Secondary text | `#6B625B` |
| Tertiary text / meta | `#7D746D` |
| Placeholder / disabled | `#A39A92` |
| Body text on cards | `#3A332E` |
| Page background | `#FFFFFF` |
| Card background | `#F7F5F2` |
| Control background (buttons, segmented, stepper) | `#EFEBE6` |
| Divider inside cards | `#E6DFD6` |
| Divider / track | `#E8E2DB` |
| Strong divider / unchecked ring | `#D6CEC5` / `#CFC7BE` |
| **Action orange** (primary buttons, checks, progress) | `#CF6528` |
| Orange text (links, labels on tint) | `#A9521D` |
| Orange tint (tags, chips, link chips) | `#FCEBDD` |
| Dark orange text on tint | `#7E3C14` |
| Note card | `#FFF7E8`, label `#7A4E00` |
| Allergen badge | `#FFF2D1`, text `#7A4E00` |
| Error | `#B3261E` on `#FBE4E1` |
| Success | `#1F7A3A` on `#E3F5E7`, done check `#34A853` |
| Household avatar | `#E0439A` |

Dark cook mode (if used): bg `#14110E`, surface `#26211C`, text `#F3EEE6`, accent `#E8894A`.

## Typography
System font stack (`-apple-system, SF Pro Text`). No custom fonts in the app.

| Style | Size / weight | Use |
|---|---|---|
| Screen title | 22 / 700, −0.01em | "Home", "Browse" in the top bar |
| Recipe title | 28 / 700, −0.02em, lh 1.12 | Recipe Details hero |
| Section heading | 22 / 700, −0.01em | Ingredients, Steps, Notes, Related recipes |
| Group / step title | 18 / 700, −0.01em | Ingredient group, step title |
| Body large | 17 / 400–600, lh 1.35–1.5 | Ingredient rows, step text |
| Body | 16 | Rows, inputs, notes |
| Meta | 14–15 | Counts, secondary lines |
| Caption / label | 13 / 600, uppercase +0.04em | Small section labels ("From the recipe", "Sort by") |
| Kicker | 13 / 700, +0.06–0.1em, orange | "TONIGHT · DINNER", "STEP 2" |
| Cook-mode step | title 32 / 700, body 23 / 400 | Readable at arm's length |

Use tabular numerals for quantities, timers and counts.

## Spacing & shape
- Side margin **20px** everywhere.
- Spacing scale: 4 / 8 / 12 / 16 / 20 / 32. Sections are separated by 28–36px.
- Corner radii:
  - **20px:** cards, ingredient group cards, photo tiles
  - **14px:** buttons, chips, segmented control, timers, inputs on sheets
  - **10px:** inputs, small thumbnails
  - **28px:** top of sheets
  - **fully round:** icon buttons and avatars only
- Minimum tap target 44px. Cook-mode buttons are 60px.

## Components

**Top bar (Home / Browse):** status bar, then avatar (LI) with a caret (household switcher), the screen title, then right-side actions: orange + (add, a native prominent tinted Liquid Glass bar button that opens the custom Add recipe popover) and the sort button (40px `#EFEBE6` circle).

**Hero (Recipe Details / Edit):** a 296px photo with glass buttons floating over it: back (44px round) and an action pill (cart, calendar, share, edit). Glass = `rgba(255,255,255,0.78)` + `blur(12px)` + soft shadow. In edit, the buttons are replaced by Cancel (glass), a status pill and Save (orange).

**Tags:** pills on `#FCEBDD` with `#A9521D` text, 14px radius, 14/500. The "+ Tag" pill sits on `#EFEBE6`. Edit adds a × inside each pill.

**Macro strip:** one `#F7F5F2` card with 5 columns (Time, Kcal, Protein, Fat, Carbs), value 17/600 over label 13, separated by hairline dividers.

**Serves stepper:** `#EFEBE6` box 54px tall; − / + are 42px white squares with 10px radius. Paired with the orange **Cook** button.

**Ingredient group card:**
- A `#F7F5F2` card with a group title (18/700) and an item count, followed by a 1px divider.
- Each row is a grid: quantity column **78px** (17/600) + name (17). Optional grey note line (14). Optional allergen badge.
- **Link chip** under the name, on `#FCEBDD`, 30px tall:
  - linked recipe: thumbnail + name + ›
  - web page: link icon + site + ↗

**Step timeline:** a 34px dark number circle with a 2px `#E8E2DB` line down to the next step. Title 18/700, text 17 on plain white (no card). Timer chips sit on `#FCEBDD`, turn solid orange while running and green when done. Tapping the number marks the step done (green check, step collapses).

**Notes:** a "Your note" card on `#FFF7E8`; "From the recipe" notes below, with small numbered orange badges.

**Related recipes:** a horizontal row of 140px square photo tiles with a 2-line title and time. Edit adds a × on each tile and a dashed "Link recipe" tile.

**Recipe rows (Browse list):** 88px thumbnail, title (17/600, 2 lines), meta "25 min · 600 kcal", up to 2 tags plus "+N", and a star (orange when favourited).

**Recipe tiles (grid / carousels):** square photo with 20px radius, title 15/600, meta 13. Home carousels use 148px tiles.

**Filter pills (Browse):** glass pills (`rgba(255,255,255,0.82)` + blur + shadow) floating and pinned above the content. An active pill turns solid orange and shows its value with ✕. The ★ pill filters favourites.

**Segmented control:** track `#EFEBE6` with 14px radius and 3px padding. The active segment is white, 11px radius, with a soft shadow.

**Buttons:**
- Primary: `#CF6528`, white 15–17/600, 14px radius, 44–54px tall
- Secondary: `#EFEBE6` with ink text
- Destructive: `#FBE4E1` with `#B3261E` text
- Text button: `#A9521D` 15/600

**Checkboxes:** a 26px circle, ring `#CFC7BE` 1.5px. Checked: filled `#CF6528` with a white tick. Checked rows drop to 45% opacity with strike-through.

**Sheets / drawers:**
- White sheet with a 28px top radius and a 40×5 grabber; the page behind is dimmed (`rgba(20,15,10,0.32–0.42)`).
- Header is a 3-column grid: count (left), title 17/700 (centre), Done (orange text, right).
- A search field (44px, `#EFEBE6`, 14px radius) is always at the top, followed by a scrolling row of selected chips and a grouped list with checkbox rows.
- Typing a new tag shows a "Create tag" row.
- Used for the tags drawer, related recipes drawer, ingredient/step edit and sort.

**Menus (add / sort):** a white popover with 20px radius and shadow `0 16px 40px -8px rgba(40,30,20,.3)`. Rows have 14px radius; add-menu rows include a 36px tinted icon tile. The add menu is a custom popover (`HomeScreen/AddMenuPopover`, user decision, replaces the native menu). Its clipboard row is detected with `Clipboard.hasUrlAsync()` and the clipboard is read only when Import is tapped. iOS has no permanent clipboard permission; users can set Settings > Carrot > Paste from Other Apps > Allow.

**Empty / attention states:**
- Empty: a warm card with an icon tile, kicker, title, and primary + secondary actions (e.g. "Nothing planned yet").
- Attention: an import that needs input shows a 28px round `!` badge instead of a button — `#B3261E` for errors, `#A9521D` for duplicates, white glyph. Tapping the row opens its options (Retry, Import anyway, Go to recipe…).

## Screens (Mobile Screens)

**Home**
- Tonight card: photo with an Open button, or the empty "nothing planned" card.
- Imports: a summary row that expands to show each import; ones needing input carry the `!` badge.
- Jump back in: an unfinished cook-mode session (Resume) or the last-viewed recipe (Open).
- Recently added and Favourites carousels.

**Browse:** list and grid versions, both with glass filter pills, a sort button and the + button.

**Recipe Details:** hero, title, tags, macro strip, serves + Cook, ingredient groups, step timeline, notes, related recipes.

**Recipe Edit:** the same screen in its edit state, plus the Tags drawer and Related recipes drawer.

**Cook Mode**
- Two tabs (Steps / Ingredients); swipe left and right to switch between them.
- An orange Next-step button.
- The ingredient checklist scrolls to "Step N — you're about here".

## Copy
- Sentence case and short labels: "Plan tonight", "Jump back in", "Nothing planned yet".
- Use "household" for the shared space. Counts read as "2 linked", "11/11" or "3 of 4".
