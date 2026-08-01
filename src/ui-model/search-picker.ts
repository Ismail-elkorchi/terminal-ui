import type { ScrollEvent } from '../interaction/scroll.ts';
import type { SearchEntry } from './contracts.ts';

export type SearchPickerAction<TValue = string> =
  | { readonly kind: 'setQuery'; readonly query: string }
  | { readonly kind: 'insertQuery'; readonly text: string }
  | { readonly kind: 'deleteQueryBackward' }
  | { readonly kind: 'moveSelection'; readonly delta: number }
  | { readonly kind: 'activate'; readonly entry: SearchEntry<TValue> }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };
