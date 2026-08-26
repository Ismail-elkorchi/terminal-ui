export interface RangeSliderValue {
  readonly start: number;
  readonly end: number;
}

export interface NumericRange {
  readonly min: number;
  readonly max: number;
}

export type RangeSliderStepDirection = 'decrement' | 'increment';

export type RangeSliderHandle = 'start' | 'end';

export interface RangeSliderState {
  readonly value: RangeSliderValue;
  readonly activeHandle: RangeSliderHandle;
}

export type RangeSliderTransition =
  | { readonly kind: 'selectHandle'; readonly handle: RangeSliderHandle }
  | { readonly kind: 'step'; readonly direction: RangeSliderStepDirection }
  | { readonly kind: 'set'; readonly handle: RangeSliderHandle; readonly value: number };

export interface RangeSliderReducerOptions {
  readonly range?: NumericRange;
  readonly step?: number;
}
