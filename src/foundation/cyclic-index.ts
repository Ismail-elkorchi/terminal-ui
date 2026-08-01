export function cyclicIndex(index: number, length: number): number {
  if (!Number.isSafeInteger(length) || length <= 0) return 0;
  const normalized = Number.isFinite(index) ? Math.trunc(index) : 0;
  return ((normalized % length) + length) % length;
}
