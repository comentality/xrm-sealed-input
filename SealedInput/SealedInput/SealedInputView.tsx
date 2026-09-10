import * as React from "react";
import { Button, Field, Input, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import {
  FormLabel,
  Layout,
  Rules,
  STORED_DOTS,
  append,
  backspace,
  canCommit,
  display,
  planLabels,
  sideBySide,
  validateConfirm,
  validateEntry,
} from "./sealedInput";
import { readFormLabel } from "./formLabel";

export interface ISealedInputViewProps {
  /** Bound value as the platform holds it. Empty means nothing stored. */
  stored: string;
  disabled: boolean;
  rules: Rules;
  /** How long the character just typed stays readable. 0 masks at once. */
  revealMs: number;
  /** Auto switches to side by side at 480px of measured width. */
  layout: Layout;
  /** The column's display name; the fields are labelled "<label>" and "Re-enter <label>". */
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
  // Fluent's horizontal Field reserves a third of the width for the label
  // (and pads a label-less field by as much); ours is a word or two, and the
  // measured width goes in as an inline style once known.
  // minmax(0, 1fr) lets the input shrink below its intrinsic width, which an
  // <input> keeps otherwise and overflows a narrow cell with.
  fieldInline: { gridTemplateColumns: "auto minmax(0, 1fr)", paddingLeft: 0 },
  labelText: { whiteSpace: "nowrap" },
  hint: { color: tokens.colorNeutralForeground3 },
  input: { width: "100%", minWidth: 0 },
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

  // Measure our own width and read the form's cell label around us; the form
  // cell, not the host API, decides the layout and the labels. Both are
  // re-read whenever our size changes, which is when the form relaid out.
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const [formLabel, setFormLabel] = React.useState<FormLabel | null>(null);
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = () => {
      setWidth(el.getBoundingClientRect().width);
      // Same answer, same object: a fresh object on every read would re-render
      // without end, since this runs again after each render.
      const next = readFormLabel(el);
      setFormLabel((prev) =>
        prev?.shown === next?.shown && prev?.position === next?.position && prev?.labelWidth === next?.labelWidth && (prev === null) === (next === null) ? prev : next,
      );
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const side = sideBySide(layout, width);
  const labels = planLabels(label, formLabel, side);
  // An unlabelled first field takes the second field's orientation, so that
  // stacked it can be indented to line up and side by side it stays on the line.
  const firstInline = labels.first === null ? labels.secondInline : labels.firstInline;
  // Classes are combined with mergeClasses, never by string: two Griffel
  // sequences side by side leave the cascade to stylesheet insertion order,
  // which differs between page loads in the form host.
  const firstClass = mergeClasses(styles.field, firstInline && styles.fieldInline);
  const secondClass = mergeClasses(styles.field, labels.secondInline && styles.fieldInline);

  // Label columns for labels beside their field. The first label's column is
  // the form's own label column when a hidden cell label left it to us, so the
  // first input lines up with the neighbouring cells; otherwise the text plus
  // Fluent's label margin. The second label's column is its text. Stacked with
  // both labels beside, the two fields share the wider column so the inputs
  // line up; stacked with no first label, the first field is indented by the
  // second's column for the same reason.
  const firstLabelRef = React.useRef<HTMLSpanElement>(null);
  const secondLabelRef = React.useRef<HTMLSpanElement>(null);
  const [cols, setCols] = React.useState({ first: 0, second: 0 });
  React.useLayoutEffect(() => {
    const textCol = (el: HTMLElement | null) => Math.ceil(el?.getBoundingClientRect().width ?? 0) + 12; // spacingHorizontalM
    const formCol = formLabel?.labelWidth ?? 0;
    const own = labels.first !== null && labels.firstInline ? (formCol > 0 ? formCol : textCol(firstLabelRef.current)) : 0;
    const re = labels.secondInline ? textCol(secondLabelRef.current) : 0;
    const shared = !side && own > 0 && re > 0 ? Math.max(own, re) : null;
    const next = { first: shared ?? own, second: shared ?? re };
    if (next.first !== cols.first || next.second !== cols.second) setCols(next);
  }, [labels.first, labels.second, labels.firstInline, labels.secondInline, side, formLabel]);
  // Side by side, each field's share of the line grows from its label column,
  // so the two inputs come out the same width.
  const grow = (col: number) => (side ? { flex: `1 1 ${col}px` } : {});
  const secondFieldStyle = labels.secondInline && cols.second > 0 ? { gridTemplateColumns: `${cols.second}px minmax(0, 1fr)`, ...grow(cols.second) } : undefined;
  const firstFieldStyle =
    labels.first !== null && labels.firstInline && cols.first > 0
      ? { gridTemplateColumns: `${cols.first}px minmax(0, 1fr)`, ...grow(cols.first) }
      : // Without a label the input would land in the label column; give it the only column.
        labels.first === null && firstInline
        ? { gridTemplateColumns: "minmax(0, 1fr)", paddingLeft: !side && cols.second > 0 ? `${cols.second}px` : 0, ...grow(0) }
        : undefined;
  // Fluent's Label lays its children out as a list, hence the key.
  const labelNode = (text: string | null, ref: React.RefObject<HTMLSpanElement>) =>
    text === null ? undefined : (
      <span key="text" ref={ref} className={styles.labelText}>
        {text}
      </span>
    );

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
    <div
      className={styles.root}
      data-testid="sealed-entry"
      data-layout={side ? "side-by-side" : "stacked"}
      data-state={state}
      data-labels={labels.first === null ? "reenter-only" : "both"}
      data-label-position={labels.secondInline ? "inline" : "above"}
      data-form-label={formLabel === null ? "none" : formLabel.shown ? "shown" : "hidden"}
      ref={rootRef}
    >
      <div className={mergeClasses(styles.fields, side && styles.fieldsSide)}>
        <Field
          label={labelNode(labels.first, firstLabelRef)}
          orientation={firstInline ? "horizontal" : "vertical"}
          className={firstClass}
          style={firstFieldStyle}
          validationState={firstError ? "error" : "none"}
          validationMessage={firstError ?? undefined}
        >
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
        <Field
          label={labelNode(labels.second, secondLabelRef)}
          orientation={labels.secondInline ? "horizontal" : "vertical"}
          className={secondClass}
          style={secondFieldStyle}
          validationState={secondError ? "error" : "none"}
          validationMessage={secondError ?? undefined}
        >
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
