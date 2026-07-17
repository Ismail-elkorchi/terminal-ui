import type { TextEditOperation, TextSelection } from '../text/index.ts';

export type NumberInputControlAction =
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'step'; readonly direction: 'decrement' | 'increment' }
  | { readonly kind: 'commit' };

export type NumberInputAction =
  | NumberInputControlAction
  | { readonly kind: 'revert' };

export type NumberInputAnalysis =
  | { readonly validity: 'empty' | 'incomplete' | 'invalid' }
  | { readonly validity: 'valid' | 'outOfRange'; readonly parsedValue: number };

export type NumberInputValidity = NumberInputAnalysis['validity'];

interface NumberInputPresentationBase {
  readonly value: string;
  readonly cursor: number;
  readonly selection?: TextSelection;
  readonly committedValue?: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export type NumberInputPresentation = NumberInputPresentationBase & NumberInputAnalysis;
