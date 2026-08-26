export type ProgressBarDisplay = 'bar' | 'bar+percent' | 'bar+value' | 'bar+value+percent';
export type ProgressBarLabelPosition = 'start' | 'end' | 'none';
export type ProgressBarMode =
  | { readonly kind: 'determinate'; readonly value: number; readonly max?: number }
  | { readonly kind: 'indeterminate'; readonly frame?: number };
