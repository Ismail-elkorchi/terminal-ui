import type { BorderStyle } from './border.ts';

export type SurfaceVariant =
  | 'neutral'
  | 'chrome'
  | 'raised'
  | 'inset'
  | 'selected'
  | 'warning'
  | 'danger'
  | 'success';

export interface SurfaceChromeOptions {
  readonly variant?: SurfaceVariant;
  readonly border?: BorderStyle;
  readonly shadow?: boolean;
  readonly disabled?: boolean;
  readonly visualState?: 'active' | 'selected' | 'error' | 'warning' | 'success';
}
