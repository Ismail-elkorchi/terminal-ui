export function assertTrackCount(
  kind: 'column' | 'row',
  sizes: readonly unknown[] | undefined,
  childCount: number,
): void {
  if (sizes !== undefined && sizes.length !== childCount) {
    throw new RangeError(
      `${kind} sizes length ${String(sizes.length)} must match child count ${String(childCount)}.`,
    );
  }
}
