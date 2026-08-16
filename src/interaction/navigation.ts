import { cyclicIndex } from '../foundation/cyclic-index.ts';

export type NavigationBoundary = 'wrap' | 'clamp';
export type InitialNavigation = 'directional-edge' | 'first' | 'last';

export interface NavigationPolicy {
  readonly boundary: NavigationBoundary;
  readonly initial: InitialNavigation;
}

export const defaultNavigationPolicy: NavigationPolicy = Object.freeze({
  boundary: 'clamp',
  initial: 'directional-edge',
});

export function adjacentItemId<TId extends string>(
  ids: readonly TId[],
  current: TId | undefined,
  delta: number,
  policy: NavigationPolicy = defaultNavigationPolicy,
): TId | undefined {
  if (ids.length === 0) return undefined;
  const currentIndex = current === undefined ? -1 : ids.indexOf(current);
  const index = navigateIndex(currentIndex < 0 ? undefined : currentIndex, delta, ids.length, policy);
  return ids[index];
}

export function navigateIndex(
  current: number | undefined,
  delta: number,
  count: number,
  policy: NavigationPolicy = defaultNavigationPolicy,
): number {
  if (count <= 0) return -1;
  if (current === undefined || current < 0 || current >= count) {
    return initialIndex(count, delta, policy.initial);
  }
  const candidate = current + Math.trunc(delta);
  return policy.boundary === 'wrap'
    ? cyclicIndex(candidate, count)
    : Math.max(0, Math.min(count - 1, candidate));
}

function initialIndex(count: number, delta: number, policy: InitialNavigation): number {
  if (policy === 'first') return 0;
  if (policy === 'last') return count - 1;
  return delta < 0 ? count - 1 : 0;
}
