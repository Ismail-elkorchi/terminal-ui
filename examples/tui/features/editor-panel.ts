import { textArea, createTuiControlledEditor } from '@ismail-elkorchi/terminal-ui';
import type {
  TuiChildDefinition, TextAreaTransition, TuiControlledEditorState,
  TuiControlledEditorMessage, TuiControlledEditorOutput, TuiEditorIntentOrigin, TuiEditorSnapshot,
} from '@ismail-elkorchi/terminal-ui';
import { createTextAreaState } from '@ismail-elkorchi/terminal-ui/behavior';
import type { TextDocument } from '@ismail-elkorchi/terminal-ui/text';
import type { TextAreaLayoutRequest } from '@ismail-elkorchi/terminal-ui/components';

export interface EditorPanelState { readonly label: string; readonly editor: TuiControlledEditorState; }
export type EditorPanelMessage =
  | { readonly kind: 'load'; readonly label: string; readonly content: string; readonly pending: 'reject' | 'discard' }
  | { readonly kind: 'loadDocument'; readonly label: string; readonly document: TextDocument; readonly pending: 'reject' | 'discard' }
  | { readonly kind: 'transition'; readonly transition: TextAreaTransition; readonly origin?: TuiEditorIntentOrigin }
  | { readonly kind: 'controller'; readonly message: TuiControlledEditorMessage }
  | { readonly kind: 'layoutRequest'; readonly request: TextAreaLayoutRequest }
  | { readonly kind: 'settle'; readonly token: string }
  | { readonly kind: 'saved'; readonly snapshot: TuiEditorSnapshot }
  | { readonly kind: 'retry' };

export const editorPanelController = createTuiControlledEditor<EditorPanelMessage>({
  id: 'editing', maxDocumentBytes: 4 * 1024 * 1024, toMessage: (message) => ({ kind: 'controller', message }),
});

/** Editing and layout belong here; the parent owns disk I/O and dirty-close decisions. */
export const editorPanelDefinition: TuiChildDefinition<EditorPanelState, EditorPanelMessage, TuiControlledEditorOutput> = {
  init: () => ({ state: { label: '', editor: editorPanelController.init(createTextAreaState({ value: '' })) } }),
  update(state, message) {
    if (message.kind === 'saved') return { state: { ...state, editor: editorPanelController.markSaved(state.editor, message.snapshot) } };
    const result = message.kind === 'load' || message.kind === 'loadDocument'
      ? editorPanelController.replaceSource(state.editor, createTextAreaState(message.kind === 'load'
        ? { value: message.content } : { document: message.document }), { pending: message.pending })
      : message.kind === 'transition' ? editorPanelController.requestIntent(state.editor, message.transition, message.origin)
      : message.kind === 'controller' ? editorPanelController.update(state.editor, message.message)
      : message.kind === 'layoutRequest' ? editorPanelController.requestLayout(state.editor, message.request)
      : message.kind === 'settle' ? editorPanelController.requestSettlement(state.editor, message.token)
      : editorPanelController.retry(state.editor);
    return { ...result, state: { label: (message.kind === 'load' || message.kind === 'loadDocument') && result.accepted ? message.label : state.label, editor: result.state } };
  },
  view: state => textArea<EditorPanelMessage>({
    id: 'editor', meta: { accessibleName: `Editor ${state.label}` }, state: state.editor.editing,
    preparedLayout: state.editor.preparedLayout,
    busy: state.editor.queue.length > 0,
    onLayoutRequest: (request) => ({ kind: 'layoutRequest', request }),
    lineNumbers: true, highlightActiveLine: true, scrollbar: { visible: 'auto' },
    onTransition: (transition: TextAreaTransition) => ({ kind: 'transition' as const, transition,
      origin: { sourceEpoch: state.editor.sourceEpoch, semanticRevision: state.editor.semanticRevision, generation: state.editor.generation } }),
  }),
};
