/** Immutable renderer-owned snapshots. A bound on comparisons, not arbitrary selector execution. */
export const maximumReuseDependencySlots = 128;
export type ReusePhase = 'measurement' | 'layout' | 'paint' | 'accessibility';
export type ReuseDependencies = Readonly<Partial<Record<ReusePhase, readonly unknown[]>>>;

export function sameReuseDependencies(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  if (a === undefined || a.length !== b?.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (!Object.is(a[index], b[index])) return false;
  }
  return true;
}
