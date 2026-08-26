export interface EditHistoryPolicy {
  readonly maxEntries: number;
  readonly maxRetainedBytes: number;
}

export interface EditHistoryEntry<TSnapshot> {
  readonly snapshot: TSnapshot;
  readonly retainedBytes: number;
}

export interface BoundedEditHistory<TSnapshot, TGroup extends string = string> {
  readonly policy: EditHistoryPolicy;
  readonly undo: readonly EditHistoryEntry<TSnapshot>[];
  readonly redo: readonly EditHistoryEntry<TSnapshot>[];
  readonly retainedBytes: number;
  readonly currentGroup?: TGroup;
}

export interface EditHistoryTransition<TSnapshot, TGroup extends string = string> {
  readonly snapshot?: TSnapshot;
  readonly history: BoundedEditHistory<TSnapshot, TGroup>;
}

export const defaultEditHistoryPolicy: EditHistoryPolicy = Object.freeze({
  maxEntries: 100,
  maxRetainedBytes: 1_048_576
});

export function createBoundedEditHistory<TSnapshot, TGroup extends string = string>(
  policy: EditHistoryPolicy = defaultEditHistoryPolicy
): BoundedEditHistory<TSnapshot, TGroup> {
  return Object.freeze({
    policy: normalizeEditHistoryPolicy(policy),
    undo: Object.freeze([]),
    redo: Object.freeze([]),
    retainedBytes: 0
  });
}

export function recordEditHistory<TSnapshot, TGroup extends string>(
  history: BoundedEditHistory<TSnapshot, TGroup>,
  snapshot: TSnapshot,
  retainedBytes: number,
  group?: TGroup
): BoundedEditHistory<TSnapshot, TGroup> {
  const entry = historyEntry(snapshot, retainedBytes);
  const undo = group !== undefined && history.currentGroup === group
    ? history.undo
    : boundHistoryEntries([...history.undo, entry], history.policy);
  return historyValue(history.policy, undo, [], group);
}

export function replaceEditHistoryGroup<TSnapshot, TGroup extends string>(
  history: BoundedEditHistory<TSnapshot, TGroup>,
  snapshot: TSnapshot,
  retainedBytes: number,
  group: TGroup
): BoundedEditHistory<TSnapshot, TGroup> {
  if (history.currentGroup !== group || history.undo.length === 0) {
    return recordEditHistory(history, snapshot, retainedBytes, group);
  }
  const undo = boundHistoryEntries([
    ...history.undo.slice(0, -1),
    historyEntry(snapshot, retainedBytes)
  ], history.policy);
  return historyValue(history.policy, undo, [], undo.length === 0 ? undefined : group);
}

export function breakEditHistoryGroup<TSnapshot, TGroup extends string>(
  history: BoundedEditHistory<TSnapshot, TGroup>
): BoundedEditHistory<TSnapshot, TGroup> {
  if (history.currentGroup === undefined) return history;
  return historyValue(history.policy, history.undo, history.redo);
}

export function undoEditHistory<TSnapshot, TGroup extends string>(
  history: BoundedEditHistory<TSnapshot, TGroup>,
  current: TSnapshot,
  currentRetainedBytes: number
): EditHistoryTransition<TSnapshot, TGroup> {
  const previous = history.undo.at(-1);
  if (previous === undefined) return { history: breakEditHistoryGroup(history) };
  const undo = history.undo.slice(0, -1);
  const redo = boundHistoryEntries(
    [...history.redo, historyEntry(current, currentRetainedBytes)],
    history.policy,
    undo
  );
  return {
    snapshot: previous.snapshot,
    history: historyValue(history.policy, undo, redo)
  };
}

export function redoEditHistory<TSnapshot, TGroup extends string>(
  history: BoundedEditHistory<TSnapshot, TGroup>,
  current: TSnapshot,
  currentRetainedBytes: number
): EditHistoryTransition<TSnapshot, TGroup> {
  const next = history.redo.at(-1);
  if (next === undefined) return { history: breakEditHistoryGroup(history) };
  const redo = history.redo.slice(0, -1);
  const undo = boundHistoryEntries(
    [...history.undo, historyEntry(current, currentRetainedBytes)],
    history.policy,
    redo
  );
  return {
    snapshot: next.snapshot,
    history: historyValue(history.policy, undo, redo)
  };
}

function normalizeEditHistoryPolicy(policy: EditHistoryPolicy): EditHistoryPolicy {
  return Object.freeze({
    maxEntries: nonNegativeInteger(policy.maxEntries, 'edit history maxEntries'),
    maxRetainedBytes: nonNegativeInteger(
      policy.maxRetainedBytes,
      'edit history maxRetainedBytes'
    )
  });
}

function historyEntry<TSnapshot>(
  snapshot: TSnapshot,
  retainedBytes: number
): EditHistoryEntry<TSnapshot> {
  return Object.freeze({
    snapshot,
    retainedBytes: nonNegativeInteger(retainedBytes, 'edit history retainedBytes')
  });
}

function boundHistoryEntries<TSnapshot>(
  entries: readonly EditHistoryEntry<TSnapshot>[],
  policy: EditHistoryPolicy,
  retained: readonly EditHistoryEntry<TSnapshot>[] = []
): readonly EditHistoryEntry<TSnapshot>[] {
  const retainedCount = retained.length;
  const retainedBytes = sumBytes(retained);
  const availableEntries = Math.max(0, policy.maxEntries - retainedCount);
  const availableBytes = Math.max(0, policy.maxRetainedBytes - retainedBytes);
  let start = Math.max(0, entries.length - availableEntries);
  let bytes = sumBytes(entries.slice(start));
  while (start < entries.length && bytes > availableBytes) {
    bytes -= entries[start]?.retainedBytes ?? 0;
    start += 1;
  }
  return Object.freeze(entries.slice(start));
}

function historyValue<TSnapshot, TGroup extends string>(
  policy: EditHistoryPolicy,
  undo: readonly EditHistoryEntry<TSnapshot>[],
  redo: readonly EditHistoryEntry<TSnapshot>[],
  currentGroup?: TGroup
): BoundedEditHistory<TSnapshot, TGroup> {
  return Object.freeze({
    policy,
    undo: Object.freeze([...undo]),
    redo: Object.freeze([...redo]),
    retainedBytes: sumBytes(undo) + sumBytes(redo),
    ...(currentGroup === undefined ? {} : { currentGroup })
  });
}

function sumBytes<TSnapshot>(entries: readonly EditHistoryEntry<TSnapshot>[]): number {
  let bytes = 0;
  for (const entry of entries) bytes += entry.retainedBytes;
  return bytes;
}

function nonNegativeInteger(value: number, owner: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${owner} must be a non-negative safe integer.`);
  }
  return value;
}
