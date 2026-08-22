import type { CommandInputState } from './command-input-state.ts';
import type { CommandInputPresentation } from '../ui-model/command-input.ts';

export function commandInputPresentation(state: CommandInputState): CommandInputPresentation {
  return {
    input: state.editor.input,
    open: state.editor.open,
    suggestions: state.suggestions,
    ...(!state.editor.open || state.editor.activeId === undefined
      ? {}
      : { activeSuggestionId: state.editor.activeId }),
    ...(state.submissionIndex === undefined ? {} : { submissionIndex: state.submissionIndex })
  };
}
