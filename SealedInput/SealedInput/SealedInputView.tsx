import * as React from "react";
import { Button, Field, Input, Text, makeStyles, tokens } from "@fluentui/react-components";
import {
  Layout,
  Rules,
  STORED_DOTS,
  append,
  backspace,
  canCommit,
  display,
  sideBySide,
  validateConfirm,
  validateEntry,
} from "./sealedInput";

export interface ISealedInputViewProps {
  /** Bound value as the platform holds it. Empty means nothing stored. */
  stored: string;
  disabled: boolean;
  rules: Rules;
  /** How long the character just typed stays readable. 0 masks at once. */
  revealMs: number;
  /** Auto switches to side by side at 480px of measured width. */
  layout: Layout;
  /** The column's name; the fields are labelled "<label>" and "Re-enter <label>". */
  label: string;
  /** Empty string clears; null is never sent because the platform reads it as "no change". */
  onCommit: (value: string) => void;
}

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS, width: "100%", textAlign: "left" },
  row: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalS, minHeight: "20px" },
  fields: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS },
  fieldsSide: { flexDirection: "row", alignItems: "flex-start", columnGap: tokens.spacingHorizontalM },
  field: { flex: "1 1 0", minWidth: 0 },
  hint: { color: tokens.colorNeutralForeground3 },
  input: { width: "100%" },
});

/** Attributes that keep browsers and password managers from filling or remembering the field. */
const quietAttrs = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;

type Slot = "first" | "second";

/**
 * Always two fields. With a stored value and nothing typed yet, both show a
 * fixed row of dots ("stored" state); the first keystroke starts a fresh
 * entry, Backspace clears the column. The value is written when both entries
 * agree; the fields then go back to the stored dots.
 */
export const SealedInputView: React.FC<ISealedInputViewProps> = ({ stored, disabled, rules, revealMs, layout, label, onCommit }) => {
  const styles = useStyles();
  const hasStored = stored !== "";

  // Measure our own width; the form cell, not the host API, decides the layout.
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  const side = sideBySide(layout, width);

  const [first, setFirst] = React.useState("");
  const [second, setSecond] = React.useState("");
  const [revealed, setRevealed] = React.useState<Slot | null>(null);
  const [editing, setEditing] = React.useState(false); // false with a stored value = showing the dots
  const [justSaved, setJustSaved] = React.useState(false);

  const firstRef = React.useRef<HTMLInputElement>(null);
  const secondRef = React.useRef<HTMLInputElement>(null);
  const timer = React.useRef<number | undefined>(undefined);

  const showingStored = hasStored && !editing;
  const state = showingStored ? "stored" : first.length + second.length > 0 ? "entering" : "empty";

  // Whatever the platform now holds is the truth; a fresh value ends any entry in progress.
  React.useEffect(() => {
    setFirst("");
    setSecond("");
    setRevealed(null);
    setEditing(false);
  }, [stored]);

  const reveal = React.useCallback(
    (slot: Slot) => {
      window.clearTimeout(timer.current);
      if (revealMs <= 0) {
        setRevealed(null);
        return;
      }
      setRevealed(slot);
      timer.current = window.setTimeout(() => setRevealed(null), revealMs);
    },
    [revealMs],
  );
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const firstError = validateEntry(first, rules);
  const secondError = firstError ? null : validateConfirm(first, second);

  // Commit the moment both entries agree and pass validation. The entry is
  // closed here as well as in the reset effect above: when the new value equals
  // the stored one the host has nothing to push, and the effect would not run.
  React.useEffect(() => {
    if (!canCommit(first, second, rules)) return;
    window.clearTimeout(timer.current);
    setRevealed(null);
    setJustSaved(true);
    onCommit(first);
    setFirst("");
    setSecond("");
    setEditing(false);
  }, [first, second]);

  // Native beforeinput is the one place every edit path goes through: keys, IME,
  // paste, drop, autofill. Everything is cancelled; state decides what is shown.
  const useSealed = (ref: React.RefObject<HTMLInputElement>, slot: Slot, setValue: React.Dispatch<React.SetStateAction<string>>) => {
    React.useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const onBeforeInput = (e: InputEvent) => {
        e.preventDefault();
        if (disabled) return;
        if (e.inputType === "insertText" && e.data) {
          const typed = e.data;
          if (showingStored) {
            // First keystroke over the stored dots: start a fresh entry in this field.
            setJustSaved(false);
            setEditing(true);
            setFirst(slot === "first" ? append("", typed, rules) : "");
            setSecond(slot === "second" ? append("", typed, rules) : "");
            reveal(slot);
            return;
          }
          setValue((v) => {
            const next = append(v, typed, rules);
            if (next !== v) reveal(slot);
            return next;
          });
        } else if (e.inputType === "deleteContentBackward") {
          if (showingStored) {
            // Backspace over the stored dots clears the column.
            setJustSaved(false);
            setEditing(true);
            onCommit("");
            return;
          }
          setRevealed(null);
          setValue(backspace);
        }
      };
      el.addEventListener("beforeinput", onBeforeInput);
      return () => el.removeEventListener("beforeinput", onBeforeInput);
    });
  };
  useSealed(firstRef, "first", setFirst);
  useSealed(secondRef, "second", setSecond);

  const block = (e: React.SyntheticEvent) => e.preventDefault();
  const blocked = {
    onPaste: block,
    onCopy: block,
    onCut: block,
    onDrop: block,
    onDragStart: block,
    onContextMenu: block,
  };

  const onKeyDown = (slot: Slot) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && slot === "first") {
      e.preventDefault();
      secondRef.current?.focus();
    }
  };

  const startOver = () => {
    setFirst("");
    setSecond("");
    setRevealed(null);
    setEditing(false);
    firstRef.current?.focus();
  };

  const shown = (value: string, slot: Slot) => (showingStored ? STORED_DOTS : display(value, revealed === slot));
  const hint = disabled
    ? ""
    : showingStored
      ? justSaved
        ? "Entered twice and stored. Save the record to keep it."
        : "Stored. Type to replace, Backspace to clear."
      : "Type it twice. Pasting is off.";

  return (
    <div className={styles.root} data-testid="sealed-entry" data-layout={side ? "side-by-side" : "stacked"} data-state={state} ref={rootRef}>
      <div className={side ? `${styles.fields} ${styles.fieldsSide}` : styles.fields}>
        <Field label={label} className={styles.field} validationState={firstError ? "error" : "none"} validationMessage={firstError ?? undefined}>
          <Input
            ref={firstRef}
            type="text"
            inputMode={rules.characters === "digits" ? "numeric" : "text"}
            value={shown(first, "first")}
            disabled={disabled}
            onChange={() => undefined}
            onBlur={() => setRevealed(null)}
            onKeyDown={onKeyDown("first")}
            appearance="filled-darker"
            className={styles.input}
            aria-label={label}
            data-testid="sealed-first"
            {...quietAttrs}
            {...blocked}
          />
        </Field>
        <Field label={`Re-enter ${label}`} className={styles.field} validationState={secondError ? "error" : "none"} validationMessage={secondError ?? undefined}>
          <Input
            ref={secondRef}
            type="text"
            inputMode={rules.characters === "digits" ? "numeric" : "text"}
            value={shown(second, "second")}
            disabled={disabled}
            onChange={() => undefined}
            onBlur={() => setRevealed(null)}
            appearance="filled-darker"
            className={styles.input}
            aria-label={`Re-enter ${label}`}
            data-testid="sealed-second"
            {...quietAttrs}
            {...blocked}
          />
        </Field>
      </div>
      {!disabled && (
        <div className={styles.row}>
          {state === "entering" && (
            <Button size="small" appearance="subtle" onClick={startOver} data-testid="sealed-startover">
              Start over
            </Button>
          )}
          <Text size={200} className={styles.hint} data-testid="sealed-hint">
            {hint}
          </Text>
        </div>
      )}
    </div>
  );
};
