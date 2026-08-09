import type { TextEditOperation, TextSelection } from '../text/index.ts';
import type { TextPointerAction } from '../interaction/text-pointer.ts';

export interface TextInputPresentation {
  readonly value: string;
  readonly cursor: number;
  readonly selection?: TextSelection;
}

export type TextInputAction =
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'pointer'; readonly action: TextPointerAction }
  | { readonly kind: 'submit'; readonly value: string };
