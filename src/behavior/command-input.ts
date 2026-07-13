import type { TextSelection } from '../text/index.ts';
import type { SuggestionItem } from '../ui-model/contracts.ts';
import type { CommandInputState } from './command-input-state.ts';

export interface CommandInputPresentation {
  readonly value: string;
  readonly cursor: number;
  readonly suggestions: readonly SuggestionItem[];
  readonly selection?: TextSelection;
  readonly selectedSuggestion?: number;
  readonly historyIndex?: number;
}

export function commandInputPresentation(state: CommandInputState): CommandInputPresentation {
  return {
    value: state.input.text,
    cursor: state.input.cursor,
    ...(state.input.selection === undefined ? {} : { selection: state.input.selection }),
    suggestions: state.suggestions,
    ...(state.selectedSuggestion === undefined ? {} : { selectedSuggestion: state.selectedSuggestion }),
    ...(state.historyIndex === undefined ? {} : { historyIndex: state.historyIndex })
  };
}
