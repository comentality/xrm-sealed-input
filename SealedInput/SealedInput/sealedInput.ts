/** Pure rules for the sealed input. No React, no DOM, so the tests can hit it directly. */

export const MASK = "•"; // bullet
export const STORED_DOTS = MASK.repeat(8); // fixed width on purpose: the stored view must not leak length

export type Characters = "digits" | "any";
export type Layout = "auto" | "stacked" | "sideBySide";

/** Width from which the two entry fields sit side by side in auto layout. */
export const SIDE_BY_SIDE_MIN_WIDTH = 480;

/** Whether the two fields go side by side, given the layout setting and the measured width (0 = unknown). */
export function sideBySide(layout: Layout, width: number): boolean {
  if (layout === "sideBySide") return true;
  if (layout === "stacked") return false;
  return width >= SIDE_BY_SIDE_MIN_WIDTH;
}
export type Validation = "none" | "sin";

export interface Rules {
  characters: Characters;
  validation: Validation;
  maxLength: number; // 0 = unlimited
}

/** Longest value the rules allow, or Infinity. */
export function limitFor(rules: Rules): number {
  if (rules.validation === "sin") return 9;
  return rules.maxLength > 0 ? rules.maxLength : Number.POSITIVE_INFINITY;
}

/** Characters from an insertText event that the rules accept, in order. */
export function acceptedChars(data: string, rules: Rules): string {
  const chars = Array.from(data).filter((c) => c !== "\r" && c !== "\n");
  if (rules.characters === "digits") return chars.filter((c) => c >= "0" && c <= "9").join("");
  return chars.join("");
}

/** Appends typed text to the current value, respecting the character set and the length limit. */
export function append(current: string, data: string, rules: Rules): string {
  const room = limitFor(rules) - current.length;
  if (room <= 0) return current;
  return current + acceptedChars(data, rules).slice(0, room);
}

/** Removes the last character (Backspace). */
export function backspace(current: string): string {
  return current.slice(0, -1);
}

/** What the field shows: every character masked, optionally the last one readable. */
export function display(value: string, revealLast: boolean): string {
  if (value.length === 0) return "";
  if (!revealLast) return MASK.repeat(value.length);
  return MASK.repeat(value.length - 1) + value.slice(-1);
}

/** Luhn check over a digit string. Non-digits fail. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Canadian SIN: nine digits with a Luhn checksum. */
export function sinValid(value: string): boolean {
  return /^\d{9}$/.test(value) && luhnValid(value);
}

/**
 * Error for a complete first entry, or null when it passes. Only complains
 * once the entry is long enough to judge, so it stays quiet mid-typing.
 */
export function validateEntry(value: string, rules: Rules): string | null {
  if (rules.validation === "sin") {
    if (value.length < 9) return null;
    return sinValid(value) ? null : "Not a valid SIN. Check the nine digits.";
  }
  return null;
}

/**
 * Error for the confirmation entry, or null. Quiet while it is still shorter
 * than the first, unless `strict`: after focus has left a field, a shorter
 * second entry is compared too.
 */
export function validateConfirm(first: string, second: string, strict = false): string | null {
  if (second.length === 0 || (!strict && second.length < first.length)) return null;
  return second === first ? null : "Does not match the first entry.";
}

/** True when both entries are complete, equal, and pass validation. */
export function canCommit(first: string, second: string, rules: Rules): boolean {
  return first.length > 0 && first === second && validateEntry(first, rules) === null;
}

// Labels. The form usually draws the cell label itself (left of the control
// or above it, per the section's label position), so the control's own
// labels should not repeat it. The form decides; there is no override.
export type Placement = "above" | "inline";

/** What the control found out about the form's own label for this cell. */
export interface FormLabel {
  /** The form draws a visible label for this cell. */
  shown: boolean;
  /** Where the section puts cell labels; null when it could not be told. */
  position: Placement | null;
  /**
   * Width of the section's label column as seen from the control's left
   * edge, in px, when the section puts labels on the left; null when unknown.
   * A hidden cell label uses it so the first input lines up with the
   * neighbouring cells.
   */
  labelWidth: number | null;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where a form label sits relative to its control: beside it, or above it. */
export function labelPlacement(label: Box, control: Box): Placement {
  return label.right <= control.left + 1 ? "inline" : "above";
}

export interface LabelPlan {
  /** Label text on the first field, or null when the form names the column. */
  first: string | null;
  /** The first label sits beside its field rather than above it. */
  firstInline: boolean;
  /** Label text on the second field. */
  second: string;
  /** The second label sits beside its field rather than above it. */
  secondInline: boolean;
}

/**
 * The labels to draw. `form` is what the DOM said, or null when the control
 * is not inside a form cell it recognises (the test harness); then the form
 * label counts as hidden and the position as above. `side` is whether the
 * two fields share a line: then an unlabelled first field next to a labelled
 * second one would put the inputs on different lines, so the second label
 * goes beside its input instead.
 */
export function planLabels(label: string, form: FormLabel | null, side: boolean): LabelPlan {
  const shown = form?.shown ?? false;
  const inline = form?.position === "inline";
  const secondInline = inline || (shown && side);
  // Beside the field, with the column already named on that line by the form
  // or by the first label, "Re-enter" is enough.
  const second = secondInline ? "Re-enter" : `Re-enter ${label}`;
  return { first: shown ? null : label, firstInline: inline, second, secondInline };
}
