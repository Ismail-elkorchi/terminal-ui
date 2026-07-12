export type CheckboxListAction =
  | { readonly kind: 'focus'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'toggle'; readonly id: string };

export type RadioGroupAction =
  | { readonly kind: 'focus'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'select'; readonly id: string };

export type SelectBoxAction =
  | { readonly kind: 'focus'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'select'; readonly id: string };

export type ColorPickerAction =
  | { readonly kind: 'focus'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'select'; readonly id: string };
