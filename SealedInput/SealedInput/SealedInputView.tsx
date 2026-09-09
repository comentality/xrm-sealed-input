import * as React from "react";
import { Button, Field, Input, Text, makeStyles, tokens } from "@fluentui/react-components";
import {
  Rules,
  STORED_DOTS,
  append,
  backspace,
  canCommit,
  display,
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
  /** Empty string clears; null is never sent because the platform reads it as "no change". */
  onCommit: (value: string) => void;
}

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalS, width: "100%", textAlign: "left" },
  row: { display: "flex", alignItems: "center", columnGap: tokens.spacingHorizontalS },
  dots: { letterSpacing: "0.15em", fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground2 },
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

export const SealedInputView: React.FC<ISealedInputViewProps> = ({ stored, disabled, rules, revealMs, onCommit }) => {
  const styles = useStyles();
  const hasStored = stored !== "";

  const [first, setFirst] = React.useState("");
  const [second, setSecond] = React.useState("");
  const [revealed, setRevealed] = React.useState<Slot | null>(null);
  const [replacing, setReplacing] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState(false);

  const firstRef = React.useRef<HTMLInputElement>(null);
  const secondRef = React.useRef<HTMLInputElement>(null);
  const timer = React.useRef<number | undefined>(undefined);

  const entering = !hasStored || replacing;

  // Whatever the platform now holds is the truth; a fresh value ends any entry in progress.
  React.useEffect(() => {
    setFirst("");
    setSecond("");
    setRevealed(null);
    setReplacing(false);
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
    if (!entering || !canCommit(first, second, rules)) return;
    window.clearTimeout(timer.current);
    setRevealed(null);
    setJustSaved(true);
    onCommit(first);
    setFirst("");
    setSecond("");
    setReplacing(false);
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
          setValue((v) => {
            const next = append(v, e.data ?? "", rules);
            if (next !== v) reveal(slot);
            return next;
          });
        } else if (e.inputType === "deleteContentBackward") {
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
    firstRef.current?.focus();
  };

  if (disabled) {
    return (
      <div className={styles.root} data-testid="sealed-readonly">
        <Text className={styles.dots}>{hasStored ? STORED_DOTS : "—"}</Text>
      </div>
    );
  }

  if (!entering) {
    return (
      <div className={styles.root} data-testid="sealed-stored">
        <div className={styles.row}>
          <Text className={styles.dots} aria-label="A value is stored and hidden">
            {STORED_DOTS}
          </Text>
          <Button size="small" appearance="secondary" onClick={() => { setJustSaved(false); setReplacing(true); }} data-testid="sealed-replace">
            Replace
          </Button>
          <Button size="small" appearance="subtle" onClick={() => { setJustSaved(false); onCommit(""); }} data-testid="sealed-clear">
            Clear
          </Button>
        </div>
        {justSaved && (
          <Text size={200} className={styles.hint} data-testid="sealed-saved">
            Entered twice and stored. Save the record to keep it.
          </Text>
        )}
      </div>
    );
  }

  return (
    <div className={styles.root} data-testid="sealed-entry">
      <Field label="Enter" validationState={firstError ? "error" : "none"} validationMessage={firstError ?? undefined}>
        <Input
          ref={firstRef}
          type="text"
          inputMode={rules.characters === "digits" ? "numeric" : "text"}
          value={display(first, revealed === "first")}
          onChange={() => undefined}
          onBlur={() => setRevealed(null)}
          onKeyDown={onKeyDown("first")}
          appearance="filled-darker"
          className={styles.input}
          aria-label="Enter the value"
          data-testid="sealed-first"
          {...quietAttrs}
          {...blocked}
        />
      </Field>
      <Field label="Enter again" validationState={secondError ? "error" : "none"} validationMessage={secondError ?? undefined}>
        <Input
          ref={secondRef}
          type="text"
          inputMode={rules.characters === "digits" ? "numeric" : "text"}
          value={display(second, revealed === "second")}
          onChange={() => undefined}
          onBlur={() => setRevealed(null)}
          appearance="filled-darker"
          className={styles.input}
          aria-label="Enter the value again"
          data-testid="sealed-second"
          {...quietAttrs}
          {...blocked}
        />
      </Field>
      <div className={styles.row}>
        {(first.length > 0 || second.length > 0) && (
          <Button size="small" appearance="subtle" onClick={startOver} data-testid="sealed-startover">
            Start over
          </Button>
        )}
        {replacing && (
          <Button size="small" appearance="subtle" onClick={() => { setFirst(""); setSecond(""); setRevealed(null); setReplacing(false); }} data-testid="sealed-cancel">
            Cancel
          </Button>
        )}
        <Text size={200} className={styles.hint}>
          Type it twice. Pasting is off.
        </Text>
      </div>
    </div>
  );
};
