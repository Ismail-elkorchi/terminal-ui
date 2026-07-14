import type { NumericRange, RangeSliderValue, SliderStepDirection } from './forms.ts';

export type RangeSliderHandle = 'start' | 'end';

export interface RangeSliderState {
  readonly value: RangeSliderValue;
  readonly activeHandle: RangeSliderHandle;
}

export type RangeSliderPresentation = RangeSliderState;

export type RangeSliderAction =
  | { readonly kind: 'selectHandle'; readonly handle: RangeSliderHandle }
  | { readonly kind: 'step'; readonly direction: SliderStepDirection }
  | { readonly kind: 'set'; readonly handle: RangeSliderHandle; readonly value: number };

export interface RangeSliderReducerOptions {
  readonly range?: NumericRange;
  readonly step?: number;
}
