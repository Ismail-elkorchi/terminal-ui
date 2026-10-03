import { snapshotArray } from '../foundation/array-snapshot.ts';
import { orderedItemByIdWork, createOrderedSourceWork, appendOrderedItemsWork, replaceOrderedItemWork, removeOrderedItemsWork, type OrderedSource } from '../foundation/ordered-source.ts';
import { createWindowedCollection, type CollectionWindow } from '../collection/snapshot.ts';
import { finishWork, prepareWork, type CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import { sanitizeTerminalTextWork } from '../text/sanitize.ts';
import { indexJoinedQueryFieldsWork } from '../text/query.ts';
import type { ListboxCollection, CompleteListboxCollection, WindowedListboxCollection, ListboxCollectionItem, ListboxOptionMapper, ListboxCollectionChange, ListboxOption } from './listbox.ts';

export interface ListboxSourceValue<T> { readonly id: string; readonly value: T; readonly option: ListboxCollectionItem<T>['option'] }
const sources = new WeakMap<object, OrderedSource<ListboxSourceValue<unknown>>>();
const windowSources = new WeakMap<object, OrderedSource<ListboxSourceValue<unknown>>>();
export function readListboxSource<T>(source: ListboxCollection<T>): OrderedSource<ListboxSourceValue<T>> {
  const result = sources.get(source) ?? windowSources.get(source);
  if (result === undefined) throw new TypeError('Listbox collection must be created with createListboxCollection().');
  return result as OrderedSource<ListboxSourceValue<T>>;
}
export function isListboxCollection(value: unknown): value is ListboxCollection<unknown> { return sources.has(value as object) || windowSources.has(value as object); }
export function createListboxCollection<T>(values: readonly T[], toOption: ListboxOptionMapper<T>): CompleteListboxCollection<T>;
export function createListboxCollection<T>(values: readonly T[], toOption: ListboxOptionMapper<T>, window: CollectionWindow): WindowedListboxCollection<T>;
export function createListboxCollection<T>(values: readonly T[], toOption: ListboxOptionMapper<T>, window?: CollectionWindow): ListboxCollection<T> {
  const source = finishWork(buildWork(eagerBatches(values), toOption, window?.startIndex ?? 0, false));
  if (window === undefined) return source;
  const order = readListboxSource(source);
  const snapshot = createWindowedCollection({ items: source.window(0, source.count).map(item => ({ ...item, itemIndex: window.startIndex + item.itemIndex })), window });
  windowSources.set(snapshot, order);
  return snapshot;
}
/** Each bounded batch is owned before normalization yields. Payloads remain immutable application values. */
export function prepareListboxCollection<T>(batches: Iterable<readonly T[]>, toOption: ListboxOptionMapper<T>, context: CooperativeWorkContext): Promise<CompleteListboxCollection<T>> {
  return prepareWork(buildWork(batches, toOption, 0), context);
}
export function updateListboxCollection<T>(source: CompleteListboxCollection<T>, changes: readonly ListboxCollectionChange<T>[]): CompleteListboxCollection<T> {
  return finishWork(updateWork(source, eagerBatches(changes), false));
}
export function prepareListboxCollectionUpdate<T>(source: CompleteListboxCollection<T>, batches: Iterable<readonly ListboxCollectionChange<T>[]>, context: CooperativeWorkContext): Promise<CompleteListboxCollection<T>> {
  return prepareWork(updateWork(source, batches), context);
}
function* eagerBatches<T>(values: readonly T[]): IterableIterator<readonly T[]> {
  if (!Array.isArray(values)) throw new TypeError('Listbox values must be an array.');
  const owned = snapshotArray(values);
  for (let offset = 0; offset < owned.length; offset += 256) yield owned.slice(offset, offset + 256);
}
function ownOption(input: unknown, budget: { keywords: number; limit: number }): ListboxOption {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Listbox option must be an object.');
  const { id, label, description, keywords, disabled } = input as Record<string, unknown>;
  if (typeof id !== 'string' || typeof label !== 'string' || description !== undefined && typeof description !== 'string') throw new TypeError('Listbox option text fields must be strings.');
  if (disabled !== undefined && typeof disabled !== 'boolean') throw new TypeError('Listbox option disabled must be boolean.');
  let ownedKeywords: readonly string[] | undefined;
  if (keywords !== undefined) {
    if (!Array.isArray(keywords)) throw new TypeError('Listbox keywords must be an array of strings.');
    const length = keywords.length;
    if ((budget.keywords += length) > budget.limit) throw new TypeError('Listbox batches must contain at most 1024 keywords.');
    ownedKeywords = Object.freeze(snapshotArray(keywords, length).map(keyword => {
      if (typeof keyword !== 'string') throw new TypeError('Listbox keywords must be strings.'); return keyword;
    }));
  }
  return Object.freeze({ id, label, disabled: disabled === true, ...(description === undefined ? {} : { description }), ...(ownedKeywords === undefined ? {} : { keywords: ownedKeywords }) });
}
function* normalizeWork<T>(value: T, supplied: ListboxOption): Generator<number, ListboxSourceValue<T>> {
  const id = yield* inlineTextWork(supplied.id);
  if (id.trim().length === 0) throw new TypeError('Listbox option id must be non-empty.');
  const label = yield* inlineTextWork(supplied.label);
  const description = supplied.description === undefined ? undefined : yield* inlineTextWork(supplied.description);
  const keywords: string[] = [];
  for (const keyword of supplied.keywords ?? []) { keywords.push(yield* inlineTextWork(keyword)); yield 1; }
  const option = Object.freeze({ id, label, disabled: supplied.disabled === true, ...(description === undefined ? {} : { description }), ...(supplied.keywords === undefined ? {} : { keywords: Object.freeze(keywords) }) });
  const item = Object.freeze({ id, value, option });
  yield* indexJoinedQueryFieldsWork(item, optionFields(option));
  return item;
}
function* optionFields(option: ListboxOption): IterableIterator<string> {
  yield option.label;
  if (option.description !== undefined) yield option.description;
  yield* option.keywords ?? [];
}
function* buildWork<T>(batches: Iterable<readonly T[]>, toOption: ListboxOptionMapper<T>, startIndex: number, bounded = true): Generator<number, CompleteListboxCollection<T>> {
  function* events() {
    let count = 0;
    for (const batch of batches) {
      if (!Array.isArray(batch)) throw new TypeError('Listbox batches must contain at most 256 values.');
      const length = batch.length;
      if (length > 256) throw new TypeError('Listbox batches must contain at most 256 values.');
      const budget = { keywords: 0, limit: bounded ? 1024 : Number.POSITIVE_INFINITY };
      const owned = snapshotArray<T>(batch, length).map((value, offset) => ({ value, option: ownOption(toOption(value, startIndex + count + offset), budget) }));
      for (const input of owned) {
        const value = yield* normalizeWork(input.value, input.option);
        yield { id: value.id, value, disabled: value.option.disabled };
        count += 1; yield 1;
      }
      yield 1;
    }
  }
  return sourceFrom(yield* createOrderedSourceWork(events()));
}

function* updateWork<T>(source: CompleteListboxCollection<T>, batches: Iterable<readonly ListboxCollectionChange<T>[]>, bounded = true): Generator<number, CompleteListboxCollection<T>> {
  const previous = readListboxSource(source);
  let order = previous;
  for (const batch of batches) {
    if (!Array.isArray(batch)) throw new TypeError('Listbox change batches must contain at most 256 changes.');
    const length = batch.length;
    if (length > 256) throw new TypeError('Listbox change batches must contain at most 256 changes.');
    const budget = { keywords: 0, limit: bounded ? 1024 : Number.POSITIVE_INFINITY };
    const owned = snapshotArray<ListboxCollectionChange<T>>(batch, length).map((change): ListboxCollectionChange<T> => {
      const candidate: unknown = change;
      if (candidate === null || typeof candidate !== 'object' || !['append', 'replace', 'remove'].includes(change.kind)) throw new TypeError('Listbox change is invalid.');
      if (change.kind === 'remove') { if (typeof change.id !== 'string') throw new TypeError('Listbox removal id must be a string.'); return { kind: 'remove', id: change.id }; }
      return { kind: change.kind, value: change.value, option: ownOption(change.option, budget) };
    });
    for (const change of owned) {
      if (change.kind === 'remove') {
        if ((yield* orderedItemByIdWork(order, change.id)) === undefined) throw new TypeError('Listbox removal id must exist.');
        order = yield* removeOrderedItemsWork(order, [change.id]);
      } else {
        const value = yield* normalizeWork(change.value, change.option);
        const item = { id: value.id, value, disabled: value.option.disabled };
        order = change.kind === 'append' ? yield* appendOrderedItemsWork(order, [item]) : yield* replaceOrderedItemWork(order, item);
      }
      yield 1;
    }
    yield 1;
  }
  return order === previous ? source : sourceFrom(order);
}
function sourceFrom<T>(order: OrderedSource<ListboxSourceValue<T>>): CompleteListboxCollection<T> {
  const item = (value: ListboxSourceValue<T> | undefined, rank: number | undefined) => value === undefined || rank === undefined ? undefined : Object.freeze({ ...value, itemIndex: rank });
  const source = Object.freeze({ kind: 'listbox-source' as const, count: order.count, startIndex: 0 as const, totalCount: order.count,
    itemAt: (rank: number) => item(order.itemAt(rank), rank),
    itemById: (id: string) => item(order.itemById(id), order.rank(id)), rank: order.rank,
    window: (start: number, end: number) => Object.freeze(Array.from(order.values(start, end), (value, offset) => item(value, Math.max(0, start) + offset) as ListboxCollectionItem<T>)),
  }) as CompleteListboxCollection<T>;
  sources.set(source, order);
  return source;
}

function* inlineTextWork(value: string): Generator<number, string> {
  const text = (yield* sanitizeTerminalTextWork(value)).text;
  const parts: string[] = [];
  let retained = 0;
  let whitespace = -1;
  let newline = false;
  for (let offset = 0; offset <= text.length; offset++) {
    const character = text[offset];
    if (character !== undefined && /\s/u.test(character)) {
      if (whitespace < 0) whitespace = offset;
      if (character === '\n') newline = true;
    } else if (whitespace >= 0) {
      if (newline) { parts.push(text.slice(retained, whitespace), ' '); retained = offset; }
      whitespace = -1; newline = false;
    }
    if ((offset + 1) % 256 === 0) yield 256;
  }
  yield (text.length + 1) % 256;
  if (parts.length === 0) return text;
  parts.push(text.slice(retained));
  return parts.join('');
}
