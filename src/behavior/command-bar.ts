import type { CommandBarOptions } from '../components/options/documents.ts';
import type { CommandBarState } from './command-bar-state.ts';

export type CommandBarPresentation = Required<Pick<
  CommandBarOptions,
  'value' | 'cursor' | 'suggestions'
>> & Pick<
  CommandBarOptions,
  'selection' | 'selectedSuggestion' | 'historyIndex'
>;

export function commandBarPresentation(state: CommandBarState): CommandBarPresentation {
  return {
    value: state.input.text,
    cursor: state.input.cursor,
    ...(state.input.selection === undefined ? {} : { selection: state.input.selection }),
    suggestions: state.suggestions,
    ...(state.selectedSuggestion === undefined ? {} : { selectedSuggestion: state.selectedSuggestion }),
    ...(state.historyIndex === undefined ? {} : { historyIndex: state.historyIndex })
  };
}
