import type { ComponentReuse } from '../contracts.ts';
import { maximumReuseDependencySlots, type ReuseDependencies, type ReusePhase } from '../../visual/reuse-dependencies.ts';

const phases: readonly ReusePhase[] = ['measurement', 'layout', 'paint', 'accessibility'];
const emptyDependencies: ReuseDependencies = Object.freeze({});

export function componentReuse<TModel extends object>(model: Readonly<TModel>, reuse: ComponentReuse<TModel> | undefined): ReuseDependencies {
  if (reuse === undefined) return emptyDependencies;
  const result: Partial<Record<ReusePhase, readonly unknown[]>> = {};
  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
    const phase = phases[phaseIndex];
    if (phase === undefined) continue;
    const selector = reuse[phase];
    if (selector === undefined) continue;
    const prior = phases.find((candidate, index) => index < phaseIndex && reuse[candidate] === selector);
    if (prior !== undefined) {
      const snapshot = result[prior];
      if (snapshot !== undefined) result[phase] = snapshot;
      continue;
    }
    const slots = selector.call(undefined, model);
    if (slots === undefined) continue;
    if (!Array.isArray(slots)) throw new TypeError(`Component reuse.${phase} must return a dependency tuple.`);
    const count = slots.length;
    if (!Number.isSafeInteger(count) || count < 0 || count > maximumReuseDependencySlots) {
      throw new TypeError(`Component reuse.${phase} must return a tuple with at most ${String(maximumReuseDependencySlots)} slots or undefined.`);
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < count; index += 1) {
      if (!Object.hasOwn(slots, index)) throw new TypeError(`Component reuse.${phase} must return a dense tuple.`);
      snapshot.push(slots[index]);
    }
    result[phase] = Object.freeze(snapshot);
  }
  return Object.freeze(result);
}
