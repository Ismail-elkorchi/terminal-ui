import type { ScrollRequest } from '../interaction/scroll.ts';
import type { PointerSelectionTransition } from '../interaction/text-pointer.ts';
import type { CollectionQuery } from '../text/query.ts';
import type { MouseModifiers } from '../input/types.ts';

export interface LogViewerBodyAnchor {
  readonly entryId: string;
  readonly offset: number;
}

export interface LogViewerSelection {
  readonly anchor: LogViewerBodyAnchor;
  readonly focus: LogViewerBodyAnchor;
}

export interface LogViewerContextMenuEvent {
  readonly kind: 'contextMenu';
  readonly position: LogViewerBodyAnchor;
  readonly selection?: LogViewerSelection;
  readonly row: number;
  readonly column: number;
  readonly modifiers: MouseModifiers;
}

export type LogViewerTransition =
  | { readonly kind: 'scroll'; readonly request: ScrollRequest }
  | {
    readonly kind: 'pointer';
    readonly transition: PointerSelectionTransition<LogViewerBodyAnchor>;
    readonly scrollRequest?: ScrollRequest;
  }
  | { readonly kind: 'setQuery'; readonly query?: CollectionQuery }
  | { readonly kind: 'jumpMatch'; readonly direction: 1 | -1 }
  | { readonly kind: 'toggleFold'; readonly id: string }
  | { readonly kind: 'fold'; readonly id: string }
  | { readonly kind: 'unfold'; readonly id: string }
  | { readonly kind: 'setFollowTail'; readonly followTail: boolean };

export type LogViewerControlTransition = Exclude<LogViewerTransition, { readonly kind: 'scroll' }>;
