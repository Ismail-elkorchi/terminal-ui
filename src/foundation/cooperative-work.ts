/** Caller-owned cancellation and scheduling for bounded collection work. */
export interface CooperativeWorkContext {
  readonly signal: AbortSignal;
  readonly yield: () => Promise<void>;
}

export function finishWork<T>(work: Generator<void, T>): T {
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}

export async function prepareWork<T>(work: Generator<void, T>, context: CooperativeWorkContext): Promise<T> {
  try {
    context.signal.throwIfAborted();
    let step = work.next();
    while (!step.done) {
      await context.yield();
      context.signal.throwIfAborted();
      step = work.next();
    }
    context.signal.throwIfAborted();
    return step.value;
  } finally {
    work.return(undefined as T);
  }
}

/** Stable bottom-up merge sort without an uninterruptible whole-array sort. */
export function* stableSortWork<T>(
  values: Iterable<T>,
  compare: (left: T, right: T) => number,
): Generator<void, readonly T[], unknown> {
  let source: T[] = [];
  let operations = 0;
  for (const value of values) {
    source.push(value);
    if (++operations % 256 === 0) yield;
  }
  for (let width = 1; width < source.length; width *= 2) {
    const target: T[] = [];
    for (let start = 0; start < source.length; start += width * 2) {
      const middle = Math.min(start + width, source.length);
      const end = Math.min(start + width * 2, source.length);
      let left = start;
      let right = middle;
      while (left < middle || right < end) {
        if (right >= end || (left < middle && compare(source[left] as T, source[right] as T) <= 0)) {
          target.push(source[left++] as T);
        } else target.push(source[right++] as T);
        if (++operations % 256 === 0) yield;
      }
    }
    source = target;
  }
  return source;
}
