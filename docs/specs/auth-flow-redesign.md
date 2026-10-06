# Auth flow redesign (web)

Source: claude.ai/design project `33a73ec1-15e7-4f03-99ad-f2937f852f31`,
file `Auth Flow.dc.html` (screens A1–A4 plus M1).

## Scope

Restyle the four existing web auth routes. Backend calls, routing, and the
repeated-submit guards stay the same.

| Screen | Route | Design |
| --- | --- | --- |
| A1 Sign in | `/login` | "Welcome back" card, email + password, Google, "Create one" |
| A2 Create account | `/register` | Step 1 of 3. Green check and border once the email looks valid. Continue is muted until then |
| A3 Check your email | `/verify` | Step 2 of 3. Six OTP boxes that auto-advance, go back on Backspace, move with the arrow keys and accept a pasted code. Resend unlocks after a countdown that starts on arrival. "Change" returns to `/register` |
| A4 Set up your account | `/complete-profile` | Step 3 of 3. Optional nickname with a "Shown as" preview, password with a Show/Hide toggle and a 4-segment strength meter. Create stays muted until the password has 8 characters |

## Layout

- **Desktop (`lg+`):** dotted canvas with the 400px card shifted 150px left of
  centre. Seven feature cards (household, allergens, linked recipes, scaling,
  units, timers, meal plan) orbit the right side. The orbit auto-advances
  every 3 s, pauses while the pointer is over the canvas, and adds pointer
  parallax. A caption at the bottom left shows the number, title, description
  and clickable dots for the front card.
- **Mobile:** no animation. A full-screen white form with the brand header at
  the top and large touch targets (M1).
- `prefers-reduced-motion`: the orbit stays still, with no auto-advance,
  parallax or live demo values. Dots still switch the front card.

## Decisions

- The "Continue as …" row in the design is Google's personalised GIS button,
  so the existing `GoogleSignInButton` is reused.
- "Forgot?" is left out because there is no password-reset flow yet.
- The design's recipe photos (`assets/pesto.png`, `assets/blondie.png`) could
  not be imported because the design API caps files at 256 KB, so the cards
  use tinted tiles instead.
- The design palette is added as theme tokens in `index.css` (`ink-*`,
  `line`, `canvas`, `carrot-*`, `mint-*`). Feature-card accents use Tailwind
  palette colours.
- Dark mode is not handled, matching the rest of the web app.

## Implementation contract

Design source, extracted locally:
`C:\Users\kules\.claude\jobs\4a766699\tmp\auth.html`. Screen A1 starts at line
24, A2 at 320, A3 at 625 (card at 839), A4 at 922 (card at 1136), M1 at 1216,
and the design logic at 1295. Feature-card markup is at lines 31–237.

Theme tokens already exist in `apps/web/src/index.css`: `ink`, `ink-soft`,
`ink-muted`, `ink-subtle`, `ink-faint`, `line`, `line-strong`, `mist`,
`mist-soft`, `canvas`, `carrot`, `carrot-hover`, `carrot-strong`,
`carrot-muted`, `carrot-tint`, `carrot-wash`, `mint`, `mint-ink`,
`mint-border`, `mint-wash`, and the font token `font-nunito`.

### Files and owners

- **Layout + orbit:** `components/Auth/AuthLayout/`, `components/Auth/FeatureOrbit/**`
- **Forms + pages:** `components/Auth/{AuthHeading,SignupProgress,AuthTextField,AuthSubmitButton,OrDivider,AuthSwitchPrompt,AuthError,GoogleSection,OtpInput,PasswordStrength}/` and the four `pages/*Page.tsx` files
- **Locales:** `packages/shared/src/locales/{en,pl,de,fr,es}.json`

### `AuthLayout` API

```tsx
// components/Auth/AuthLayout/index.tsx (default export)
interface AuthLayoutProps { children: ReactNode }
```

`AuthLayout` renders `<main>` with the LanguageSwitcher, the brand header
(`/favicon.svg` plus "Carrot"), the responsive shell and the 400px card
surface. On desktop the orbit and caption sit behind and beside it. Pages pass
only the card contents: progress, heading, form and links. The card applies
`flex flex-col gap-[18px]`.

### Translation keys (all under `auth.`; existing keys are kept)

```
welcomeBack, stepOf ("Step {{current}} of {{total}}"), emailLooksValid,
sendingCode, codeSentTo ("Enter the 6-digit code sent to"), changeEmail ("Change"),
checkSpam ("Can't find it? Check spam."), codeDigit ("Digit {{index}} of {{total}}"),
optional, nicknamePlaceholder ("e.g. Batman"),
shownAs ("Shown as <bold>{{name}}</bold> on shared recipes"  — used with <Trans>),
passwordPlaceholder ("At least 8 characters"), showPassword ("Show"), hidePassword ("Hide"),
passwordStrength.{empty,tooShort,okay,good,strong}
  ("Use 8 or more characters" / "Too short" / "Okay — add numbers or symbols" / "Good" / "Strong password"),
termsNotice ("By creating an account you agree to the Terms and Privacy Policy."),
features.dotLabel ("Show feature {{index}}"),
features.household.{label,title,description,kitchenName,members},
features.allergens.{label,title,description,recipe,dairy,nuts,glutenFree,ingredient,flags},
features.linkedRecipes.{label,title,description,recipe,uses,component},
features.scaling.{label,title,description,serves,chicken,rice,garlic},
features.units.{label,title,description,metric,us,chicken,broth,oil},
features.timers.{label,title,description,step},
features.mealPlan.{label,title,description,weekdayInitials ("MTWTFSS", 7 chars),summary,listReady}
```

Feature labels are stored in normal case and uppercased with CSS.

## Tasks

- [x] Theme tokens
- [x] Shared auth UI under `components/Auth/`
- [x] Feature orbit + caption + demo cards
- [x] Restyle the four pages
- [x] Translations (en, pl, de, fr, es)
- [x] Browser check on desktop: login orbit and caption, register email validation
- [ ] End-to-end check of verify and complete-profile against a running API, plus a real mobile viewport
