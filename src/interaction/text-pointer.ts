export type TextPointerAction =
  | { readonly kind: 'placeCaret'; readonly offset: number }
  | { readonly kind: 'extendSelection'; readonly anchor: number; readonly offset: number }
  | { readonly kind: 'endSelection'; readonly anchor: number; readonly offset: number };
