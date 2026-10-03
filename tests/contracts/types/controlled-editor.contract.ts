import { createTuiControlledEditor, type TuiControlledEditorMessage, type TuiEditorSnapshot } from '@ismail-elkorchi/terminal-ui/tui';
import { createTextAreaState, prepareTextAreaReduction, prepareTextAreaState } from '@ismail-elkorchi/terminal-ui/behavior';
import { createTextDocument } from '@ismail-elkorchi/terminal-ui/text';

const editor = createTuiControlledEditor<TuiControlledEditorMessage>({ id: 'notes', toMessage: (message) => message,
  maxPendingIntents: 64, maxPendingBytes: 2_000_000, maxDocumentBytes: 4_000_000 });
const editing = createTextAreaState({ document: createTextDocument('prepared source') });
const initial = editor.init(editing, 'mount-1');
const queued = editor.requestIntent(initial, { kind: 'edit', operation: { kind: 'insert', text: 'x' } });
const accepted: boolean = queued.accepted;
const dirty: boolean = editor.isDirty(queued.state);
const settlement = editor.requestSettlement(queued.state, 'save');
for (const output of settlement.outputs ?? []) {
  if (output.kind === 'settled') {
    const snapshot: TuiEditorSnapshot = output.snapshot;
    editor.markSaved(settlement.state, snapshot);
  }
}
editor.replaceSource(initial, editing, { pending: 'reject' });
// @ts-expect-error Source replacement must explicitly choose what to do with queued intents.
editor.replaceSource(initial, editing);
// @ts-expect-error Only explicit queue dispositions are supported.
editor.replaceSource(initial, editing, { pending: 'guess' });
const context = { signal: new AbortController().signal, yield: () => Promise.resolve() };
void prepareTextAreaReduction(editing, { kind: 'undo' }, context);
void prepareTextAreaState({ document: editing.document }, context);
void accepted; void dirty;
