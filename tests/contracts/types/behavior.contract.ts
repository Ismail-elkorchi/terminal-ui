import {
  commandInputReducer,
  createScrollState,
  dataGridReducer,
  pointerInteractionReducer,
  prepareCommandSuggestions,
  prepareTableCollection,
  scrollReducer,
  type CommandInputState,
} from '@ismail-elkorchi/terminal-ui/behavior';

const command: CommandInputState = { input: { text: '', cursor: 0 }, history: [], suggestions: prepareCommandSuggestions([]) };
const edited = commandInputReducer(command, { kind: 'edit', operation: { kind: 'insert', text: 'x' } });
const scrolled = scrollReducer(createScrollState(), { kind: 'scrollLines', rows: 2 }, {
  contentRows: 20,
  contentColumns: 0,
  viewportRows: 5,
  viewportColumns: 0,
});
const rows = [{ id: 'one' }, { id: 'two' }];
const grid = dataGridReducer({
  interaction: { kind: 'row',
  selectionMode: 'single' as const, activeRowId: 'one', selectedRowIds: [] },
}, { kind: 'moveRow', delta: 1 }, {
  collection: prepareTableCollection(rows, (row) => row.id),
  columnIds: [],
  selection: { mode: 'none' },
});
const pointer = pointerInteractionReducer({}, { kind: 'enter', targetId: 'save:control' });

// @ts-expect-error reducer actions are discriminated contracts
scrollReducer(scrolled, { kind: 'scrollLines', rows: 'two' });

void [edited, grid, pointer];
