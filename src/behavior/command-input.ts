import type { TextEditBuffer, TextEditOperation, TextSelection } from '../text/index.ts';
import type { TextPointerTransition } from '../interaction/text-pointer.ts';
import type { ListboxCollection } from './listbox.ts';

export interface CommandSuggestion {
  readonly id: string;
  readonly completion: CommandCompletion;
  readonly label?: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface CommandCompletion {
  readonly range: TextSelection;
  readonly text: string;
}

export interface CommandInputView {
  readonly input: TextEditBuffer;
  readonly open: boolean;
  readonly suggestions: ListboxCollection<CommandCompletion>;
  readonly activeSuggestionId?: string;
  readonly submissionIndex?: number;
}

export type CommandInputTransition =
  | { readonly kind: 'edit'; readonly operation: TextEditOperation }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  | { readonly kind: 'pointer'; readonly transition: TextPointerTransition }
  | { readonly kind: 'historyPrevious' }
  | { readonly kind: 'historyNext' }
  | { readonly kind: 'moveSuggestion'; readonly delta: 1 | -1 }
  | { readonly kind: 'setActiveSuggestion'; readonly id: string }
  | { readonly kind: 'acceptSuggestion' }
  | { readonly kind: 'dismissSuggestions'; readonly reason: import('../interaction/anchored-surface.ts').AnchoredSurfaceDismissReason }
  | { readonly kind: 'setValue'; readonly value: string }
  | { readonly kind: 'recordSubmission'; readonly value: string }
  | { readonly kind: 'setSuggestions'; readonly suggestions: ListboxCollection<CommandCompletion> };

export interface CommandInputSubmitEvent {
  readonly kind: 'submit';
  readonly value: string;
}
