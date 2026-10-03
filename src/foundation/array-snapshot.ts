/** Own indexed membership without executing an array's replaceable iteration methods. */
export function snapshotArray<T>(values: readonly T[], length = values.length): T[] {
  if (!Number.isSafeInteger(length) || length < 0) throw new TypeError('Array length must be a non-negative safe integer.');
  const result = new Array<T>(length);
  for (let index = 0; index < length; index += 1) result[index] = values[index] as T;
  return result;
}
