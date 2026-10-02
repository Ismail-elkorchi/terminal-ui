import {
  createSearchPickerIndex, prepareSearchPickerIndex, updateSearchPickerIndex,
  prepareSearchPickerIndexUpdate, type SearchPickerIndex, type SearchPickerIndexChange,
  type CooperativeWorkContext,
} from '@ismail-elkorchi/terminal-ui/behavior';
import type { SearchEntry } from '@ismail-elkorchi/terminal-ui';

const entries: readonly SearchEntry<number>[] = [{ id: 'one', label: 'One', value: 1 }];
const context: CooperativeWorkContext = { signal: new AbortController().signal, yield: () => Promise.resolve() };
const index: SearchPickerIndex<number> = createSearchPickerIndex(entries);
const prepared: Promise<SearchPickerIndex<number>> = prepareSearchPickerIndex([entries], context);
const changes: readonly SearchPickerIndexChange<number>[] = [
  { kind: 'append', entry: { id: 'two', label: 'Two', value: 2 } },
  { kind: 'replace', entry: { id: 'one', label: 'First', value: 1 } },
  { kind: 'remove', id: 'two' },
];
const updated: SearchPickerIndex<number> = updateSearchPickerIndex(index, changes);
const preparedUpdate: Promise<SearchPickerIndex<number>> = prepareSearchPickerIndexUpdate(index, [changes], context);

// @ts-expect-error cooperative ingestion requires explicit batches, not a mutable raw snapshot
void prepareSearchPickerIndex(entries, context);
// @ts-expect-error version changes preserve the index value type
updateSearchPickerIndex(index, [{ kind: 'append', entry: { id: 'bad', label: 'Bad', value: 'wrong type' } }]);
// @ts-expect-error remove changes identify an entry by id
updateSearchPickerIndex(index, [{ kind: 'remove', entry: entries[0] }]);
// @ts-expect-error cooperative updates require batches
void prepareSearchPickerIndexUpdate(index, changes, context);
void [prepared, updated, preparedUpdate];
