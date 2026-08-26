import type { TextEditOperation, TextSelection } from '../text/index.ts';
import type { TextPointerTransition } from '../interaction/text-pointer.ts';

export interface TextInputState {
  readonly value: string;
  readonly cursor: number;
  readonly selection?: TextSelection;
}

export type TextInputTransition =
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'pointer'; readonly transition: TextPointerTransition };

export interface TextInputSubmitEvent {
  readonly kind: 'submit';
  readonly value: string;
}
