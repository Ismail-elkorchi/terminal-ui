import { sameReuseDependencies } from './reuse-dependencies.ts';

const styleDependencies = new WeakMap<object, readonly unknown[]>();

/** Only validated, renderer-owned style matrices enter this private registry. */
export function ownStyleDependencies<T extends object>(styles: T, slots: readonly unknown[]): Readonly<T> {
  const owned = Object.freeze(styles);
  styleDependencies.set(owned, Object.freeze([...slots]));
  return owned;
}

export function sameStyleDependencies(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  return sameReuseDependencies(styleDependencies.get(a), styleDependencies.get(b));
}
