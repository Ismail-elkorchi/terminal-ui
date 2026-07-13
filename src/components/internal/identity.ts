export function resolveStableIds<TValue>(
  values: readonly TValue[],
  getId: (value: TValue, index: number) => string,
  owner: string
): readonly string[] {
  const ids = values.map((value, index) => getId(value, index));
  const seen = new Set<string>();
  for (const id of ids) {
    if (id.length === 0) throw new TypeError(`${owner} item ids must not be empty.`);
    if (seen.has(id)) throw new TypeError(`${owner} item ids must be unique; duplicate id: ${id}`);
    seen.add(id);
  }
  return ids;
}
