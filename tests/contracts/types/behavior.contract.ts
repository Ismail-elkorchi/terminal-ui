import {
  commandInputReducer,
  createCommandInputState,
  createScrollState,
  dataGridReducer,
  createCommandSuggestions,
  createTableCollection,
  scrollReducer,
  type CommandInputState,
} from '@ismail-elkorchi/terminal-ui/behavior';
import {
  appendMeasuredItems,
  createMeasuredCollection,
  measuredAnchorAt,
  measuredWindow,
  replaceMeasuredItem,
  type MeasuredCollection,
} from '@ismail-elkorchi/terminal-ui/collection';

const command: CommandInputState = createCommandInputState({ suggestions: createCommandSuggestions([]) });
const edited = commandInputReducer(command, { kind: 'edit', operation: { kind: 'insert', text: 'x' } });
const scrolled = scrollReducer(createScrollState(), { kind: 'scrollLines', rows: 2 }, {
  contentRows: 20,
  contentColumns: 0,
  viewportRows: 5,
  viewportColumns: 0,
});
const rows = [{ id: 'one' }, { id: 'two' }];
const grid = dataGridReducer({
  interaction: { kind: 'row', activeRowId: 'one', selection: { mode: 'single' as const } },
}, { kind: 'moveRow', delta: 1 }, {
  collection: createTableCollection(rows, (row) => row.id),
  columnIds: [],
});
const measured: MeasuredCollection<{ readonly label: string }> = createMeasuredCollection([
  { id: 'one', value: { label: 'One' }, rows: 2 },
]);
const measuredAnchor = measuredAnchorAt(measured, { offsetRow: 0 });
const measuredAppended = appendMeasuredItems(measured, [
  { id: 'two', value: { label: 'Two' }, rows: 1 },
]);
const measuredReplaced = replaceMeasuredItem(measuredAppended, {
  id: 'one',
  value: { label: 'Changed' },
  rows: 3,
});
const measuredVisible = measuredWindow(measuredReplaced, {
  viewportRows: 4,
  ...(measuredAnchor === undefined ? {} : { anchor: measuredAnchor }),
});

// @ts-expect-error reducer actions are discriminated contracts
scrollReducer(scrolled, { kind: 'scrollLines', rows: 'two' });

void [edited, grid, measuredVisible];
