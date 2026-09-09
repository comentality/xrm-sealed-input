import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { SealedInputView, ISealedInputViewProps } from "./SealedInputView";
import { Characters, Rules, Validation } from "./sealedInput";
import * as React from "react";

export class SealedInput implements ComponentFramework.ReactControl<IInputs, IOutputs> {
  private notifyOutputChanged: () => void;
  private value: string | null = null;

  public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void): void {
    this.notifyOutputChanged = notifyOutputChanged;
    this.value = context.parameters.value.raw;
  }

  public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
    this.value = context.parameters.value.raw;
    const p = context.parameters;
    const rules: Rules = {
      characters: (p.characters.raw as Characters | null) ?? "digits",
      validation: (p.validation.raw as Validation | null) ?? "none",
      maxLength: p.maxLength.raw ?? 0,
    };
    const props: ISealedInputViewProps = {
      stored: this.value,
      disabled: context.mode.isControlDisabled,
      rules,
      revealMs: p.revealMs.raw ?? 1000,
      onCommit: (v) => {
        this.value = v;
        this.notifyOutputChanged();
      },
    };
    return React.createElement(SealedInputView, props);
  }

  public getOutputs(): IOutputs {
    return { value: this.value ?? undefined };
  }

  public destroy(): void {
    // Nothing to clean up; the view clears its own timer on unmount.
  }
}
