import type { TextEditOperation, TextSelection } from '../text/index.ts';
import type { TextPointerAction } from '../interaction/text-pointer.ts';
import type { SuggestionItem } from './contracts.ts';

export interface CommandInputPresentation {
  readonly value: string;
  readonly cursor: number;
  readonly suggestions: readonly SuggestionItem[];
  readonly selection?: TextSelection;
  readonly selectedSuggestionIndex?: number;
  readonly historyIndex?: number;
}

export type CommandInputAction =
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'pointer'; readonly action: TextPointerAction }
  | { readonly kind: 'historyPrevious' }
  | { readonly kind: 'historyNext' }
  | { readonly kind: 'moveSuggestion'; readonly delta: 1 | -1 }
  | { readonly kind: 'selectSuggestion'; readonly suggestionIndex: number }
  | { readonly kind: 'acceptSuggestion' }
  | { readonly kind: 'setValue'; readonly value: string };
