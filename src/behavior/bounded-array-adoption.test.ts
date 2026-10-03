import assert from 'node:assert/strict';
import test from 'node:test';
import type { SearchEntry } from '../collection/item.ts';
import type { CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import {
  createSearchPickerIndex, prepareSearchPickerIndex, updateSearchPickerIndex,
  prepareSearchPickerIndexUpdate, querySearchPickerIndex, type SearchPickerIndexChange,
} from './search-picker-index.ts';
import {
  createListboxCollection, prepareListboxCollection, updateListboxCollection, prepareListboxCollectionUpdate,
} from './listbox-source.ts';
import type { ListboxCollectionChange, ListboxOption } from './listbox.ts';
import {
  createTableCollection, prepareTableCollection, updateTableCollection, prepareTableCollectionUpdate,
} from './table-operations.ts';
import type { TableCollectionChange } from './table.ts';
import {
  createTreeSource, prepareTreeSource, updateTreeSource, prepareTreeSourceUpdate, createTreeView,
} from './tree-operations.ts';
import type { TreeSource, TreeSourceEntry, TreeSourceChange } from './tree.ts';
import {
  createLogHistory, prepareLogHistory, appendLogHistory, prepareAppendLogHistory, logHistoryEntries, type LogEntry,
} from './log-history.ts';

const work = (): CooperativeWorkContext => ({ signal: new AbortController().signal, yield: () => Promise.resolve() });
const item = (id: string, onDecode?: () => void) => ({
  get id() { onDecode?.(); return id; }, label: id, value: id, text: id, kind: 'leaf' as const,
});
type Item = ReturnType<typeof item>;
const ids = (entries: readonly { readonly id: string }[]) => entries.map(entry => entry.id);
const treeIds = (source: TreeSource) => ids(createTreeView(source, { expandedIds: [], selection: { mode: 'none' } }).collection.window(0, source.nodeCount));

interface AdoptionCase {
  readonly name: string;
  readonly value: (id: string, onDecode?: () => void) => unknown;
  readonly prepare: (batches: Iterable<readonly unknown[]>, context: CooperativeWorkContext) => Promise<readonly string[]>;
  readonly create: (values: readonly unknown[]) => readonly string[];
}
const cases: readonly AdoptionCase[] = [
  {
    name: 'picker entries', value: item,
    prepare: async (batches, context) => ids(querySearchPickerIndex(await prepareSearchPickerIndex(batches as Iterable<readonly SearchEntry[]>, context)).window(0, 10_000)),
    create: values => ids(querySearchPickerIndex(createSearchPickerIndex(values as readonly SearchEntry[])).window(0, 10_000)),
  },
  {
    name: 'mapped picker entries', value: item,
    prepare: async (batches, context) => ids(querySearchPickerIndex(await prepareSearchPickerIndex(batches as Iterable<readonly SearchEntry[]>, context)).window(0, 10_000)),
    create: values => ids(querySearchPickerIndex(createSearchPickerIndex(values as readonly Item[], value => value)).window(0, 10_000)),
  },
  {
    name: 'picker changes', value: (id, onDecode) => ({ kind: 'append', entry: item(id, onDecode) }),
    prepare: async (batches, context) => ids(querySearchPickerIndex(await prepareSearchPickerIndexUpdate(createSearchPickerIndex([]), batches as Iterable<readonly SearchPickerIndexChange[]>, context)).window(0, 10_000)),
    create: values => ids(querySearchPickerIndex(updateSearchPickerIndex(createSearchPickerIndex([]), values as readonly SearchPickerIndexChange[])).window(0, 10_000)),
  },
  {
    name: 'listbox values', value: item,
    prepare: async (batches, context) => ids((await prepareListboxCollection(batches as Iterable<readonly Item[]>, value => value, context)).window(0, 10_000)),
    create: values => ids(createListboxCollection(values as readonly Item[], value => value).window(0, 10_000)),
  },
  {
    name: 'listbox changes', value: (id, onDecode) => ({ kind: 'append', value: id, option: item(id, onDecode) }),
    prepare: async (batches, context) => ids((await prepareListboxCollectionUpdate(createListboxCollection<string>([], value => ({ id: value, label: value })), batches as Iterable<readonly ListboxCollectionChange<string>[]>, context)).window(0, 10_000)),
    create: values => ids(updateListboxCollection(createListboxCollection<string>([], value => ({ id: value, label: value })), values as readonly ListboxCollectionChange<string>[]).window(0, 10_000)),
  },
  {
    name: 'table rows', value: item,
    prepare: async (batches, context) => ids((await prepareTableCollection(batches as Iterable<readonly Item[]>, value => value.id, context)).window(0, 10_000)),
    create: values => ids(createTableCollection(values as readonly Item[], value => value.id).window(0, 10_000)),
  },
  {
    name: 'table changes', value: (id, onDecode) => ({ kind: 'append', get id() { onDecode?.(); return id; }, row: id }),
    prepare: async (batches, context) => ids((await prepareTableCollectionUpdate(createTableCollection<string>([], value => value), batches as Iterable<readonly TableCollectionChange<string>[]>, context)).window(0, 10_000)),
    create: values => ids(updateTableCollection(createTableCollection<string>([], value => value), values as readonly TableCollectionChange<string>[]).window(0, 10_000)),
  },
  {
    name: 'tree entries', value: (id, onDecode) => ({ node: item(id, onDecode) }),
    prepare: async (batches, context) => treeIds(await prepareTreeSource(batches as Iterable<readonly TreeSourceEntry[]>, context)),
    create: values => treeIds(updateTreeSource(createTreeSource([]), values.map(entry => ({ kind: 'append', entry: entry as TreeSourceEntry })))),
  },
  {
    name: 'tree changes', value: (id, onDecode) => ({ kind: 'append', entry: { node: item(id, onDecode) } }),
    prepare: async (batches, context) => treeIds(await prepareTreeSourceUpdate(createTreeSource([]), batches as Iterable<readonly TreeSourceChange[]>, context)),
    create: values => treeIds(updateTreeSource(createTreeSource([]), values as readonly TreeSourceChange[])),
  },
  {
    name: 'log entries', value: item,
    prepare: async (batches, context) => ids(logHistoryEntries(await prepareLogHistory(batches as Iterable<readonly LogEntry[]>, context))),
    create: values => ids(logHistoryEntries(createLogHistory(values as readonly LogEntry[]))),
  },
  {
    name: 'log appends', value: item,
    prepare: async (batches, context) => ids(logHistoryEntries(await prepareAppendLogHistory(createLogHistory([{ id: 'base', text: 'base' }]), batches as Iterable<readonly LogEntry[]>, context))).slice(1),
    create: values => ids(logHistoryEntries(appendLogHistory(createLogHistory([{ id: 'base', text: 'base' }]), values as readonly LogEntry[]))).slice(1),
  },
];

function replaceArrayMethods(values: unknown[]): () => number {
  let iteratorReads = 0;
  Object.defineProperty(values, Symbol.iterator, { value: function* () {
    iteratorReads += 1;
    for (let index = 0; index < 4096; index += 1) yield values[0];
  } });
  for (const method of ['map', 'slice', 'entries']) Object.defineProperty(values, method, {
    get: () => assert.fail(`Caller-controlled array ${method} must not be read.`),
  });
  return () => iteratorReads;
}

for (const candidate of cases) {
  void test(`${candidate.name} adopt indexed membership without caller iteration methods`, async () => {
    for (const mode of ['prepare', 'create'] as const) {
      // Flat tree entry construction has no public eager equivalent; its eager
      // nested-node API is tested separately below.
      if (candidate.name === 'tree entries' && mode === 'create') continue;
      const values = [candidate.value('one')];
      const iteratorReads = replaceArrayMethods(values);
      const result = mode === 'prepare' ? await candidate.prepare([values], work()) : candidate.create(values);
      assert.deepEqual(result, ['one']);
      assert.equal(iteratorReads(), 0);
    }
  });

  void test(`${candidate.name} capture length once before indexed getters grow the array`, async () => {
    for (const mode of ['prepare', 'create'] as const) {
      if (candidate.name === 'tree entries' && mode === 'create') continue;
      const values = [candidate.value('one')];
      const value = values[0];
      let itemReads = 0;
      let lengthReads = 0;
      Object.defineProperty(values, 0, { get: () => { itemReads += 1; values.length = 4096; return value; } });
      const proxy = new Proxy(values, { get: (target, key, receiver): unknown => {
        if (key === 'length') lengthReads += 1;
        return Reflect.get(target, key, receiver);
      } });
      const result = mode === 'prepare' ? await candidate.prepare([proxy], work()) : candidate.create(proxy);
      assert.deepEqual(result, ['one']);
      assert.equal(itemReads, 1);
      assert.equal(lengthReads, 1);
    }
  });

  void test(`${candidate.name} snapshot membership before descriptor getters or mappers`, async () => {
    for (const mode of ['prepare', 'create'] as const) {
      const values: unknown[] = [];
      values.push(candidate.value('one', () => { values[1] = candidate.value('changed'); }), candidate.value('two'));
      const result = mode === 'prepare' ? await candidate.prepare([values], work()) : candidate.create(values);
      assert.deepEqual(result, ['one', 'two']);
    }
  });

  void test(`${candidate.name} own only the current batch before yielding`, async () => {
    const current = [candidate.value('one'), candidate.value('two')];
    const later = [candidate.value('before')];
    let yields = 0;
    const result = await candidate.prepare([current, later], {
      signal: new AbortController().signal, operationLimit: 1,
      yield: () => {
        if (yields++ === 0) {
          current[1] = candidate.value('changed');
          later[0] = candidate.value('after');
        }
        return Promise.resolve();
      },
    });
    assert.ok(yields > 0);
    assert.deepEqual(result, ['one', 'two', 'after']);
  });

  void test(`${candidate.name} reject oversized batches before reading entries`, async () => {
    const values = new Array<unknown>(257);
    Object.defineProperty(values, 0, { get: () => assert.fail('Oversized batch must be rejected before copying.') });
    await assert.rejects(candidate.prepare([values], work()), /256/u);
  });

  void test(`${candidate.name} validate sparse slots before yielding`, async () => {
    const values = [candidate.value('one')];
    values.length = 2;
    replaceArrayMethods(values);
    let yields = 0;
    await assert.rejects(candidate.prepare([values], { signal: new AbortController().signal, yield: () => { yields += 1; return Promise.resolve(); } }), TypeError);
    assert.equal(yields, 0);
  });
}

void test('nested picker and listbox keyword arrays use captured indexed membership in construction and updates', async () => {
  for (const mode of ['prepare', 'create'] as const) {
    for (const kind of ['picker', 'listbox'] as const) {
      for (const update of [false, true]) {
        const keywords = ['original'];
        let reads = 0;
        Object.defineProperty(keywords, 0, { get: () => { reads += 1; keywords.length = 4096; return 'original'; } });
        const iteratorReads = replaceArrayMethods(keywords);
        const entry = { id: 'one', label: 'one', value: 1, keywords };
        let actual: readonly string[] | undefined;
        if (kind === 'picker') {
          const source = createSearchPickerIndex<number>([]);
          const changes = [{ kind: 'append' as const, entry }];
          const result = update
            ? mode === 'prepare' ? await prepareSearchPickerIndexUpdate(source, [changes], work()) : updateSearchPickerIndex(source, changes)
            : mode === 'prepare' ? await prepareSearchPickerIndex([[entry]], work()) : createSearchPickerIndex([entry]);
          actual = querySearchPickerIndex(result).entryAt(0)?.keywords;
        } else {
          const source = createListboxCollection<number>([], value => ({ id: String(value), label: String(value) }));
          const changes = [{ kind: 'append' as const, value: 1, option: entry }];
          const result = update
            ? mode === 'prepare' ? await prepareListboxCollectionUpdate(source, [changes], work()) : updateListboxCollection(source, changes)
            : mode === 'prepare' ? await prepareListboxCollection([[1]], () => entry, work()) : createListboxCollection([1], () => entry);
          actual = result.itemAt(0)?.option.keywords;
        }
        assert.deepEqual(actual, ['original']);
        assert.equal(reads, 1);
        assert.equal(iteratorReads(), 0);
      }
    }
  }
});

void test('keyword fanout limits and sparse keyword validation survive custom iterators', async () => {
  for (const keywords of [new Array<string>(1025), new Array<string>(1)]) {
    replaceArrayMethods(keywords);
    const entry = { id: 'one', label: 'one', value: 1, keywords };
    const expected = keywords.length > 1024 ? /1024/u : /strings/u;
    await assert.rejects(prepareSearchPickerIndex([[entry]], work()), expected);
    await assert.rejects(prepareListboxCollection([[1]], () => entry, work()), expected);
  }
  const options: ListboxOption[] = [
    { id: 'one', label: 'one', keywords: new Array<string>(600).fill('x') },
    { id: 'two', label: 'two', keywords: new Array<string>(600).fill('x') },
  ];
  await assert.rejects(prepareListboxCollection([options], option => option, work()), /1024/u);
});

void test('eager tree roots and nested children ignore overridden array methods and length growth', () => {
  const children = [item('child')];
  const child = children[0];
  Object.defineProperty(children, 0, { get: () => { children.length = 4096; return child; } });
  const childIteratorReads = replaceArrayMethods(children);
  const roots = [{ id: 'root', label: 'root', kind: 'branch' as const, children }];
  const rootIteratorReads = replaceArrayMethods(roots);
  const source = createTreeSource(roots);
  assert.equal(source.nodeCount, 2);
  assert.equal(rootIteratorReads(), 0);
  assert.equal(childIteratorReads(), 0);
});

void test('explicit eager construction still accepts more than one batch and unbounded keyword counts', () => {
  const entries = Array.from({ length: 257 }, (_, index) => ({ ...item(String(index)), keywords: index === 0 ? new Array<string>(1025).fill('keyword') : [] }));
  assert.equal(createSearchPickerIndex(entries).size, 257);
  assert.equal(createListboxCollection(entries, value => value).count, 257);
  assert.equal(createTableCollection(entries, value => value.id).count, 257);
  assert.equal(createTreeSource(entries).nodeCount, 257);
  assert.equal(createLogHistory(entries).entryCount, 257);
});

void test('nested keyword lengths are captured once before copying or charging the batch budget', async () => {
  for (const kind of ['picker', 'listbox'] as const) {
    let lengthReads = 0;
    const keywords = new Proxy(['original'], { get: (target, key, receiver): unknown => {
      if (key === 'length') return ++lengthReads === 1 ? 1 : 4096;
      return Reflect.get(target, key, receiver);
    } });
    const entry = { id: 'one', label: 'one', value: 1, keywords };
    const actual = kind === 'picker'
      ? querySearchPickerIndex(await prepareSearchPickerIndex([[entry]], work())).entryAt(0)?.keywords
      : (await prepareListboxCollection([[1]], () => entry, work())).itemAt(0)?.option.keywords;
    assert.deepEqual(actual, ['original']);
    assert.equal(lengthReads, 1);
  }
});

void test('table changes own only their fixed descriptor fields', async () => {
  const change = { kind: 'append' as const, id: 'one', row: 'one', get unrelated() { return assert.fail('Extra descriptor properties are not adopted.'); } };
  const source = createTableCollection<string>([], value => value);
  assert.equal((await prepareTableCollectionUpdate(source, [[change]], work())).count, 1);
  assert.equal(updateTableCollection(source, [change]).count, 1);
});
