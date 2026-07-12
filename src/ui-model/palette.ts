export type PaletteAction =
  | { readonly kind: 'setQuery'; readonly query: string }
  | { readonly kind: 'insertQuery'; readonly text: string }
  | { readonly kind: 'deleteQueryBackward' }
  | { readonly kind: 'moveSelection'; readonly delta: number }
  | { readonly kind: 'selectIndex'; readonly index: number }
  | { readonly kind: 'toggleSelected'; readonly id: string }
  | { readonly kind: 'clearSelected' }
  | { readonly kind: 'preview'; readonly id?: string };
