const verifiedImmutablePreparedValues = new WeakSet<object>();

export function immutablePreparedModel(
  value: Readonly<Record<string, unknown>>,
  component: string
): Readonly<Record<string, unknown>> {
  const seen = new WeakMap<object, unknown>();
  const clone = (current: unknown, path: string): unknown => {
    if (current === null || typeof current !== 'object') return current;
    if (verifiedImmutablePreparedValues.has(current)) return current;
    const cached = seen.get(current);
    if (cached !== undefined) return cached;
    if (Object.isFrozen(current) && Reflect.ownKeys(current).length === 0) {
      verifiedImmutablePreparedValues.add(current);
      return current;
    }
    if (Array.isArray(current)) {
      const target: unknown[] = [];
      seen.set(current, target);
      let unchanged = Object.isFrozen(current) && hasOnlyImmutableArrayEntries(current);
      for (const [index, entry] of current.entries()) {
        const prepared = clone(entry, `${path}[${String(index)}]`);
        target.push(prepared);
        unchanged &&= prepared === entry;
      }
      if (unchanged) {
        seen.set(current, current);
        verifiedImmutablePreparedValues.add(current);
        return current;
      }
      const prepared = Object.freeze(target);
      verifiedImmutablePreparedValues.add(prepared);
      return prepared;
    }
    const prototype = Reflect.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(
        `Component "${component}" prepared model ${path} must contain only immutable plain objects and arrays.`
      );
    }
    const target: Record<string, unknown> = {};
    seen.set(current, target);
    let unchanged = Object.isFrozen(current) && hasOnlyImmutableObjectFields(current);
    for (const [field, entry] of Object.entries(current)) {
      const prepared = clone(entry, `${path}.${field}`);
      target[field] = prepared;
      unchanged &&= prepared === entry;
    }
    if (unchanged) {
      seen.set(current, current);
      verifiedImmutablePreparedValues.add(current);
      return current;
    }
    const prepared = Object.freeze(target);
    verifiedImmutablePreparedValues.add(prepared);
    return prepared;
  };
  return clone(value, '$') as Readonly<Record<string, unknown>>;
}

function hasOnlyImmutableArrayEntries(value: readonly unknown[]): boolean {
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys[keys.length - 1] !== 'length') return false;
  return value.every((_entry, index) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    return descriptor?.enumerable === true && 'value' in descriptor;
  });
}

function hasOnlyImmutableObjectFields(value: object): boolean {
  return Reflect.ownKeys(value).every((field) => {
    if (typeof field !== 'string') return false;
    const descriptor = Reflect.getOwnPropertyDescriptor(value, field);
    return descriptor?.enumerable === true && 'value' in descriptor;
  });
}
