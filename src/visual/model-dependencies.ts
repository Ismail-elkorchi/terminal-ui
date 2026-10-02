/** Private dependencies supplied only by framework-owned model adapters. */
export type ModelPhase = 'paint' | 'measurement' | 'layout' | 'accessibility';
type Dependencies = Readonly<Partial<Record<ModelPhase, readonly unknown[]>>>;
const dependenciesByModel = new WeakMap<object, Dependencies>();
const phases: readonly ModelPhase[] = ['paint', 'measurement', 'layout', 'accessibility'];

// A cache hit must never walk an arbitrary application object or large control
// state. Large selections use bounded, visible-row retention instead.
export const maximumModelDependencySlots = 128;

/** Own one immutable model and its explicit, independently invalidated phases. */
export function ownModelDependencies<T extends object>(model: T, dependencies: Dependencies): Readonly<T> {
  const owned = Object.freeze(model);
  const snapshots = new Map<readonly unknown[], readonly unknown[]>();
  const result: Partial<Record<ModelPhase, readonly unknown[]>> = {};
  for (const phase of phases) {
    const slots = dependencies[phase];
    if (slots === undefined || slots.length > maximumModelDependencySlots) continue;
    let snapshot = snapshots.get(slots);
    if (snapshot === undefined) {
      snapshot = Object.freeze([...slots]);
      snapshots.set(slots, snapshot);
    }
    result[phase] = snapshot;
  }
  dependenciesByModel.set(owned, Object.freeze(result));
  return owned;
}

export function modelDependencies(model: object, phase: ModelPhase): readonly unknown[] | undefined {
  return dependenciesByModel.get(model)?.[phase];
}

export function sameModelDependencies(a: unknown, b: unknown, phase: ModelPhase): boolean {
  // Custom painters explicitly opt in to immutable model identity. Layout and
  // semantic reuse require owned descriptors even when model identities match.
  if (phase === 'paint' && Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  const left = modelDependencies(a, phase);
  const right = modelDependencies(b, phase);
  if (left === undefined || right?.length !== left.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) return false;
  }
  return true;
}
