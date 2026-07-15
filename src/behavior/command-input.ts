import type { CommandInputState } from './command-input-state.ts';
import type { CommandInputPresentation } from '../ui-model/command-input.ts';

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
