import type { ScrollEvent } from '../interaction/scroll.ts';
import type { PointerSelectionAction } from '../interaction/text-pointer.ts';

export interface LogViewerBodyAnchor {
  readonly entryId: string;
  readonly offset: number;
}

export interface LogViewerSelection {
  readonly anchor: LogViewerBodyAnchor;
  readonly focus: LogViewerBodyAnchor;
}

export type LogViewerAction =
  | { readonly kind: 'scroll'; readonly event: ScrollEvent }
  | { readonly kind: 'pointer'; readonly action: PointerSelectionAction<LogViewerBodyAnchor> }
  | { readonly kind: 'setSearchQuery'; readonly query?: string }
  | { readonly kind: 'jumpMatch'; readonly direction: 1 | -1 }
  | { readonly kind: 'toggleFold'; readonly id: string }
  | { readonly kind: 'fold'; readonly id: string }
  | { readonly kind: 'unfold'; readonly id: string }
  | { readonly kind: 'setFollowTail'; readonly followTail: boolean };

export type LogViewerControlAction = Exclude<LogViewerAction, { readonly kind: 'scroll' }>;
