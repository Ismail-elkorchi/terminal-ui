import type { ScrollEvent, ScrollState } from '../interaction/scroll.ts';
import type { TextCaret, TextDocument, TextDocumentSelection, TextEditOperation } from '../text/index.ts';
import type { TextPointerAction } from '../interaction/text-pointer.ts';

interface TextAreaPresentationBase {
  readonly document: TextDocument;
  readonly caret: TextCaret;
  readonly selection?: TextDocumentSelection;
  readonly revealCaret?: boolean;
}

export interface UnscrolledTextAreaPresentation extends TextAreaPresentationBase {
  readonly scroll?: never;
}

export interface ScrollableTextAreaPresentation extends TextAreaPresentationBase {
  readonly scroll: ScrollState;
}

export type TextAreaPresentation =
  | UnscrolledTextAreaPresentation
  | ScrollableTextAreaPresentation;

export type TextAreaAction =
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  | {
    readonly kind: 'pointer';
    readonly action: TextPointerAction;
    readonly scroll?: ScrollEvent;
  }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

export type TextAreaControlAction = Exclude<TextAreaAction, { readonly kind: 'scroll' }>;
