# xrm-sealed-input

A PCF (PowerApps Component Framework) control for entering sensitive data into a
Dynamics 365 / Power Apps form. Built under the comentality org.

## Goal

In the user's words: a PCF control for input of sensitive data. The user cannot
copy or paste. Each previously typed symbol gets masked. The user must enter the
value twice. Used for bank account numbers and SIN (Social Insurance Number)
values.

So the control is about *entry* discipline, not storage: it makes a person type a
number by hand, confirms they typed it the same way both times, and never shows
the whole value on screen while they do it.

## Open questions

Deliberately undecided. Decide them on purpose in the first session.

- **Masking behaviour.** Does the character just typed stay visible for a moment
  (like phone PIN fields) and then turn into a dot, or is everything masked
  instantly? Is there a "show last character" or "reveal" affordance at all?
- **Second entry.** Two fields side by side, or one field that clears and asks
  again? What does the mismatch state look like, and does a mismatch clear both?
- **Blocking copy/paste.** Which events to intercept (paste, copy, cut, drop,
  context menu, drag) and how far to go — autocomplete/autofill and password
  managers also inject values. Decide what is in scope.
- **Bound field type.** Single line of text is the obvious binding. Does the
  control also validate format (SIN checksum via Luhn, bank account/transit
  digit counts) or is it format-agnostic and only enforces the entry ritual?
- **What the form sees.** When is the bound value committed — only after both
  entries match? What does the field hold in between, and what happens on
  reopening a record that already has a value (show masked dots, show nothing,
  allow re-entry)?
- **Existing value display.** Once saved, should the control show last four
  digits, all dots, or nothing?
- **Tooling.** Plain `pac pcf init` with React or virtual control? Fluent UI
  version to match the target environment?
- **How anyone knows it worked.** A test harness page, `pac pcf` test harness,
  or a Dynamics sandbox environment?

## Leads (unverified — evaluate before using)

- Sibling repos `~/Code/xrm-plain-number` and `~/Code/xrm-icons` may already be
  PCF controls with a working build setup worth copying. Not opened during init.
- `~/Code/comentality-brand` may hold the org's naming/publisher prefix and
  visual conventions for controls.

## Status

Empty. Nothing built yet.
