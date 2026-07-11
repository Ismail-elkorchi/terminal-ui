import type { TextEditOperation } from '../text/index.ts';

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
