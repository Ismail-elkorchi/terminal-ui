import type { ScrollEvent } from '../interaction/scroll.ts';
import type { TextPointerAction } from '../interaction/text-pointer.ts';

export type ScrollbackAction =
  | { readonly kind: 'scroll'; readonly event: ScrollEvent }
  | { readonly kind: 'pointer'; readonly action: TextPointerAction }
  | { readonly kind: 'setSearchQuery'; readonly query?: string }
  | { readonly kind: 'jumpMatch'; readonly direction: 1 | -1; readonly matchCount: number }
  | { readonly kind: 'toggleFold'; readonly id: string }
  | { readonly kind: 'fold'; readonly id: string }
  | { readonly kind: 'unfold'; readonly id: string }
  | { readonly kind: 'setFollowTail'; readonly followTail: boolean };

export type ScrollbackControlAction = Exclude<ScrollbackAction, { readonly kind: 'scroll' }>;
