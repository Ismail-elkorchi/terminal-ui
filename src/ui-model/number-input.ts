import type { TextEditOperation, TextSelection } from '../text/index.ts';

export type NumberInputAction =
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'step'; readonly direction: 'decrement' | 'increment' }
  | { readonly kind: 'commit' }
  | { readonly kind: 'revert' };

export type NumberInputValidity =
  | 'empty'
  | 'incomplete'
  | 'valid'
  | 'outOfRange'
  | 'invalid';

export interface NumberInputPresentation {
  readonly value: string;
  readonly cursor: number;
  readonly selection?: TextSelection;
  readonly committedValue?: number;
  readonly parsedValue?: number;
  readonly validity: NumberInputValidity;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}
