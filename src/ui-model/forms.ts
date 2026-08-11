import type { TerminalStyle } from '../visual/render.ts';
import type { ChoiceItem } from './contracts.ts';
import type { PointerInteractionAction } from '../interaction/pointer-interaction.ts';

export type ButtonTone = 'default' | 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonAction =
  | { readonly kind: 'press' }
  | { readonly kind: 'pointer'; readonly action: PointerInteractionAction };
export type CheckboxAction =
  | { readonly kind: 'change'; readonly checked: boolean }
  | { readonly kind: 'pointer'; readonly action: PointerInteractionAction };
export type ToggleSwitchAction = CheckboxAction;

export type SliderStepDirection = 'decrement' | 'increment';
export type SliderAction =
  | { readonly kind: 'change'; readonly value: number }
  | { readonly kind: 'pointer'; readonly action: PointerInteractionAction };
export interface RangeSliderValue {
  readonly start: number;
  readonly end: number;
}

export interface NumericRange {
  readonly min: number;
  readonly max: number;
}

export interface ColorSwatchPickerOption<TValue = string> extends ChoiceItem<TValue> {
  readonly swatch?: string;
  readonly style?: TerminalStyle;
}
