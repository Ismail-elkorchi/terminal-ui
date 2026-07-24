export type SearchPickerAction =
  | { readonly kind: 'setQuery'; readonly query: string }
  | { readonly kind: 'insertQuery'; readonly text: string }
  | { readonly kind: 'deleteQueryBackward' }
  | { readonly kind: 'moveSelection'; readonly delta: number }
  | { readonly kind: 'selectIndex'; readonly entryIndex: number }
  | { readonly kind: 'toggleSelected'; readonly id: string }
  | { readonly kind: 'clearSelected' }
  | { readonly kind: 'preview'; readonly id?: string };

export type { SearchPickerIndex, SearchPickerQueryProjection } from './search-picker-index.ts';
export { prepareSearchPickerIndex, projectSearchPickerQuery } from './search-picker-index.ts';
