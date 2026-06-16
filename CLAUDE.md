# Misc
- After each successful task make a commit with a message. If not sure if feature is fully completed, ask user.
- When implementing a plan from .md include that file in the commit

# Code conventions

## Data fetching
- Use React Query (`useQuery` / `useMutation`) for all data fetching and mutations — no raw `useState` + `useEffect` fetch patterns.

## Components
- Declare components as `const` arrow functions: `const MyComponent = () => { ... }`.
- Export pages/top-level components with `export default`.

## Translations
- Every user-visible string must go through `t()` from `useTranslation()` — never hardcode display text.
- Add keys to all 5 locale files (en, pl, de, fr, es) when introducing new strings.

# Mobile (iOS) UI conventions
These apply to all code in `apps/mobile/`.

## Core principle
Let iOS draw the UI — every custom-styled JS component will look "off" compared to native. Prefer native primitives over custom styling.

## Colors
- Always use `PlatformColor` for colors so dark mode is automatic — never hardcode hex/rgb values for UI colors.
- Use iOS semantic colors: `'systemBackground'`, `'secondarySystemBackground'`, `'label'`, `'secondaryLabel'`, `'systemBlue'`, `'systemGray'`, `'systemGray6'`, `'separator'`, etc.
- Example: `color: PlatformColor('label')`, `backgroundColor: PlatformColor('systemBackground')`

## Typography

Use only sizes from the iOS HIG type scale. Never invent intermediate sizes (e.g. 14pt does not exist in the scale).

| Role | fontSize | lineHeight | fontWeight |
|------|----------|------------|------------|
| Large Title | 34 | 41 | `'700'` |
| Title 1 | 28 | 34 | `'700'` |
| Title 2 | 22 | 28 | `'700'` |
| Title 3 | 20 | 25 | `'600'` |
| Headline | 17 | 22 | `'600'` |
| Body (primary reading text: notes, ingredients, steps) | 17 | 22 | `'400'` |
| Callout (UI labels, list items, button text, inputs) | 16 | 21 | `'400'` |
| Footnote / meta info | 13 | 18 | `'400'` |
| Caption 1 (tags, chips, badges) | 12 | 16 | `'400'` |
| Caption 2 (minimum — tiny labels only) | 11 | 13 | `'400'` |

Rules:
- Default for most UI text (labels, list items, button text, inputs): **16pt Callout**.
- Primary reading content (recipe notes, ingredients, step text): **17pt Body** with `lineHeight: 22`.
- Section headers / uppercase meta labels: **13pt Footnote** with `textTransform: 'uppercase'` and `letterSpacing`.
- Never go below 11pt except for purely decorative/icon characters.
- Prefer system font weights: `'400'` (regular), `'600'` (semibold), `'700'` (bold).
- `allowFontScaling` defaults to `true` in React Native — do not disable it.

## Layout & spacing
- Use multiples of 4pt for spacing (4, 8, 12, 16, 20, 24, 32).
- Respect safe areas with `useSafeAreaInsets()` — never hard-code top/bottom padding.
- Use `<KeyboardAvoidingView behavior="padding">` on iOS for forms.

## Navigation
- Always use `@react-navigation/native-stack` (not `stack`) — it uses real native iOS navigation with swipe-back gesture.
- Use native header options: `headerLargeTitle`, `headerTransparent`, `headerBlurEffect`.
- Prefer `Alert.alert()` over custom modals for destructive confirmations.
- Use `ActionSheetIOS.showActionSheetWithOptions` for action sheets on iOS.

## Interactive elements
- Use `<Pressable>` with `hitSlop` for touch targets (minimum 44×44pt per HIG).
- Add haptic feedback on meaningful interactions: `import * as Haptics from 'expo-haptics'` — use `impactAsync(ImpactFeedbackStyle.Light)` for taps, `notificationAsync` for success/error.
- Use `<Switch>` (not custom toggles), `<ActivityIndicator>` (not custom spinners).

## Lists
- Use `<FlatList>` or `<SectionList>` — never `ScrollView` + `map()` for long lists.
- Use `ItemSeparatorComponent` with a 1px separator in `PlatformColor('separator')`.

## Forms / inputs
- Set correct `keyboardType`, `returnKeyType`, `autoCapitalize`, `autoCorrect`, `textContentType` on every `<TextInput>` for iOS autofill and keyboard optimisation.

## No-nos
- No custom shadows with JS — use `shadowColor/shadowOffset/shadowOpacity/shadowRadius` matching iOS native card style (subtle, 1-2pt).
- No web-style absolute positioning hacks.
- No `TouchableOpacity` — use `Pressable` instead.
- No hardcoded colors or font sizes.

# Quality checklist for new UI elements
- **Performance**: memoize expensive derived values with `useMemo`; stabilise callbacks passed to children with `useCallback`; avoid unnecessary re-renders.
- **Security**: never dangerously set innerHTML; sanitise any user-supplied content before rendering; validate inputs at the boundary.
- **Error handling**: wrap async operations in try/catch and surface errors to the user (toast or inline message); provide loading and empty states.
- **Accessibility**: every interactive element needs a descriptive `aria-label` or visible label; use semantic HTML (`button`, `nav`, `main`, etc.); ensure sufficient colour contrast (WCAG AA); support keyboard navigation.
