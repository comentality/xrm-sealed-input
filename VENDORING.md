# Vendoring Sealed Input into your own solution

The control is five files, all in `SealedInput/SealedInput`:

| File | What it holds |
| --- | --- |
| `ControlManifest.Input.xml` | the control, its bound column and its six input properties |
| `index.ts` | the platform wiring: reads the properties, hands outputs back |
| `sealedInput.ts` | the entry rules — masking, the digit filter, the SIN checksum, the layout and label decisions. No React, no DOM |
| `SealedInputView.tsx` | the two fields, the Fluent styling, the input-blocking listeners |
| `formLabel.ts` | reads the form's own cell label out of the DOM so the fields line up with the stock ones |

Nothing in them imports outside that folder. Everything else in the project
directory — `tsconfig.json`, `eslint.config.mjs`, `pcfconfig.json`,
`.gitignore`, `SealedInput.pcfproj`, `package.json` — is byte-for-byte what
`pac pcf init` generates, apart from the Fluent pin noted below. The code is
public domain (CC0), so there is nothing to attribute and no licence file to
carry.

## Fetch just the files

With Node installed, from the folder that holds your PCF projects:

```
npx degit comentality/xrm-sealed-input/SealedInput/SealedInput   SealedInput/SealedInput
```

Or download `xrm-sealed-input-<version>-source.zip` from a release; it holds
the same files.

## Make them build

1. Generate the project around the files. Use the same namespace and name,
   otherwise the generated types will not match:

   ```
   pac pcf init --namespace KK --name SealedInput --template field --framework react --outputDirectory SealedInput
   ```

2. Copy the five vendored files over the generated `ControlManifest.Input.xml`
   and `index.ts`, and delete the generated `HelloWorld.tsx`.
3. In `SealedInput/package.json`, pin `@fluentui/react-components` to `9.46.2`.
   The template pins a newer version that Dataverse rejects on import.
4. `npm install` and `npm run build`.
5. Add the project to your solution:

   ```
   pac solution add-reference --path ../SealedInput
   ```

These five steps were run end to end for 0.4.0, from a clean `pac pcf init` to a
successful `npm run build`. The generated `tsconfig.json`,
`eslint.config.mjs`, `pcfconfig.json` and `SealedInput.pcfproj` came out
identical to this repo's, and the Fluent pin was the only edit needed.

## Renaming

Want your own namespace or display name? Change `namespace` and
`display-name-key` on the `<control>` element in the manifest, and pass the
same namespace to `pac pcf init`. Nothing else references them. The registered
name in Dataverse becomes `<your prefix>_<namespace>.SealedInput`.

## Bump the version on every push

`version` on the `<control>` element must go up before each
`pac pcf push` or solution import, or the platform serves the old bundle and
every instance of the control on the form reports "Error loading control".
Clearing the app's client cache is the other half of that fix.

## Changing the rules

`sealedInput.ts` is where to look first. It is a pure module: given the typed
characters and the properties it returns what to display, whether the two
entries match, and whether the value passes validation. Swapping the Canadian
SIN check for another country's, widening the character filter, or changing
how long a character stays readable are all edits to that file alone. The e2e
suite in this repo exercises those rules through the real control, so if you
vendor the tests too you will know when an edit breaks one.

## What you get

A field control for `SingleLine.Text` columns: always two fields, no paste, no
drop, no autofill, every typed character masked after a moment, and the column
written only once both entries agree. See `docs/usage.md` for the maker-side
steps and the full list of interaction rules.
