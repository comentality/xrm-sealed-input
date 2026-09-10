# Changelog

## Unreleased

## 0.4.0 - 2026-09-09

- **Sealed Input makes a person type a sensitive number twice, masking every character and blocking the clipboard.**
  Field control for `SingleLine.Text` columns on model-driven app forms. The character just typed stays readable for a
  second, then turns into a dot; paste, drop, cut, autofill and password managers are all shut off at the field.
  ![SIN row mid-entry: dots with the last digit still readable, an empty Re-enter field, a Start over link](docs/img/slice-typing.png)
- **The column is written only once both entries agree and pass validation, so a half-typed number never reaches Dataverse.**
  Digits only by default, optionally checked as a Canadian SIN (nine digits, Luhn), with a length cap for everything else.
  A stored value shows a fixed eight dots, which say nothing about how long the real one is.
- **The two fields borrow the form's own label placement, side by side in a wide cell and stacked in a narrow one.**
  The control reads the section's label column out of the DOM, so its inputs line up with the stock fields beside them.
  Nothing about labels is configurable: the form decides, and the fields are named after the column.
  ![A stacked pair, SIN and Re-enter SIN, each showing eight dots](docs/img/slice-stacked.png)
- **The control is five files in one folder, so it can be dropped into another solution with `npx degit`.**
  `sealedInput.ts` holds the rules with no React or DOM in them, which is the file to edit for another country's
  checksum or a different character filter. See [VENDORING.md](VENDORING.md).
- Ships as one solution, managed and unmanaged, plus a source zip for vendoring.
- The vendoring steps were run end to end before release: a clean `pac pcf init` produces scaffolding identical to
  this repo's, and the five files plus the Fluent pin build on their own.
- e2e: 39 Playwright tests against the pcf-start harness cover masking and reveal timing, every blocked input path,
  mismatch, match and store, and the SIN checksum; a second run builds a fixture form in a Dataverse environment,
  types a SIN through the real control, saves it and reads the column back.
- Limitation kept as a decision: a half-finished entry cannot block the form's save, because standard controls have
  no field notification API. Protecting the column itself is Dataverse column security's job.
