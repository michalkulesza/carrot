# Misc
- After each successful task make a commit with a message. If not sure if feature is fully completed, ask user.

# Code conventions

## Data fetching
- Use React Query (`useQuery` / `useMutation`) for all data fetching and mutations — no raw `useState` + `useEffect` fetch patterns.

## Components
- Declare components as `const` arrow functions: `const MyComponent = () => { ... }`.
- Export pages/top-level components with `export default`.

## Translations
- Every user-visible string must go through `t()` from `useTranslation()` — never hardcode display text.
- Add keys to all 5 locale files (en, pl, de, fr, es) when introducing new strings.

# Quality checklist for new UI elements
- **Performance**: memoize expensive derived values with `useMemo`; stabilise callbacks passed to children with `useCallback`; avoid unnecessary re-renders.
- **Security**: never dangerously set innerHTML; sanitise any user-supplied content before rendering; validate inputs at the boundary.
- **Error handling**: wrap async operations in try/catch and surface errors to the user (toast or inline message); provide loading and empty states.
- **Accessibility**: every interactive element needs a descriptive `aria-label` or visible label; use semantic HTML (`button`, `nav`, `main`, etc.); ensure sufficient colour contrast (WCAG AA); support keyboard navigation.
