export interface Rect {
  readonly row: number;
  readonly column: number;
  readonly width: number;
  readonly height: number;
}

export type LayoutSize =
  | { readonly kind: 'fixed'; readonly cells: number }
  | { readonly kind: 'percent'; readonly value: number }
  | { readonly kind: 'fill'; readonly weight?: number }
  | { readonly kind: 'content'; readonly min?: number; readonly max?: number };

export interface LayoutInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export type LayoutAlignment = 'start' | 'center' | 'end' | 'stretch';
export type LayoutJustification = 'start' | 'center' | 'end' | 'stretch';
export type LayoutOverflow = 'clip' | 'visible';

export type LayoutInsetInput =
  | number
  | {
      readonly top?: number;
      readonly right?: number;
      readonly bottom?: number;
      readonly left?: number;
    };

export interface LayoutFlowOptions {
  readonly gap?: number;
  readonly padding?: LayoutInsetInput;
  readonly margin?: LayoutInsetInput;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly align?: LayoutAlignment;
  readonly justify?: LayoutJustification;
  readonly overflow?: LayoutOverflow;
}

export interface GridLayoutOptions extends LayoutFlowOptions {
  readonly rowGap?: number;
  readonly columnGap?: number;
}
