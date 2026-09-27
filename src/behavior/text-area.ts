import type { ScrollRequest, ScrollState } from '../interaction/scroll.ts';
import type { TextPointerTransition } from '../interaction/text-pointer.ts';
import type { TextDocument } from '../text/document.ts';
import type {
  TextCaret,
  TextChangeSet,
  TextDocumentSelection,
  TextEditOperation,
} from '../text/types.ts';

interface TextAreaControlStateBase {
  readonly document: TextDocument;
  readonly caret: TextCaret;
  readonly selection?: TextDocumentSelection;
  readonly revealCaret?: boolean;
}

export interface UnscrolledTextAreaControlState extends TextAreaControlStateBase {
  readonly scroll?: never;
}

export interface ScrollableTextAreaControlState extends TextAreaControlStateBase {
  readonly scroll: ScrollState;
}

export type TextAreaControlState =
  | UnscrolledTextAreaControlState
  | ScrollableTextAreaControlState;

export type TextAreaTransition =
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'applyChanges'; readonly changeSet: TextChangeSet; readonly caretOffset?: number }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  | {
    readonly kind: 'pointer';
    readonly transition: TextPointerTransition;
    readonly scrollRequest?: ScrollRequest;
  }
  | { readonly kind: 'scroll'; readonly request: ScrollRequest };

export type TextAreaControlTransition = Exclude<TextAreaTransition, { readonly kind: 'scroll' }>;
