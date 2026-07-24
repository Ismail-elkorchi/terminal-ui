import type { CommandInputState } from './command-input-state.ts';
import type { CommandInputPresentation } from '../ui-model/command-input.ts';

export function commandInputPresentation(state: CommandInputState): CommandInputPresentation {
  return {
    value: state.input.text,
    cursor: state.input.cursor,
    ...(state.input.selection === undefined ? {} : { selection: state.input.selection }),
    suggestions: state.suggestions,
    ...(state.selectedSuggestionIndex === undefined ? {} : { selectedSuggestionIndex: state.selectedSuggestionIndex }),
    ...(state.historyIndex === undefined ? {} : { historyIndex: state.historyIndex })
  };
}
