import {
  createListboxKeymap, createTextInputKeymap, createDataGridKeymap,
  controlKeymapHelp, textInput, dataGrid,
} from '../../../dist/index.js';

const keys = createTextInputKeymap({ moveHome: [{ kind: 'key', key: 'a', modifiers: { ctrl: true } }], selectAll: null });
textInput({ id: 'field', state: { text: '', cursor: 0 }, keymap: keys, onTransition: (value) => value });
controlKeymapHelp(keys, ['moveHome', 'submit']);
// @ts-expect-error action names belong to this control
createTextInputKeymap({ nextRow: null });
// @ts-expect-error help action names are typed
controlKeymapHelp(keys, ['nextRow']);
// @ts-expect-error a listbox keymap cannot configure text input
textInput({ id: 'field', state: { text: '', cursor: 0 }, keymap: createListboxKeymap(), onTransition: (value) => value });
const gridKeys = createDataGridKeymap({ nextRow: [{ kind: 'key', key: 'j' }] });
dataGrid({ id: 'grid', keymap: gridKeys, rows: [{ id: 'one' }], getRowId: (row) => row.id,
  state: { interaction: { kind: 'row', selection: { mode: 'none' } } }, onTransition: (value) => value });
