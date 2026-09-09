# xrm-sealed-input

Model-driven app field control for typing a sensitive number by hand: no
paste, every earlier character masked, and the value entered twice before it
is stored. Made for bank account numbers and Social Insurance Numbers.
**[How to use it](docs/usage.md)**, with screenshots. Built under the
comentality org.

## Goal

In the user's words: a PCF control for input of sensitive data. The user cannot
copy or paste. Each previously typed symbol gets masked. The user must enter the
value twice. Used for bank account numbers and SIN values.

So the control is about *entry* discipline, not storage: it makes a person type
a number, confirms they typed it the same way both times, and never shows the
whole value on screen while they do it. Protecting the column itself is
Dataverse column security's job; the manual says so.

## What is here

- `SealedInput/`: the PCF (`KK.SealedInput`, virtual, React 16 + Fluent
  9.46.2), bound to `SingleLine.Text`. Input properties: characters (digits or
  any), validation (none or Canadian SIN), maximum length, reveal time for the
  last typed character. `sealedInput.ts` holds the rules with no React or DOM
  in them; `SealedInputView.tsx` is the UI; `index.ts` wires the platform.
- `e2e/`: Playwright Test suite against the pcf-start harness hosted headlessly
  on port 8183 (`harness-server.mjs`; the sibling repo uses 8182). 24 tests
  covering masking and reveal timing, the digit filter and length cap, Ctrl+V
  and dispatched paste, drop, cut, copy and context-menu events, mismatch,
  match and store, Replace, Cancel, Clear, and the SIN checksum. `npm run docs`
  copies the screenshots into `docs/img`.
- `e2e/mock-form.mjs`: wraps the live control in a static Contact form laid
  out like a model-driven app and screenshots it (`npm run mock`). A mock-up,
  for showing the look before the control is in an environment.
- `docs/usage.md`: the manual.

Not built: a Dataverse-side run (push the control, put it on a form, drive the
real form). `xrm-plain-number/e2e/run.mjs` shows the pattern; it needs a headed
sign-in.

## Decisions (2026-09-09)

Each of these was an open question in the first README.

- **Masking.** The character just typed stays readable for `revealMs`
  (default 1000 ms), then masks. The next keystroke and leaving the field mask
  it at once. No reveal toggle: a "show" button would undo the point.
- **Second entry.** Two stacked fields, Enter and Enter again. The mismatch
  message appears live once the second entry is as long as the first and
  differs. Nothing is auto-cleared; Backspace or **Start over** fixes it.
- **Blocking input paths.** One native `beforeinput` listener per field cancels
  every edit and appends to state, so paste, drop, autofill and IME replacement
  never reach the value; only `insertText` and `deleteContentBackward` are
  acted on. `paste`, `copy`, `cut`, `drop`, `dragstart` and `contextmenu` are
  also cancelled. Fields are `type=text` with autocomplete off and the
  LastPass, 1Password and Bitwarden ignore attributes, so password managers do
  not offer to fill or save them. Caret and selection are ignored: the display
  is dots, so mid-string editing has no meaning. Append and Backspace only.
- **Bound type and validation.** `SingleLine.Text`. Digits only by default.
  Optional SIN check (nine digits, Luhn); no first-digit rule, so the published
  example 046 454 286 passes. Bank account formats vary too much to validate
  beyond a length cap.
- **When the form sees the value.** Only when both entries match and pass
  validation. Until then the column keeps its old value. A half-finished entry
  cannot block save (standard controls have no field notification API);
  documented as a limitation.
- **Stored view.** A fixed eight dots regardless of length, with Replace and
  Clear. The entry closes itself on commit rather than waiting for the host to
  push a new value: replacing a value with the identical value gives the host
  nothing to push, and the control used to stay stuck in entry mode. Clear writes `""`; returning `null`/`undefined` from `getOutputs`
  means "unchanged" and does not blank the column (verified in the harness).
- **Tooling.** Skeleton copied from `xrm-plain-number` rather than
  `pac pcf init`, which pins Fluent 9.68.0 that the environment rejects.
  Playwright Test with a `webServer` entry, so `npx playwright test` is the
  whole command.

## Gotchas met

- Fluent 9 tokens only resolve inside a `FluentProvider`. The form host supplies
  one; the harness does not, and the control rendered borderless and centred.
  The control now wraps itself in a provider using
  `context.fluentDesignLanguage.tokenTheme` with `webLightTheme` as fallback.
- The harness seeds a text-bound value with `val`, so the control opens in its
  stored view; tests blank it first.
- The harness has no disabled switch. Read-only rendering is untested.
- pcf-scripts' ESLint config has no `react-hooks` plugin, so an
  `eslint-disable react-hooks/exhaustive-deps` comment fails the build.
- Same as the sibling: no apostrophes in manifest key strings, Fluent pinned to
  9.46.2.
