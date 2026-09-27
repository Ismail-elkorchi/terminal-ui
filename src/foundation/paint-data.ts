/** Opaque handles and functions require identity; normalized plain data may compare by value. */
export function samePaintData(left: unknown, right: unknown, remaining = { count: 4096 }): boolean {
  if (Object.is(left, right)) return true;
  if (--remaining.count < 0 || typeof left !== 'object' || left === null
    || typeof right !== 'object' || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => samePaintData(value, right[index], remaining));
  }
  if (Object.getPrototypeOf(left) !== Object.prototype || Object.getPrototypeOf(right) !== Object.prototype) return false;
  const a = left as Readonly<Record<string, unknown>>;
  const b = right as Readonly<Record<string, unknown>>;
  // Branded framework resources may have their payload in a private WeakMap.
  if ('kind' in a || 'kind' in b || Object.getOwnPropertySymbols(left).length > 0
    || Object.getOwnPropertySymbols(right).length > 0) return false;
  const keys = Object.keys(a);
  return keys.length > 0 && keys.length === Object.keys(b).length
    && keys.every(key => Object.hasOwn(b, key) && samePaintData(a[key], b[key], remaining));
}
