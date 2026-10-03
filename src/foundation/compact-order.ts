import { ownCollectionOrderReader, type CollectionOrderReader } from './order-reader.ts';

interface ProjectionItem<T> { readonly id: string; readonly value: T; readonly disabled?: boolean }

/** Immutable derived order: one reference vector and identity/rank table.
 * Sources retain persistent update ownership separately. Payloads are already
 * owned by the producer. Nothing escapes until all cooperative work finishes.
 */
export function* createCompactOrderWork<T>(events: Iterable<ProjectionItem<T> | number>): Generator<number, CollectionOrderReader<T>> {
  const items: T[] = [];
  const ranks = new Map<string, number>();
  let enabled: number[] | undefined;
  let enabledRanks: number[] | undefined;
  for (const event of events) {
    if (typeof event === 'number') { yield event; continue; }
    // Native Map hashing is indivisible; account for long identities before it.
    for (let offset = 0; offset < event.id.length; offset += 256) yield Math.min(256, event.id.length - offset);
    if (ranks.has(event.id)) throw new TypeError(`Collection ids must be unique; duplicate id: ${event.id}`);
    const rank = items.length;
    if (event.disabled === true && enabled === undefined) {
      enabled = [];
      enabledRanks = [];
      for (let prior = 0; prior < rank; prior += 1) {
        enabled.push(prior); enabledRanks.push(prior);
        if ((prior + 1) % 128 === 0) yield 128;
      }
      yield rank % 128;
    }
    ranks.set(event.id, rank);
    items.push(event.value);
    if (enabled !== undefined && enabledRanks !== undefined) {
      enabledRanks.push(event.disabled === true ? -1 : enabled.length);
      if (event.disabled !== true) enabled.push(rank);
    }
    yield 1;
  }
  // Finalization is indivisible but cancellation is observed before publication.
  yield items.length;
  Object.freeze(items);
  const itemAt = (rank: number): T | undefined => Number.isSafeInteger(rank) ? items[rank] : undefined;
  const values = function* (start = 0, end = items.length): IterableIterator<T> {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) throw new RangeError('Collection window bounds must be safe integer ranks.');
    for (let rank = Math.max(0, start); rank < Math.min(end, items.length); rank += 1) yield items[rank] as T;
  };
  return ownCollectionOrderReader({
    kind: 'ordered-source', count: items.length, enabledCount: enabled?.length ?? items.length,
    itemAt, itemById: id => { const rank = ranks.get(id); return rank === undefined ? undefined : items[rank]; },
    rank: id => ranks.get(id),
    enabledAt: rank => enabled === undefined ? itemAt(rank) : Number.isSafeInteger(rank) ? itemAt(enabled[rank] ?? -1) : undefined,
    enabledRank: id => { const rank = ranks.get(id); if (rank === undefined) return undefined; const result = enabledRanks?.[rank] ?? rank; return result < 0 ? undefined : result; },
    window: (start, end) => Object.freeze(Array.from(values(start, end))), values,
  }, 96 + items.length * 40 + (enabled === undefined ? 0 : (enabled.length + items.length) * 8), () => {
    let rank = 0;
    let value: T | undefined;
    return {
      get value() { return value; },
      advance() {
        if (rank >= items.length) { value = undefined; return false; }
        value = items[rank++];
        return true;
      },
      close() { rank = items.length; value = undefined; },
    };
  });
}
