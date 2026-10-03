import { activeNavigationEntry, navigationStackReducer } from '../behavior/navigation-stack.ts';
import type { NavigationStack, NavigationStackTransition } from '../behavior/navigation-stack.ts';
import type { InitialFocusSelector } from '../interaction/focus.ts';
import { combineTuiResults, reconcileTuiChildren } from './result.ts';
import type { TuiChildState, TuiChildResult } from './child.ts';

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
  outputs?: readonly TOutput[],
): TuiChildResult<NavigationStack<TuiNavigationScreen<TState>>, TMessage, TOutput> {
  if (outputs !== undefined && !Array.isArray(outputs)) throw new TypeError('Navigation outputs must be an array.');
  const next = navigationStackReducer(stack, transition);
  const retained = reconcileTuiChildren(stack.entries, next.entries, entry => entry.state.child);
  const unchanged = next.entries.length === stack.entries.length
    && next.entries.every((entry, index) => entry === stack.entries[index]);
  const state = unchanged ? stack : next;
  const active = activeNavigationEntry(state);
  const focus = active !== activeNavigationEntry(stack) ? active?.state.focus : undefined;
  return combineTuiResults<NavigationStack<TuiNavigationScreen<TState>>, TMessage, TOutput>(state, retained,
    { state, ...(focus === undefined ? {} : { focus }), ...(outputs === undefined ? {} : { outputs }) });
}
