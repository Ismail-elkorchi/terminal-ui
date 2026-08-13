const immutableIdentities = new WeakSet<object>();

/** Register a framework-owned immutable value whose identity carries private state. */
export function registerImmutableIdentity<T extends object>(value: T): T {
  immutableIdentities.add(value);
  return value;
}

export function isImmutableIdentity(value: object): boolean {
  return immutableIdentities.has(value);
}
