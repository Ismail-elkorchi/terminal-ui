const limits = new WeakMap<object, number>();

export function withEffectOutputLimit<T extends object>(value: T, limit: number): T {
  limits.set(value, limit);
  return value;
}

export function effectOutputLimit(value: object): number {
  return limits.get(value) ?? 1_024;
}
