const verifiedImmutablePreparedValues = new WeakSet<object>();
const maximumPreparedModelDepth = 256;
const maximumPreparedModelNodes = 1_000_000;

export function immutablePreparedModel(
  value: Readonly<Record<string, unknown>>,
  component: string
): Readonly<Record<string, unknown>> {
  const seen = new WeakMap<object, unknown>();
  let nodes = 0;
  const clone = (current: unknown, path: string, depth: number): unknown => {
    if (current === null || typeof current !== 'object') return current;
    if (verifiedImmutablePreparedValues.has(current)) return current;
    const cached = seen.get(current);
    if (cached !== undefined) return cached;
    nodes += 1;
    if (nodes > maximumPreparedModelNodes) {
      throw new RangeError(
        `Component "${component}" prepared model exceeds ${String(maximumPreparedModelNodes)} object nodes.`
      );
    }
    if (depth > maximumPreparedModelDepth) {
      throw new RangeError(
        `Component "${component}" prepared model exceeds ${String(maximumPreparedModelDepth)} nested levels at ${path}.`
      );
    }
    if (Array.isArray(current)) {
      if (Reflect.getPrototypeOf(current) !== Array.prototype || !hasOnlyImmutableArrayEntries(current)) {
        throw unsupportedPreparedValue(component, path);
      }
      const target: unknown[] = [];
      seen.set(current, target);
      let unchanged = Object.isFrozen(current);
      for (const [index, entry] of current.entries()) {
        const prepared = clone(entry, `${path}[${String(index)}]`, depth + 1);
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
    if (
      (prototype !== Object.prototype && prototype !== null)
      || !hasOnlyImmutableObjectFields(current)
    ) {
      throw unsupportedPreparedValue(component, path);
    }
    if (Object.isFrozen(current) && Reflect.ownKeys(current).length === 0) {
      verifiedImmutablePreparedValues.add(current);
      return current;
    }
    const target: Record<string, unknown> = {};
    seen.set(current, target);
    let unchanged = Object.isFrozen(current);
    for (const [field, entry] of Object.entries(current)) {
      const prepared = clone(entry, `${path}.${field}`, depth + 1);
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
  return clone(value, '$', 0) as Readonly<Record<string, unknown>>;
}

function unsupportedPreparedValue(component: string, path: string): TypeError {
  return new TypeError(
    `Component "${component}" prepared model ${path} must contain only plain objects and arrays with enumerable data fields.`
  );
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
