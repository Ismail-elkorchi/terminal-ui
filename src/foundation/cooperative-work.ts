/** Caller-owned cancellation and scheduling for cooperative collection work. */
export interface CooperativeWorkContext {
  readonly signal: AbortSignal;
  /** Yield to the host scheduler, rather than merely another microtask. */
  readonly yield: () => Promise<void>;
  /** Injected monotonic clock. Time slicing is advisory; no ambient clock is read. */
  readonly monotonicNow?: () => number;
  /** Maximum charged work between scheduler turns (default 2048). */
  readonly operationLimit?: number;
  /** Advisory elapsed milliseconds per turn when a clock is supplied (default 4). */
  readonly timeSliceMs?: number;
}

/** Drain the same computation as prepareWork without scheduling it. */
export function finishWork<T>(work: Generator<number, T>): T {
  try {
    let step = work.next();
    while (!step.done) step = work.next();
    return step.value;
  } finally {
    work.return(undefined as T);
  }
}

/**
 * A yielded number charges actual work since the previous checkpoint. Zero is a
 * cancellation-only checkpoint. Nested yield* computations share this one
 * budget; their local counters only batch charges, never create fresh budgets.
 * Native calls, getters and callbacks remain indivisible. Their charge is
 * observed afterward, so neither the time target nor the ceiling is a promise
 * of hard preemption.
 */
export async function prepareWork<T>(work: Generator<number, T>, context: CooperativeWorkContext): Promise<T> {
  try {
    context.signal.throwIfAborted();
    const operationLimit = positiveLimit(context.operationLimit ?? 2048, 'operationLimit');
    const timeSliceMs = positiveLimit(context.timeSliceMs ?? 4, 'timeSliceMs');
    let operations = 0;
    let started = context.monotonicNow?.();
    let step = work.next();
    while (!step.done) {
      context.signal.throwIfAborted();
      if (!Number.isFinite(step.value) || step.value < 0) throw new TypeError('Cooperative work charges must be finite nonnegative numbers.');
      operations += step.value;
      const now = context.monotonicNow?.();
      if (operations >= operationLimit || (now !== undefined && started !== undefined && now - started >= timeSliceMs)) {
        await context.yield();
        context.signal.throwIfAborted();
        operations = 0;
        started = context.monotonicNow?.();
      }
      step = work.next();
    }
    context.signal.throwIfAborted();
    return step.value;
  } finally {
    work.return(undefined as T);
  }
}

function positiveLimit(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`Cooperative ${name} must be a positive finite number.`);
  return value;
}

/** Stable bottom-up merge sort reuses its two buffers across all passes. */
export function* stableSortWork<T>(
  values: Iterable<T>,
  compare: (left: T, right: T) => number,
): Generator<number, readonly T[], unknown> {
  const source: T[] = [];
  let operations = 0;
  for (const value of values) {
    source.push(value);
    if (++operations === 128) { yield operations; operations = 0; }
  }
  return (yield* mergeSortWork(source, undefined, compare, operations)).values;
}

/** Transfers private producer-owned arrays into the shared stable merge kernel.
 * Neither input may be observed or mutated while this work is suspended.
 */
export function* stableSortAlignedWork<T, U>(
  values: T[], companions: U[], compare: (left: T, right: T) => number,
): Generator<number, { readonly values: readonly T[]; readonly companions: readonly U[] }> {
  if (values.length !== companions.length) throw new RangeError('Aligned sort arrays must have equal lengths.');
  const sorted = yield* mergeSortWork(values, companions, compare, 0);
  if (sorted.companions === undefined) throw new Error('Aligned sort lost its companion buffer.');
  return { values: sorted.values, companions: sorted.companions };
}

function* mergeSortWork<T, U>(
  source: T[], companions: U[] | undefined,
  compare: (left: T, right: T) => number, pendingOperations: number,
): Generator<number, { readonly values: T[]; readonly companions: U[] | undefined }> {
  let target = new Array<T>(source.length);
  let companionTarget = companions === undefined ? undefined : new Array<U>(source.length);
  yield pendingOperations + source.length * (companions === undefined ? 1 : 2);
  let operations = 0;
  for (let width = 1; width < source.length; width *= 2) {
    for (let start = 0; start < source.length; start += width * 2) {
      const middle = Math.min(start + width, source.length);
      const end = Math.min(start + width * 2, source.length);
      let left = start;
      let right = middle;
      let output = start;
      while (left < middle || right < end) {
        const takeLeft = right >= end || (left < middle && (operations += 1, compare(source[left] as T, source[right] as T) <= 0));
        const selected = takeLeft ? left++ : right++;
        target[output] = source[selected] as T;
        if (companions !== undefined && companionTarget !== undefined) {
          companionTarget[output] = companions[selected] as U;
          operations += 1;
        }
        output += 1;
        if (++operations >= 128) { yield operations; operations = 0; }
      }
    }
    const previous = source;
    source = target;
    target = previous;
    const previousCompanions = companions;
    companions = companionTarget;
    companionTarget = previousCompanions;
  }
  if (operations !== 0) yield operations;
  return { values: source, companions };
}

/** Scan-local mutable position; never allocated per item or exposed publicly. */
export interface CollectionScanCursor<T> {
  advance(): boolean;
  readonly value: T | undefined;
  close(): void;
}
