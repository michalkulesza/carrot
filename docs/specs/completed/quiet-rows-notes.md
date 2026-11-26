# Quiet rows + note that opens in place (mobile Recipe Details)

Status: completed

Design: artboard "Quiet rows + note that opens in place" in the Carrot design artifact
(`project/Mobile - Recipe Details.dc.html`). CSS px = pt.

## Goal

At the end of a recipe, empty Notes and Related recipes take as little room as possible: one calm
row each, with the add action in the section header. Tapping the note row turns it into the note
card in place, with the keyboard up and the cursor ready. The note input must never be hidden by
the keyboard.

## Notes section (`apps/mobile/src/screens/RecipeDetailScreen/NotesSection.tsx`)

- **Header:** "Notes" (existing SectionHeader, top gap 36, bottom 12) with a trailing "+ Add" text
  button (plus SF Symbol + label, 15pt semibold, `palette.actionText`, h32) shown only while the
  note is empty and closed. When the card opens it fades out and scales to 0.9 (~200ms opacity,
  ~250ms transform) and is not tappable.
- **Container:** one card, marginHorizontal 20, radius 20. Background `palette.card` (#F7F5F2)
  when the quiet row shows, warming to the note colour (#FFF7E8, existing note card tone) when the
  note is open or has text (~350ms). While editing, a 1.5pt ring in #E8CFA3 (add a token with a
  dark counterpart) fades in.
- **Quiet row** (empty and closed): pressable row, padding 14/16, gap 12. Leading 36pt tile (radius
  10, white/`popoverSurface`) with a note SF Symbol (e.g. `note.text`, `palette.actionText`); text
  column with "No notes yet" (16pt semibold, ink) and "Only your household sees them" (14pt
  `textSecondary`). Tapping it or "+ Add" opens the note.
- **Open animation:** the quiet row folds away (height to 0 over ~340ms, settle easing; its content
  fades out ~180ms and moves up 8 / scales to 0.98) while the note card unfolds in its place (height
  from 0 over ~380ms; content fades in ~250ms with an 80ms delay and rises from +10). Then the
  input is focused with the cursor at the end (focus after ~140ms so the unfold has started).
  Reverse when closing an empty note. Respect reduced motion (instant).
- **Note card content:** padding 14/16, gap 8. Header row: "Your note" (13pt semibold,
  `palette.noteText`) and a trailing "Done" (while editing) / "Edit" (while reading) text button
  (14pt bold, `palette.actionText`, h28, hitSlop to 44). Editing: multiline TextInput, 16pt /
  lineHeight ~23 (follow the existing reading-size metrics), minHeight 72, no border, transparent,
  caret/selection colour `palette.action`, placeholder "Tweaks, swaps, what the kids thought…".
  Reading (has text, not editing): the note text, tapping it opens editing.
- **Done / blur:** saves via the existing save path (trimmed; empty saves null) with the existing
  error handling. A note that is empty after trimming folds back into the quiet row. Repeat-tap
  safe (no double save).
- **Existing notes** render straight into the reading card (no quiet row).

## Related recipes section (`RelatedRecipesSection.tsx`, read mode only)

- **Header:** "Related recipes" with a trailing "+ Link" text button (same style as "+ Add"),
  replacing today's "Edit" action when the list is empty; keep the current header action
  behaviour when there are related recipes.
- **Empty:** instead of the empty horizontal list, one quiet row (marginHorizontal 20, radius 20,
  `palette.card`, padding 14/16, gap 12): 36pt white tile with a link SF Symbol (e.g. `link`), "Nothing
  linked yet" (16pt semibold) and "Sides, sauces or dessert for this dish" (14pt textSecondary).
  Tapping the row or "+ Link" opens the existing related-recipes picker.
- When recipes get linked, the row is replaced by the tiles with a fade/layout animation (reuse
  `useMotion` entering/exiting/layout), and back to the quiet row when the last link is removed.

## Keyboard

The note input must stay visible above the keyboard while typing, including as it grows with new
lines: when it focuses, scroll the read view so the input (or the caret line) sits above the
keyboard with some breathing room (~24pt), and make sure the scroll content has enough bottom room
to get there even though Notes is near the end of the page. Prefer native behaviour
(`automaticallyAdjustKeyboardInsets` on the iOS ScrollView, or keyboard-height bottom padding +
`scrollTo` using the input's measured position). Tapping outside still dismisses the keyboard;
don't let the existing `onTouchStart={Keyboard.dismiss}` on the scroll view close the keyboard when
the user is tapping inside the note input.

## Strings

All new text in en, pl, de, fr, es, it, pt; reuse existing keys where they fit
(`recipes.notes`, `recipes.yourNote`, `common.done`, `common.edit`, `recipes.notesPlaceholder`).

## Verification

`npx tsc --noEmit -p .` in apps/mobile. Manual: open/close empty note, type multi-line, Done,
clear note → folds back, existing note, keyboard never covers input (small phone too), related
empty → link → tiles → unlink all → quiet row, dark mode, reduced motion, rapid taps.
