export type CheckboxGroupAction =
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

export type SelectAction =
  | { readonly kind: 'focus'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'select'; readonly id: string };

export type ColorSwatchPickerAction =
  | { readonly kind: 'focus'; readonly id: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'first' }
  | { readonly kind: 'last' }
  | { readonly kind: 'select'; readonly id: string };
