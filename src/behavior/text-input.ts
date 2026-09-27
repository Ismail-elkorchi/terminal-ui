import type { TextPointerTransition } from '../interaction/text-pointer.ts';
import type { TextEditOperation } from '../text/types.ts';

export type TextInputTransition =
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'pointer'; readonly transition: TextPointerTransition };

export interface TextInputSubmitEvent {
  readonly kind: 'submit';
  readonly value: string;
}
