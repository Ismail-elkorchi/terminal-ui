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

export function adjacentItemId(
  ids: readonly string[],
  current: string | undefined,
  delta: number,
  policy: NavigationPolicy = defaultNavigationPolicy,
): string | undefined {
  if (ids.length === 0) return undefined;
  const currentIndex = current === undefined ? -1 : ids.indexOf(current);
  if (currentIndex < 0) return ids[initialIndex(ids.length, delta, policy.initial)];
  const candidate = currentIndex + Math.trunc(delta);
  const index = policy.boundary === 'wrap'
    ? cyclicIndex(candidate, ids.length)
    : Math.max(0, Math.min(ids.length - 1, candidate));
  return ids[index];
}

export function navigateIndex(
  current: number,
  delta: number,
  count: number,
  policy: NavigationPolicy = defaultNavigationPolicy,
): number {
  if (count <= 0) return -1;
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
