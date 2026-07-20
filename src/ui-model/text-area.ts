import type { ScrollEvent, ScrollState } from '../interaction/scroll.ts';
import type { TextCaret, TextDocument, TextDocumentSelection, TextEditOperation } from '../text/index.ts';
import type { TextPointerAction } from '../interaction/text-pointer.ts';

export interface TextAreaPresentation {
  readonly document: TextDocument;
  readonly caret: TextCaret;
  readonly selection?: TextDocumentSelection;
  readonly scroll?: ScrollState;
  readonly revealCaret?: boolean;
}

export interface TextAreaScrollablePresentation extends Omit<TextAreaPresentation, 'scroll'> {
  readonly scroll: ScrollState;
}

export type TextAreaAction =
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'pointer'; readonly action: TextPointerAction }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

export type TextAreaControlAction = Exclude<TextAreaAction, { readonly kind: 'scroll' }>;
