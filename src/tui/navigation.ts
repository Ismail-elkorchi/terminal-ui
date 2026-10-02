import { activeNavigationEntry, navigationStackReducer } from '../behavior/navigation-stack.ts';
import type { NavigationStack, NavigationStackTransition } from '../behavior/navigation-stack.ts';
import type { InitialFocusSelector } from '../interaction/focus.ts';
import type { TuiChildState, TuiChildResult } from './child.ts';
import type { TuiCancellation } from './types.ts';

/** Retained screens keep their child lifetime and their application-selected restoration target. */
export interface TuiNavigationScreen<TState> {
  readonly child: TuiChildState<TState>;
  /** A parent-scope selector; resolve a child-local element with child.elementId(instance, localId). */
  readonly focus?: Exclude<InitialFocusSelector, { readonly kind: 'path' }>;
}

/** Adapt the existing stack reducer to child ownership; hidden entries remain mounted. */
export function updateTuiNavigation<TState, TMessage, TOutput = never>(
  stack: NavigationStack<TuiNavigationScreen<TState>>,
  transition: NavigationStackTransition<TuiNavigationScreen<TState>>,
  remove: (child: TuiChildState<TState>) => TuiCancellation,
  outputs?: readonly TOutput[],
): TuiChildResult<NavigationStack<TuiNavigationScreen<TState>>, TMessage, TOutput> {
  const next = navigationStackReducer(stack, transition);
  const identities = new Map<string, Set<string | number>>();
  for (const entry of next.entries) {
    const child = entry.state.child;
    const generations = identities.get(child.id) ?? new Set<string | number>();
    generations.add(child.generation);
    identities.set(child.id, generations);
  }
  const cancel: TuiCancellation[] = [];
  for (const entry of stack.entries) {
    const child = entry.state.child;
    if (!identities.get(child.id)?.has(child.generation)) cancel.push(remove(child));
  }
  const unchanged = next.entries.length === stack.entries.length
    && next.entries.every((entry, index) => entry === stack.entries[index]);
  const state = unchanged ? stack : next;
  const active = activeNavigationEntry(state);
  const focus = active !== activeNavigationEntry(stack) ? active?.state.focus : undefined;
  return { state, ...(cancel.length === 0 ? {} : { cancel }), ...(focus === undefined ? {} : { focus }),
    ...(outputs === undefined ? {} : { outputs }) };
}
