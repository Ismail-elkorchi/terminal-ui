import { decodeTuiUpdateResult } from './hook-results.ts';
import { ownTuiContribution, retireChildContribution } from './lifecycle/contribution.ts';
import type { ContributionEntry } from './lifecycle/contribution.ts';
import type { TuiChildState, TuiScopedResult } from './child.ts';
import type { TuiExitRequest, TuiUpdateContribution } from './types.ts';

/** Lift one controlled field without dropping effects, cancellation, focus or domain outputs. */
export function liftTuiResult<TParent, TKey extends keyof TParent, TResult extends { readonly state: TParent[TKey] }>(
  parent: TParent,
  field: TKey,
  result: TResult,
): Omit<TResult, 'state'> & { readonly state: TParent } {
  return { ...result, state: Object.is(parent[field], result.state) ? parent : { ...parent, [field]: result.state } };
}

/** Combine ordered work using the caller's final state, never merge stale state snapshots. */
export function combineTuiResults<TState, TMessage, TOutput = never>(
  state: TState,
  ...results: readonly (TuiUpdateContribution<unknown, TMessage> & {
    readonly outputs?: readonly TOutput[];
    readonly exit?: TuiExitRequest;
  })[]
): TuiScopedResult<TState, TMessage, TOutput> & { readonly exit?: TuiExitRequest } {
  const entries: ContributionEntry<TMessage>[] = [];
  const outputs: TOutput[] = [];
  let exit: TuiExitRequest | undefined;
  for (const result of results) {
    const decoded = decodeTuiUpdateResult<unknown, TMessage>(result);
    entries.push(...decoded.contributions);
    if (result.outputs !== undefined) outputs.push(...result.outputs);
    if (decoded.exit !== undefined) { exit = decoded.exit; break; }
  }
  return {
    state,
    ...(entries.length === 0 ? {} : { contribution: ownTuiContribution(entries) }),
    ...(outputs.length === 0 ? {} : { outputs: Object.freeze(outputs) }),
    ...(exit === undefined ? {} : { exit }),
  };
}

/** Replace an explicitly owned child collection and retire every absent lifetime. */
export function reconcileTuiChildren<TItem, TChildState>(
  previous: readonly TItem[],
  next: readonly TItem[],
  child: (item: TItem) => TuiChildState<TChildState>,
): TuiScopedResult<readonly TItem[], never> {
  if (previous === next) return { state: next };
  const present = new Map<string, Set<string | number>>();
  for (const item of next) {
    const instance = child(item);
    const generations = present.get(instance.id) ?? new Set<string | number>();
    if (generations.has(instance.generation)) throw new TypeError('A child lifetime cannot occur twice in its owned collection.');
    generations.add(instance.generation);
    present.set(instance.id, generations);
  }
  const removals = previous.flatMap(item => {
    const instance = child(item);
    return present.get(instance.id)?.has(instance.generation) === true ? [] : [{ state: undefined, contribution: retireChildContribution(instance) }];
  });
  return combineTuiResults(next, ...removals);
}
