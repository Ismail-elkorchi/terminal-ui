import type { TerminalStyle } from '../visual/render.ts';
import type { ChoiceItem } from './contracts.ts';

export type ButtonTone = 'default' | 'primary' | 'secondary' | 'ghost' | 'destructive';
export interface ButtonAction {
  readonly kind: 'press';
}
export interface CheckboxAction {
  readonly kind: 'change';
  readonly checked: boolean;
}
export type SwitchAction = CheckboxAction;

export type SliderStepDirection = 'decrement' | 'increment';
export interface SliderAction {
  readonly kind: 'change';
  readonly value: number;
}
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
