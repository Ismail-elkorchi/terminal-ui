export type SearchPickerAction =
  | { readonly kind: 'setQuery'; readonly query: string }
  | { readonly kind: 'insertQuery'; readonly text: string }
  | { readonly kind: 'deleteQueryBackward' }
  | { readonly kind: 'moveSelection'; readonly delta: number };
