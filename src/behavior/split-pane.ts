export type SplitPaneTransition =
  | { readonly kind: 'setActiveDivider'; readonly dividerIndex: number }
  | { readonly kind: 'moveActiveDivider'; readonly delta: number }
  | { readonly kind: 'firstActiveDivider' }
  | { readonly kind: 'lastActiveDivider' }
  | { readonly kind: 'resizeBy'; readonly deltaShare: number }
  | { readonly kind: 'beginResize'; readonly dividerIndex: number }
  | { readonly kind: 'resizeFromAnchor'; readonly dividerIndex: number; readonly deltaShare: number }
  | { readonly kind: 'endResize'; readonly dividerIndex: number };
