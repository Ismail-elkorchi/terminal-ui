import { combobox, dataGrid, listbox, table } from '@ismail-elkorchi/terminal-ui/components';
import { createListboxCollection, createListboxView, createTableCollection, type CommandInputView } from '@ismail-elkorchi/terminal-ui/behavior';

const rows = [{ id: 'one', value: 'One' }];
const collection = createTableCollection(rows, row => row.id);
const columns = [{ id: 'value', value: (row: (typeof rows)[number]) => row.value }];
const options = [{ id: 'one', label: 'One' }];
const choices = createListboxCollection(options, option => option);
const choicesView = createListboxView(choices);
const selection = { mode: 'single' as const };
const listState = { selection };
const gridState = { interaction: { kind: 'row' as const, selection } };
const comboState = { kind: 'select' as const, open: false, interaction: listState };
const autocompleteView = { kind: 'autocomplete' as const, open: false, input: { text: '', cursor: 0 }, selection };
const onTransition = () => ({ kind: 'transition' as const });

table({ id: 'table', collection, columns });
dataGrid({ id: 'grid', collection, columns, state: gridState, onTransition });
listbox({ id: 'list', collection: choices, view: choicesView, state: listState, onTransition });
combobox({ id: 'combo', label: 'Choice', collection: choices, optionsView: choicesView, state: comboState, onTransition });
combobox({ id: 'autocomplete', label: 'Choice', collection: choices, optionsView: choicesView, view: autocompleteView, onTransition });

// @ts-expect-error live tables no longer accept raw rows and identity callbacks
table({ id: 'legacy-table', rows, getRowId: (row: (typeof rows)[number]) => row.id, columns });
// @ts-expect-error live grids no longer accept raw rows and identity callbacks
dataGrid({ id: 'legacy-grid', rows, getRowId: (row: (typeof rows)[number]) => row.id, columns, state: gridState, onTransition });
// @ts-expect-error complete collections also require explicitly supplied columns
table({ id: 'missing-columns', collection });
// @ts-expect-error listbox construction cannot map raw items during live work
listbox({ id: 'legacy-list', items: options, toOption: (option: (typeof options)[number]) => option, state: listState, onTransition });
// @ts-expect-error listboxes require an explicit projection or pending null
listbox({ id: 'missing-view', collection: choices, state: listState, onTransition });
// @ts-expect-error combobox construction cannot normalize a raw option array
combobox({ id: 'legacy-combo', label: 'Choice', options, state: comboState, onTransition });
// @ts-expect-error comboboxes require an explicit option projection or pending null
combobox({ id: 'missing-options-view', label: 'Choice', collection: choices, state: comboState, onTransition });
// @ts-expect-error autocomplete construction cannot normalize a raw option array
combobox({ id: 'legacy-autocomplete', label: 'Choice', options, view: autocompleteView, onTransition });
// @ts-expect-error command views must retain their prepared suggestion projection
const missingSuggestionView: CommandInputView = { input: { text: '', cursor: 0 }, open: false, suggestions: createListboxCollection([], () => ({ id: 'unused', label: 'Unused' })) };
void missingSuggestionView;
