import {
  commandInputReducer,
  createScrollState,
  scrollReducer,
  tableReducer,
  type CommandInputState
} from '@ismail-elkorchi/terminal-ui/behavior';

const command: CommandInputState = { input: { text: '', cursor: 0 }, history: [], suggestions: [] };
const edited = commandInputReducer(command, { kind: 'edit', operation: { kind: 'insert', text: 'x' } });
const scrolled = scrollReducer(createScrollState({ contentRows: 20, viewportRows: 5 }), {
  kind: 'scrollLines',
  rows: 2
});
const table = tableReducer({ selectedRowId: 'one' }, { kind: 'moveRow', delta: 1 }, {
  rows: [{ id: 'one' }, { id: 'two' }],
  getRowId: (row) => row.id
});

// @ts-expect-error reducer actions are discriminated contracts
scrollReducer(scrolled, { kind: 'scrollLines', rows: 'two' });

void edited;
void table;
