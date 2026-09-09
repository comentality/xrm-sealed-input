# Sealed Input: how to use it

A field control for model-driven apps that makes a person type a sensitive
number by hand, twice. Nothing can be pasted or dropped into it, every
character turns into a dot as soon as the next one is typed, and the column
only changes once both entries agree. Made for bank account numbers and Social
Insurance Numbers.

## On a form

A Contact form in a model-driven app. The wide column has the control on SIN
and on bank account, and once more with the cell label hidden; the narrow
column shows the SIN column again. The form draws the column label itself, so
the control only labels its second field, "Re-enter", and puts that label
where the section puts labels: beside the field in the wide column, whose
section has labels on the left, and above it in the narrow column, whose
section has labels on top. Where the cell label is hidden, nothing else names
the column, so both fields are labelled. The control measures the cell it is
given: from 480 pixels up the two fields share one line; below that they stack.

![Contact form: SIN empty in a wide and a narrow column, bank account stored](img/form-real-empty.png)

Typing the SIN in the wide column. The bank account, already stored, shows a
fixed row of dots in both of its fields.

![SIN being typed on the form, side by side](img/form-real-typing.png)

After the second entry matched. Every field shows dots only, and the form is
marked unsaved until the record is saved.

![All fields stored on the form](img/form-real-stored.png)

These are real screenshots taken by `e2e/run.mjs` in a test environment: it
builds the fixture form, types the SIN twice, saves with Ctrl+S and reads the
column back through the Web API to confirm it holds exactly what was typed.
`npm run mock` produces a similar picture without an environment.

## What the user sees

Always two fields. An empty column shows them empty, with a hint.

![empty: SIN and Re-enter SIN fields](img/entry-empty.png)

While typing, the character just typed stays readable for a second, then
becomes a dot. Everything before it is already a dot. Leaving the field
masks the last character at once.

| Typing `1234` | After a moment, or on leaving the field |
|---|---|
| ![three dots and a 4](img/entry-typing.png) | ![all dots](img/entry-masked.png) |

In a wide cell the two fields share one line. The layout follows the width of
the cell, so the same control stacks on a phone or in a narrow section.

| Narrow cell | Wide cell |
|---|---|
| ![stacked](img/layout-narrow.png) | ![side by side](img/layout-wide.png) |

Enter, or Tab, moves to the second field. When the second entry is as long as
the first and differs, the control says so under the second field. Nothing is
stored. Backspace and retype, or **Start over** to clear both fields.

![Does not match the first entry](img/entry-mismatch.png)

![side by side mismatch](img/layout-wide-mismatch.png)

The moment both entries agree the value is written to the column and both
fields switch to a fixed row of eight dots, whatever the length of the value,
so a stored value gives nothing away. Save the record as usual.

![eight dots in both fields and a saved note](img/stored-saved.png)

Opening a record that already has a value shows the same two rows of dots. The
value itself is never rendered. To **replace** it, click into either field and
type: both fields clear and a fresh entry begins. To **clear** it, click into a
field and press Backspace: the column is emptied at once. **Start over** during
a replacement goes back to the stored dots without changing anything.

| Existing value | After the first keystroke |
|---|---|
| ![two rows of dots](img/stored.png) | ![fresh entry begun](img/entry-replacing.png) |

With SIN validation on, a nine-digit entry that fails the checksum is flagged
under the first field, before the person types it a second time.

![Not a valid SIN. Check the nine digits.](img/entry-sin-invalid.png)

When the form is read-only both fields are disabled and show eight dots, or
nothing when the column is empty.

Inside a form cell the labels follow the form. With the cell label shown on
the left, only "Re-enter" appears, beside the second field; with the cell
label on top, "Re-enter SIN" appears above the second field; with the cell
label hidden, both fields are labelled, placed like the neighbouring cells.

| Cell label on the left | Cell label on top | Cell label hidden |
|---|---|---|
| ![Re-enter beside the second field](img/labels-form-left.png) | ![Re-enter SIN above the second field](img/labels-form-top.png) | ![both labels beside the fields](img/labels-form-hidden.png) |

## Configuration

Set these in the form designer when adding the control to the column. All are
optional.

| Property | Default | What it does |
|---|---|---|
| Label | Column display name | The word on the fields: `SIN` and `Re-enter SIN`. Set it when the column name is long or when the fields should say something else. |
| Labels | Auto (follow the form) | Which fields carry a label. `Auto` labels only the second field, `Re-enter`, when the form displays the column label for the cell, and both fields when the cell's label is hidden. `Both fields` and `Re-enter only` force one or the other. |
| Label position | Auto (follow the section) | Where the labels sit. `Auto` puts them beside the fields when the section has its labels on the left and above the fields when the section has them on top. `Above the field` and `Beside the field` force one or the other. |
| Characters | Digits only | `Digits only` drops anything that is not 0 to 9. `Any character` accepts whatever is typed. |
| Validation | None | `Canadian SIN` requires nine digits with a valid Luhn checksum and caps typing at nine. |
| Maximum length | 0 | Longest value that can be typed. 0 means no limit. Ignored when validation is SIN. |
| Reveal last character (ms) | 1000 | How long the character just typed stays readable. 0 masks at once. |
| Layout | Auto by width | `Auto` puts the two fields side by side from 480 pixels of width and stacks them below that. `Stacked` and `Side by side` force one or the other. |

Suggested settings:

- **Bank account number**: Characters `Digits only`, Maximum length 12.
- **SIN**: Validation `Canadian SIN`. The length follows.

## 1. Get it into your environment

Import the solution zip from a release, or build and push from source:

```powershell
cd SealedInput
npm install
pac auth create --environment https://<your-org>.crm.dynamics.com
pac pcf push --publisher-prefix <your-prefix>
```

After the push the control appears in the environment as
`<prefix>_KK.SealedInput`.

## 2. Put it on a form column

1. The column must be **Single line of text**. Give it a maximum length that
   fits the values you expect (a SIN is 9 characters).
2. Open the form in the form designer (make.powerapps.com, Tables, your table,
   Forms) and select the column on the form.
3. In the properties pane on the right, expand **Components** and choose
   **Get more components**.
4. Pick **Sealed Input**, add it, and set the properties above.
5. Make it the only control for the column on web, tablet and phone, or the
   stock text box will show the value in clear on the other form factors.
6. Save and publish the form.

## What this control does not do

Be clear about this with whoever asked for it.

- **It hides the value on this form only.** The column is still ordinary text
  in Dataverse. Views, Advanced Find, exports, the Web API and any other form
  show it in clear to anyone with read access. To protect the data itself, use
  Dataverse column security profiles (and masking rules where available) on the
  column. This control is the entry discipline; column security is the lock.
- **The clipboard block is a courtesy, not a guarantee.** It stops the everyday
  paste, drop and autofill paths. A determined person with developer tools can
  put anything into any field.
- **A half-finished entry does not block saving.** If the person types the
  value once and saves, the column keeps its previous value (or stays empty).
  Standard controls cannot raise a form notification for that. If the value is
  mandatory, mark the column required so the form insists on it.
- **The length of a value is visible while it is typed**, one dot per
  character. Only the stored view is fixed-width.
- **Android keyboards that compose text** (swipe and predictive input) may
  not be fully intercepted. The numeric keypad that digits-only mode requests
  behaves correctly; if that proves insufficient, ask users to type digits on
  the keypad.
- **Read-only rendering is untested** in the local harness, which has no
  disabled switch. It is a plain text node with no interaction, so the risk is
  cosmetic.
- **Auto labels read the page, not an API.** Nothing in the control framework
  says whether the form shows the cell label or where the section puts it, so
  the control looks at the DOM around it the way Unified Interface renders a
  cell today. If that changes, `Auto` falls back to labelling both fields,
  above; set the two label properties by hand if it ever guesses wrong.

## Build from source

```powershell
cd SealedInput
npm install
npm run build          # out/controls/SealedInput
npm start              # PCF test harness in a browser
```

The harness seeds the bound value with `val`, so the control opens in its
stored view. Blank the value in the property panel to see the entry fields.

## Tests

`e2e/` holds a Playwright Test suite that hosts the harness headlessly and
drives the control with real keystrokes: masking and reveal timing, Backspace,
Enter, the digit filter, the length cap, Ctrl+V and dispatched paste, drop,
cut, copy and context-menu events, mismatch, match and store, replacing and
clearing a stored value, the SIN checksum, and narrow and wide layout. It also
takes the screenshots on this page.

```powershell
cd SealedInput && npm run build
cd ..\e2e
npm install
npx playwright test    # starts the harness on port 8183 itself
npm run docs           # copies the screenshots into docs/img
```

Against a real environment, after `pac pcf push`:

```powershell
node run.mjs --login   # first time: sign in in the window that opens
node run.mjs           # afterwards: headless, reuses the saved profile
```

`run.mjs` creates two text columns on Contact (`cmtl_sin`, `cmtl_bankaccount`),
a Contact main form "Sealed Input E2E", and a contact "Jane Sealed Input E2E",
then screenshots the form, types a SIN twice, saves and reads the column back.
All fixtures are ordinary customisations and can be deleted afterwards.
