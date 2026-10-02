import { textArea } from '@ismail-elkorchi/terminal-ui';
import type { TuiChildDefinition, TextAreaTransition } from '@ismail-elkorchi/terminal-ui';
import { createTextAreaState, textAreaReducer } from '@ismail-elkorchi/terminal-ui/behavior';
import type { TextAreaState } from '@ismail-elkorchi/terminal-ui/behavior';

export interface EditorPanelState { readonly label: string; readonly editor: TextAreaState; }
export type EditorPanelMessage =
  | { readonly kind: 'load'; readonly label: string; readonly content: string }
  | { readonly kind: 'transition'; readonly transition: TextAreaTransition };

/** Editing belongs here; disk persistence and size policy belong to the application. */
export const editorPanelDefinition: TuiChildDefinition<EditorPanelState, EditorPanelMessage> = {
  init: () => ({ state: { label: '', editor: createTextAreaState({ value: '' }) } }),
  update(state, message) {
    if (message.kind === 'load') return { state: { label: message.label, editor: createTextAreaState({ value: message.content }) } };
    const editor = textAreaReducer(state.editor, message.transition).state;
    return { state: editor === state.editor ? state : { ...state, editor } };
  },
  view: state => textArea({
    id: 'editor', meta: { accessibleName: `Editor ${state.label}` }, state: state.editor,
    lineNumbers: true, highlightActiveLine: true, scrollbar: { visible: 'auto' },
    onTransition: (transition: TextAreaTransition) => ({ kind: 'transition' as const, transition }),
  }),
};
