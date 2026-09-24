import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { SealedInputView, ISealedInputViewProps } from "./SealedInputView";
import { Characters, Layout, Rules, Validation } from "./sealedInput";
import * as React from "react";
import { FluentProvider, Theme, webLightTheme } from "@fluentui/react-components";

// The form's client API, as much of it as the control uses. It is the page's
// Xrm global in a model-driven app: not something the control imports, and
// not there in the test harness or a custom page.
interface FormControl {
  setNotification(message: string, uniqueId: string): boolean;
  clearNotification(uniqueId: string): boolean;
}
interface FormPage {
  getControl(name: string): FormControl | null;
  getAttribute(name: string): { controls: { get(): FormControl[] } } | null;
}
interface WithXrm {
  Xrm?: { Page?: FormPage };
}

/** The id the control's notification is set under, so it clears only its own. */
const NOTIFICATION_ID = "KK.SealedInput";

export class SealedInput implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  private notifyOutputChanged: () => void;
  private value: string | null = null;
  private logicalName: string | null = null;
  /** The form controls carrying this control's notification right now. */
  private notified: FormControl[] = [];

  public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void): void {
    this.notifyOutputChanged = notifyOutputChanged;
    this.value = context.parameters.value.raw;
    this.logicalName = context.parameters.value.attributes?.LogicalName ?? null;
  }

  /**
   * Marks the control invalid on the form, which blocks saving until the mark
   * goes, or clears the mark. The control is the one the form cell named,
   * or, when the DOM did not say, every control bound to the column. Without
   * the form's client API on the page nothing happens; a failure inside it
   * must not take the control down.
   */
  private notifyForm(message: string | null, controlName: string | null): void {
    try {
      const w = window as unknown as WithXrm;
      const page = w.Xrm?.Page ?? (window.parent as unknown as WithXrm).Xrm?.Page;
      if (!page) return;
      for (const c of this.notified) c.clearNotification(NOTIFICATION_ID);
      this.notified = [];
      if (message === null) return;
      const named = controlName ? page.getControl(controlName) : null;
      const targets = named ? [named] : this.logicalName ? (page.getAttribute(this.logicalName)?.controls.get() ?? []) : [];
      for (const c of targets) if (c.setNotification(message, NOTIFICATION_ID)) this.notified.push(c);
    } catch {
      this.notified = [];
    }
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    this.value = context.parameters.value.raw;
    // A form saved before a property existed hands us no parameter object for
    // it, so every input read is guarded; defaults apply.
    const p = context.parameters;
    const rules: Rules = {
      characters: (p.characters?.raw as Characters | null) ?? "digits",
      validation: (p.validation?.raw as Validation | null) ?? "none",
      maxLength: p.maxLength?.raw ?? 0,
    };
    const props: ISealedInputViewProps = {
      stored: this.value ?? "", // hosts alternate null and "" for an empty column; treat them as one
      disabled: context.mode.isControlDisabled,
      rules,
      revealMs: p.revealMs?.raw ?? 1000,
      layout: (p.layout?.raw as Layout | null) ?? "auto",
      // The fields are named after the column, nothing else: no override.
      label: (p.value.attributes?.DisplayName ?? "").trim() || "Value",
      onCommit: (v) => {
        this.value = v; // "" clears the column; undefined would mean "unchanged"
        this.notifyOutputChanged();
      },
      onValidity: (error, controlName) => this.notifyForm(error, controlName),
    };
    // The form host hands us its theme; the test harness and older hosts do not,
    // so fall back to the web light theme rather than rendering token-less.
    const theme: Theme = (context.fluentDesignLanguage?.tokenTheme as Theme | undefined) ?? webLightTheme;
    return React.createElement(
      FluentProvider,
      { theme, style: { width: "100%", background: "transparent" } },
      React.createElement(SealedInputView, props),
    );
  }

  public getOutputs(): IOutputs {
    return { value: this.value ?? undefined };
  }

  public destroy(): void {
    // The view clears its own timer on unmount; the form keeps a notification
    // until told otherwise.
    this.notifyForm(null, null);
  }
}
