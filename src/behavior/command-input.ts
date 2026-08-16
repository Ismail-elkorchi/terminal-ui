import type { CommandInputState } from './command-input-state.ts';
import type { CommandInputPresentation } from '../ui-model/command-input.ts';

export function commandInputPresentation(state: CommandInputState): CommandInputPresentation {
  return {
    value: state.editor.input.text,
    cursor: state.editor.input.cursor,
    open: state.editor.open,
    ...(state.editor.input.selection === undefined ? {} : { selection: state.editor.input.selection }),
    suggestions: state.suggestions,
    ...(!state.editor.open || state.editor.activeId === undefined
      ? {}
      : { activeSuggestionId: state.editor.activeId }),
    ...(state.submissionIndex === undefined ? {} : { submissionIndex: state.submissionIndex })
  };
}
