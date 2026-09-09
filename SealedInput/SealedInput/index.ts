import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { SealedInputView, ISealedInputViewProps } from "./SealedInputView";
import { Characters, Layout, Rules, Validation } from "./sealedInput";
import * as React from "react";
import { FluentProvider, Theme, webLightTheme } from "@fluentui/react-components";

export class SealedInput implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  private notifyOutputChanged: () => void;
  private value: string | null = null;

  public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void): void {
    this.notifyOutputChanged = notifyOutputChanged;
    this.value = context.parameters.value.raw;
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
      onCommit: (v) => {
        this.value = v; // "" clears the column; undefined would mean "unchanged"
        this.notifyOutputChanged();
      },
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
    // Nothing to clean up; the view clears its own timer on unmount.
  }
}
