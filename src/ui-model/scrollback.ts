import type { ScrollEvent } from '../interaction/scroll.ts';
import type { PointerSelectionAction } from '../interaction/text-pointer.ts';
import type { ScrollbackSearchMatch } from './scrollback-history.ts';

export interface ScrollbackBodyAnchor {
  readonly itemId: string;
  readonly offset: number;
}

export interface ScrollbackSelection {
  readonly anchor: ScrollbackBodyAnchor;
  readonly focus: ScrollbackBodyAnchor;
}

export type ScrollbackAction =
  | { readonly kind: 'scroll'; readonly event: ScrollEvent }
  | { readonly kind: 'pointer'; readonly action: PointerSelectionAction<ScrollbackBodyAnchor> }
  | { readonly kind: 'setSearchQuery'; readonly query?: string }
  | { readonly kind: 'jumpMatch'; readonly direction: 1 | -1; readonly matches: readonly ScrollbackSearchMatch[] }
  | { readonly kind: 'toggleFold'; readonly id: string }
  | { readonly kind: 'fold'; readonly id: string }
  | { readonly kind: 'unfold'; readonly id: string }
  | { readonly kind: 'setFollowTail'; readonly followTail: boolean };

export type ScrollbackControlAction = Exclude<ScrollbackAction, { readonly kind: 'scroll' }>;
