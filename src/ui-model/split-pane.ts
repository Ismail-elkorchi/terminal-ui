export type SplitPaneAction =
  | { readonly kind: 'selectDivider'; readonly dividerIndex: number }
  | { readonly kind: 'moveDividerSelection'; readonly delta: number }
  | { readonly kind: 'selectFirstDivider' }
  | { readonly kind: 'selectLastDivider' }
  | { readonly kind: 'resizeBy'; readonly deltaShare: number }
  | { readonly kind: 'beginResize'; readonly dividerIndex: number }
  | { readonly kind: 'resizeFromAnchor'; readonly dividerIndex: number; readonly deltaShare: number }
  | { readonly kind: 'endResize'; readonly dividerIndex: number };
