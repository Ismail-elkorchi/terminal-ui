import type { TextEditOperation, TextSelection } from '../text/index.ts';
import type { TextPointerAction } from '../interaction/text-pointer.ts';
import type { ListboxCollection } from './list.ts';

export interface CommandSuggestion {
  readonly id: string;
  readonly value: string;
  readonly label?: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface CommandInputPresentation {
  readonly value: string;
  readonly cursor: number;
  readonly suggestions: ListboxCollection<string>;
  readonly selection?: TextSelection;
  readonly activeSuggestionId?: string;
  readonly historyIndex?: number;
}

export type CommandInputTransition =
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'pointer'; readonly action: TextPointerAction }
  | { readonly kind: 'historyPrevious' }
  | { readonly kind: 'historyNext' }
  | { readonly kind: 'moveSuggestion'; readonly delta: 1 | -1 }
  | { readonly kind: 'setActiveSuggestion'; readonly id: string }
  | { readonly kind: 'acceptSuggestion' }
  | { readonly kind: 'dismissSuggestions' }
  | { readonly kind: 'setValue'; readonly value: string };

export interface CommandInputSubmitEvent {
  readonly kind: 'submit';
  readonly value: string;
}
