export type TabAction =
  | { readonly kind: 'select'; readonly id: string }
  | { readonly kind: 'close'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' };
