export type NavigationBoundary = 'wrap' | 'clamp';
export type InitialNavigation = 'directional-edge' | 'first' | 'last';

export interface NavigationPolicy {
  readonly boundary: NavigationBoundary;
  readonly initial: InitialNavigation;
}

export const defaultNavigationPolicy: NavigationPolicy = Object.freeze({
  boundary: 'wrap',
  initial: 'directional-edge'
});

export function adjacentItemId(
  ids: readonly string[],
  current: string | undefined,
  delta: number,
  policy: NavigationPolicy = defaultNavigationPolicy
): string | undefined {
  if (ids.length === 0) return undefined;
  const currentIndex = current === undefined ? -1 : ids.indexOf(current);
  if (currentIndex < 0) return ids[initialIndex(ids.length, delta, policy.initial)];
  const candidate = currentIndex + Math.trunc(delta);
  const index = policy.boundary === 'wrap'
    ? ((candidate % ids.length) + ids.length) % ids.length
    : Math.max(0, Math.min(ids.length - 1, candidate));
  return ids[index];
}

function initialIndex(count: number, delta: number, policy: InitialNavigation): number {
  if (policy === 'first') return 0;
  if (policy === 'last') return count - 1;
  return delta < 0 ? count - 1 : 0;
}
