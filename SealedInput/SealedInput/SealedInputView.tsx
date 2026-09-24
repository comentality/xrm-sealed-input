import * as React from "react";
import { Field, Input, Link, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import {
  Errors,
  FormLabel,
  Layout,
  Left,
  Rules,
  STORED_DOTS,
  SpanColumns,
  append,
  backspace,
  canCommit,
  display,
  planLabels,
  sideBySide,
  validate,
} from "./sealedInput";
import { readFormControlName, readFormLabel } from "./formLabel";

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
  /**
   * The error the control shows, or null once it shows none, with the name
   * the form cell gave the control (null outside a form cell). Called when
   * that changes, so the form can mark the control invalid and refuse to save.
   */
  onValidity: (error: string | null, controlName: string | null) => void;
}

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS, width: "100%", textAlign: "left" },
  row: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalS },
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
  // Start over: a small link under the fields, the size of a Field hint.
  startOver: { fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200 },
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
 * entry, Backspace clears the column. A match that passes validation is
 * written when focus leaves the control, and the fields go back to the
 * stored dots at that same moment, so every instance of the column on the
 * form refreshes together. The rules are listed in docs/usage.md under
 * "Interaction rules".
 */
export const SealedInputView: React.FC<ISealedInputViewProps> = ({ stored, disabled, rules, revealMs, layout, label, onCommit, onValidity }) => {
  const styles = useStyles();

  // Measure our own width and read the form's cell label around us; the form
  // cell, not the host API, decides the layout and the labels. Both are
  // re-read whenever our size changes, which is when the form relaid out.
  // The cell also names the control, for telling the form about errors.
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const [formLabel, setFormLabel] = React.useState<FormLabel | null>(null);
  const controlName = React.useRef<string | null>(null);
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = () => {
      setWidth(el.getBoundingClientRect().width);
      controlName.current = readFormControlName(el);
      // Same answer, same object: a fresh object on every read would re-render
      // without end, since this runs again after each render.
      const next = readFormLabel(el);
      const sameSpan = (a: SpanColumns | null | undefined, b: SpanColumns | null | undefined) =>
        (a ?? null) === (b ?? null) || (!!a && !!b && a.firstEnd === b.firstEnd && a.secondLabel === b.secondLabel && a.secondArea === b.secondArea);
      setFormLabel((prev) =>
        prev?.shown === next?.shown &&
        prev?.position === next?.position &&
        prev?.labelWidth === next?.labelWidth &&
        sameSpan(prev?.span, next?.span) &&
        (prev === null) === (next === null)
          ? prev
          : next,
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
  // A cell spanning two columns of a section whose labels are on the left:
  // the fields are laid out to the columns' own edges, so each input is the
  // width of the stock field in its column and "Re-enter" takes the section's
  // label column, like a second cell on that row.
  const span = side && labels.secondInline && formLabel?.position === "inline" ? formLabel.span : null;
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
    const re = span ? span.secondArea - span.secondLabel : labels.secondInline ? textCol(secondLabelRef.current) : 0;
    const shared = !side && own > 0 && re > 0 ? Math.max(own, re) : null;
    const next = { first: shared ?? own, second: shared ?? re };
    if (next.first !== cols.first || next.second !== cols.second) setCols(next);
  }, [labels.first, labels.second, labels.firstInline, labels.secondInline, side, formLabel, span]);
  // Side by side, each field's share of the line grows from its label column,
  // so the two inputs come out the same width.
  // Spanning two columns, the first field ends with the first column's
  // control area and the second starts with the next column's label; the
  // wrapper's own gap is taken off the distance between them.
  const SIDE_GAP = 12; // spacingHorizontalM, fieldsSide columnGap
  const grow = (col: number) => (span ? {} : side ? { flex: `1 1 ${col}px` } : {});
  const spanFirst = span ? { flex: `0 0 ${span.firstEnd}px` } : {};
  const spanSecond = span ? { flex: "1 1 0", marginLeft: `${span.secondLabel - span.firstEnd - SIDE_GAP}px` } : {};
  const secondFieldStyle =
    labels.secondInline && cols.second > 0 ? { gridTemplateColumns: `${cols.second}px minmax(0, 1fr)`, ...grow(cols.second), ...spanSecond } : undefined;
  const firstFieldStyle =
    labels.first !== null && labels.firstInline && cols.first > 0
      ? { gridTemplateColumns: `${cols.first}px minmax(0, 1fr)`, ...grow(cols.first), ...spanFirst }
      : // Without a label the input would land in the label column; give it the only column.
        labels.first === null && firstInline
        ? { gridTemplateColumns: "minmax(0, 1fr)", paddingLeft: !side && cols.second > 0 ? `${cols.second}px` : 0, ...grow(0), ...spanFirst }
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
  // How far focus has gone while an entry was in progress: to the other field,
  // when a shorter second entry is compared too, or out of the control, when
  // an entry made only once is flagged as well. Reset by the next edit; never
  // stepped back down by a later blur, so a flag stays until the person acts.
  const [left, setLeft] = React.useState<Left>("none");
  // A value ready to write ("" for a clear), waiting for focus to leave the
  // control; the typed dots stay until then. Cleared by the next edit.
  const [pending, setPending] = React.useState<string | null>(null);
  // The value this control wrote last, until the host has pushed it back.
  const committed = React.useRef<string | null>(null);
  // What the column holds as far as this control knows: the value it just
  // wrote counts before the host has pushed it, so the fields do not flash
  // the old state in between.
  const hasStored = (committed.current ?? stored) !== "";
  // The field was focused while holding an entry (or the stored dots). Only
  // retyping is allowed then: any character replaces the whole entry,
  // Backspace or Delete clears it, the caret cannot be moved into it. Reset by
  // that edit, or by leaving the field.
  const returned = React.useRef<Slot | null>(null);

  const firstRef = React.useRef<HTMLInputElement>(null);
  const secondRef = React.useRef<HTMLInputElement>(null);
  const timer = React.useRef<number | undefined>(undefined);

  const showingStored = hasStored && !editing;
  const state = showingStored ? "stored" : first.length + second.length > 0 ? "entering" : "empty";

  const closeEntry = () => {
    setFirst("");
    setSecond("");
    setRevealed(null);
    setEditing(false);
    setPending(null);
    setLeft("none");
  };
  // Whatever the platform now holds is the truth; a fresh value ends any entry
  // in progress. The push of the value this control just wrote changes
  // nothing it shows.
  React.useEffect(() => {
    const own = committed.current !== null && stored === committed.current;
    committed.current = null;
    if (!own) closeEntry();
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

  const errors = validate(first, second, rules, left);

  // The form hears about the error on show (one message: the first field's
  // outranks the second's) and again when it goes. Synchronously with the
  // render, so a blur caused by a click on Save has told the form before the
  // click lands; and directly from the Ctrl+S handler below, before the key
  // reaches the form. Told once per change either way.
  const reported = React.useRef<string | null>(null);
  const report = (e: Errors) => {
    const message = disabled ? null : (e.first ?? e.second);
    if (message === reported.current) return;
    reported.current = message;
    onValidity(message, controlName.current);
  };
  const formMessage = errors.first ?? errors.second;
  React.useLayoutEffect(() => report(errors), [formMessage, disabled]);
  React.useEffect(() => () => report({ first: null, second: null }), []);

  // Both entries agree and pass validation: ready to write. The write itself
  // waits for focus to leave the control (onBlur below, or Ctrl+S in
  // onKeyDown), fully masked meanwhile.
  React.useEffect(() => {
    if (!canCommit(first, second, rules)) return;
    window.clearTimeout(timer.current);
    setRevealed(null);
    setEditing(true);
    setPending(first);
  }, [first, second]);

  // Write what is ready and close the entry: the stored dots appear here, at
  // the same moment the host learns the value.
  const writePending = () => {
    if (pending === null) return;
    committed.current = pending;
    onCommit(pending);
    closeEntry();
  };

  // Any change to an entry: it is a fresh entry again, not the one ready to
  // write, and not the one focus left.
  const edited = () => {
    setPending(null);
    setLeft("none");
    returned.current = null;
  };

  // Native beforeinput is the one place every edit path goes through: keys, IME,
  // paste, drop, autofill. Everything is cancelled; state decides what is shown.
  const useSealed = (ref: React.RefObject<HTMLInputElement>, slot: Slot, setValue: React.Dispatch<React.SetStateAction<string>>) => {
    React.useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const onBeforeInput = (e: InputEvent) => {
        e.preventDefault();
        if (disabled) return;
        // Back in a field that held an entry, or the whole entry selected:
        // typing replaces it, Backspace clears it. Never added to.
        const allSelected = el.value.length > 0 && el.selectionStart === 0 && el.selectionEnd === el.value.length;
        const replaceAll = returned.current === slot || allSelected;
        if (e.inputType === "insertText" && e.data) {
          const typed = e.data;
          if (showingStored) {
            // First keystroke over the stored dots: start a fresh entry in this field.
            const fresh = append("", typed, rules);
            if (fresh === "") return;
            edited();
            setEditing(true);
            setFirst(slot === "first" ? fresh : "");
            setSecond(slot === "second" ? fresh : "");
            reveal(slot);
            return;
          }
          setValue((v) => {
            const next = append(replaceAll ? "" : v, typed, rules);
            if (next !== v) {
              edited();
              reveal(slot);
            }
            return next;
          });
        } else if (e.inputType === "deleteContentBackward" || e.inputType === "deleteContentForward") {
          if (showingStored) {
            // Backspace over the stored dots clears the column, once focus leaves.
            edited();
            setEditing(true);
            setPending("");
            return;
          }
          setRevealed(null);
          setValue((v) => {
            const next = replaceAll ? "" : backspace(v);
            if (next !== v) edited();
            return next;
          });
        }
      };
      el.addEventListener("beforeinput", onBeforeInput);
      return () => el.removeEventListener("beforeinput", onBeforeInput);
    });
  };
  useSealed(firstRef, "first", setFirst);
  useSealed(secondRef, "second", setSecond);

  // Focus on a field that shows something selects all of it and starts the
  // retype-only mode: the selection is kept whole (mouse clicks and the
  // select event), the caret keys are swallowed, and beforeinput above
  // replaces or clears the whole entry. Leaving a field compares the entries
  // at once; leaving the control writes a value that is ready.
  const CARET_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  const wholeSelection = (el: HTMLInputElement) => el.selectionStart === 0 && el.selectionEnd === el.value.length;
  const focusHandlers = (slot: Slot) => ({
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      const el = e.currentTarget;
      if (el.value.length === 0) return;
      el.select();
      returned.current = slot;
    },
    onMouseDown: (e: React.MouseEvent<HTMLInputElement>) => {
      // A click inside the already focused field would place a caret.
      if (returned.current === slot && document.activeElement === e.currentTarget) e.preventDefault();
    },
    onMouseUp: (e: React.MouseEvent<HTMLInputElement>) => {
      // The mouseup after the focusing click would collapse the selection.
      if (returned.current === slot) e.preventDefault();
    },
    onSelect: (e: React.SyntheticEvent<HTMLInputElement>) => {
      const el = e.currentTarget;
      if (returned.current === slot && !wholeSelection(el)) el.select();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && slot === "first") {
        e.preventDefault();
        secondRef.current?.focus();
        return;
      }
      // The form's save shortcut, with focus still here: write a ready value
      // first, so the save takes it; or judge an unfinished entry as if focus
      // had left, and tell the form now, so the save is refused. The event
      // goes on to the form.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        if (pending !== null) writePending();
        else if (state === "entering") {
          setLeft("control");
          report(validate(first, second, rules, "control"));
        }
      }
      if (returned.current === slot && CARET_KEYS.includes(e.key)) e.preventDefault();
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      returned.current = null;
      setRevealed(null);
      const toOtherField = e.relatedTarget === firstRef.current || e.relatedTarget === secondRef.current;
      if (pending !== null) {
        if (!toOtherField) writePending();
      } else if (state === "entering") setLeft((l) => (l === "control" || !toOtherField ? "control" : "field"));
    },
  });

  const block = (e: React.SyntheticEvent) => e.preventDefault();
  const blocked = {
    onPaste: block,
    onCopy: block,
    onCut: block,
    onDrop: block,
    onDragStart: block,
    onContextMenu: block,
  };

  const startOver = () => {
    setFirst("");
    setSecond("");
    setRevealed(null);
    setEditing(false);
    setLeft("none");
    firstRef.current?.focus();
  };

  const shown = (value: string, slot: Slot) => (showingStored ? STORED_DOTS : display(value, revealed === slot));

  return (
    <div
      className={styles.root}
      data-testid="sealed-entry"
      data-layout={side ? "side-by-side" : "stacked"}
      data-state={state}
      data-pending={pending !== null ? "true" : undefined}
      data-labels={labels.first === null ? "reenter-only" : "both"}
      data-label-position={labels.secondInline ? "inline" : "above"}
      data-form-label={formLabel === null ? "none" : formLabel.shown ? "shown" : "hidden"}
      data-span={span ? "2" : undefined}
      ref={rootRef}
    >
      <div className={mergeClasses(styles.fields, side && styles.fieldsSide)}>
        <Field
          label={labelNode(labels.first, firstLabelRef)}
          orientation={firstInline ? "horizontal" : "vertical"}
          className={firstClass}
          style={firstFieldStyle}
          validationState={errors.first ? "error" : "none"}
          validationMessage={errors.first ?? undefined}
        >
          <Input
            ref={firstRef}
            type="text"
            inputMode={rules.characters === "digits" ? "numeric" : "text"}
            value={shown(first, "first")}
            disabled={disabled}
            onChange={() => undefined}
            {...focusHandlers("first")}
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
          validationState={errors.second ? "error" : "none"}
          validationMessage={errors.second ?? undefined}
        >
          <Input
            ref={secondRef}
            type="text"
            inputMode={rules.characters === "digits" ? "numeric" : "text"}
            value={shown(second, "second")}
            disabled={disabled}
            onChange={() => undefined}
            {...focusHandlers("second")}
            appearance="filled-darker"
            className={styles.input}
            aria-label={`Re-enter ${label}`}
            data-testid="sealed-second"
            {...quietAttrs}
            {...blocked}
          />
        </Field>
      </div>
      {!disabled && state === "entering" && (
        <div className={styles.row}>
          <Link
            as="button"
            type="button"
            // On mousedown, and without taking focus: the blur would show the
            // mismatch message first and move this link from under the pointer.
            onMouseDown={(e) => {
              e.preventDefault();
              startOver();
            }}
            onClick={startOver}
            className={styles.startOver}
            data-testid="sealed-startover"
          >
            Start over
          </Link>
        </div>
      )}
    </div>
  );
};
