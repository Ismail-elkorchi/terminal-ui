import { orderedItemByIdWork, createOrderedSourceWork, type OrderedSource } from '../foundation/ordered-source.ts';
import { createCollectionInteractionIndexFromSource } from '../interaction/collection-interaction.ts';
import { finishWork, prepareWork, type CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import { compileCollectionQueryWork, queryIndexedCandidatesWork, matchCompiledCollectionQueryFieldWork, sameCollectionQueryRequest, ownCollectionQueryRequest, type CollectionQuery, type QueryMatchRange } from '../text/query.ts';
import { readListboxSource, type ListboxSourceValue } from './listbox-source.ts';
import type { ListboxCollection, ListboxView, ListboxViewEntry } from './listbox.ts';

const views = new WeakMap<object, { readonly order: OrderedSource<ListboxSourceValue<unknown>>; readonly request: CollectionQuery }>();
const cache = new WeakMap<object, Map<string, ListboxView<unknown>>>();
export function createListboxView<T>(collection: ListboxCollection<T>, options?: { readonly query?: CollectionQuery }): ListboxView<T> {
  return finishWork(viewWork(collection, options?.query));
}
export function prepareListboxView<T>(collection: ListboxCollection<T>, options: { readonly query?: CollectionQuery }, context: CooperativeWorkContext): Promise<ListboxView<T>> {
  return prepareWork(viewWork(collection, options.query), context);
}
export function matchingListboxView<T>(collection: ListboxCollection<T>, query: CollectionQuery | undefined, view: ListboxView<T> | null): ListboxView<T> | undefined {
  readListboxSource(collection);
  if (view === null) return undefined;
  const data = views.get(view);
  if (data === undefined) throw new TypeError('Listbox view must be prepared by terminal-ui.');
  return view.source === collection && (collection.kind === 'window' ? query === undefined : sameCollectionQueryRequest(data.request, query)) ? view : undefined;
}
export function listboxViewScrollPosition<T>(view: ListboxView<T>, id: string): number | undefined {
  return view.entryById(id)?.visibleIndex;
}
function* viewWork<T>(collection: ListboxCollection<T>, requested?: CollectionQuery): Generator<number, ListboxView<T>> {
  const source = readListboxSource(collection);
  if (collection.kind === 'window' && requested !== undefined) throw new TypeError('Windowed listbox collections own their filter query.');
  const request = ownCollectionQueryRequest(collection.kind === 'window' && collection.scope.kind === 'query' ? collection.scope.query ?? { text: '' } : requested ?? { text: '' });
  const query = yield* compileCollectionQueryWork(request);
  const key = JSON.stringify([request.text, query.mode, query.caseSensitive]);
  const byQuery = cache.get(collection) ?? new Map<string, ListboxView<unknown>>();
  const cached = byQuery.get(key) as ListboxView<T> | undefined;
  if (cached !== undefined) return cached;
  let order = source;
  const highlights = new Map<string, readonly QueryMatchRange[]>();
  if (collection.kind !== 'window' && query.text.length > 0) {
    const matches = yield* queryIndexedCandidatesWork(source.values(), query);
    function* rankedItems() {
      for (const match of matches) {
        const item = yield* orderedItemByIdWork(source, match.id);
        if (item === undefined) continue;
        const primary = yield* matchCompiledCollectionQueryFieldWork(item, query, 0);
        if (primary !== undefined) highlights.set(item.id, primary.ranges);
        yield { id: item.id, value: item, disabled: item.option.disabled };
        yield 1;
      }
    }
    order = yield* createOrderedSourceWork(rankedItems());
  }

  const entryAt = (rank: number): ListboxViewEntry<T> | undefined => {
    const item = order.itemAt(rank);
    if (item === undefined) return undefined;
    const itemIndex = (source.rank(item.id) ?? 0) + collection.startIndex;
    const selectableIndex = order.enabledRank(item.id);
    const matches = highlights.get(item.id);
    return Object.freeze({ ...item, itemIndex, visibleIndex: collection.kind === 'window' ? itemIndex : rank,
      ...(selectableIndex === undefined ? {} : { selectableIndex }), ...(matches === undefined ? {} : { matches }),
    });
  };
  const view = Object.freeze({ kind: 'listbox-view' as const, source: collection, query, count: order.count,
    entryAt, entryById: (id: string) => { const rank = order.rank(id); return rank === undefined ? undefined : entryAt(rank); },
    window: (start: number, end: number) => Object.freeze(Array.from({ length: Math.max(0, Math.min(order.count, end) - Math.max(0, start)) }, (_, offset) => { const entry = entryAt(Math.max(0, start) + offset); if (entry === undefined) throw new RangeError('Listbox rank is outside the view.'); return entry; })),
    interactionIndex: createCollectionInteractionIndexFromSource(order), startIndex: collection.startIndex,
    totalCount: collection.kind === 'window' ? collection.totalCount : order.count,
  });
  views.set(view, { order, request });
  byQuery.set(key, view);
  let count = 0;
  for (const retained of byQuery.values()) count += retained.query.text.length === 0 ? 0 : retained.count;
  while (byQuery.size > 1 && (byQuery.size > 8 || count > 8192)) {
    const oldest = byQuery.entries().next().value;
    if (oldest === undefined) break;
    byQuery.delete(oldest[0]); count -= oldest[1].query.text.length === 0 ? 0 : oldest[1].count;
  }
  cache.set(collection, byQuery);
  return view;
}
