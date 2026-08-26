import type { TextEditOperation, TextSelection } from '../text/index.ts';
import type { TextPointerTransition } from '../interaction/text-pointer.ts';

export type NumberInputControlTransition =
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'pointer'; readonly transition: TextPointerTransition }
  | { readonly kind: 'step'; readonly direction: 'decrement' | 'increment' }
  | { readonly kind: 'commit' };

export type NumberInputTransition =
  | NumberInputControlTransition
  | { readonly kind: 'revert' };

export type NumberInputAnalysis =
  | { readonly validity: 'empty' | 'incomplete' | 'invalid' }
  | { readonly validity: 'valid' | 'outOfRange'; readonly parsedValue: number };

export type NumberInputValidity = NumberInputAnalysis['validity'];

interface NumberInputViewBase {
  readonly value: string;
  readonly cursor: number;
  readonly selection?: TextSelection;
  readonly committedValue?: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export type NumberInputView = NumberInputViewBase & NumberInputAnalysis;
