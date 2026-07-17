export type FocusPath = readonly string[];

export type InitialFocusSelector =
  | { readonly kind: 'element'; readonly id: string }
  | { readonly kind: 'target'; readonly id: string };

export type PointerFocusIntent =
  | { readonly kind: 'target'; readonly targetId: string }
  | { readonly kind: 'preserve' };

export type ResolvedPointerFocusIntent =
  | { readonly kind: 'focus'; readonly path: FocusPath }
  | { readonly kind: 'preserve' };
