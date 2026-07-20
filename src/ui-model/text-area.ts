import type { ScrollEvent, ScrollState } from '../interaction/scroll.ts';
import type { TextDocument, TextEditOperation, TextSelection } from '../text/index.ts';
import type { TextPointerAction } from '../interaction/text-pointer.ts';

export interface TextAreaPresentation {
  readonly document: TextDocument;
  readonly cursor: number;
  readonly selection?: TextSelection;
  readonly scroll?: ScrollState;
}

export interface TextAreaScrollablePresentation extends Omit<TextAreaPresentation, 'scroll'> {
  readonly scroll: ScrollState;
}

export type TextAreaAction =
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'pointer'; readonly action: TextPointerAction }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

export type TextAreaControlAction = Exclude<TextAreaAction, { readonly kind: 'scroll' }>;
