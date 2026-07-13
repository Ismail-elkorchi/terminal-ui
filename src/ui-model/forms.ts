import type { TerminalStyle } from '../visual/render.ts';
import type { ChoiceItem, ComponentTone } from './contracts.ts';

export type ButtonTone = Extract<ComponentTone, 'default' | 'primary' | 'secondary' | 'destructive'>;
export type ButtonState = 'idle' | 'pressed' | 'pending' | 'disabled';
export type SliderStepDirection = 'decrement' | 'increment';

export interface SliderStepEvent {
  readonly direction: SliderStepDirection;
}

export interface RangeSliderValue {
  readonly start: number;
  readonly end: number;
}

export interface NumericRange {
  readonly min: number;
  readonly max: number;
}

export interface RangeSliderStepEvent {
  readonly handle: 'start' | 'end';
  readonly direction: SliderStepDirection;
}

export interface ColorSwatchPickerOption<TValue = string> extends ChoiceItem<TValue> {
  readonly swatch?: string;
  readonly style?: TerminalStyle;
}
