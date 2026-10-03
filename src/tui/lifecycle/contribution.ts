import type { InitialFocusSelector } from '../../interaction/focus.ts';
import type { TuiContribution, TuiScopedSource } from '../contribution-types.ts';
import type { TuiCancellation, TuiEffect, TuiEventSource } from '../types.ts';

export interface ContributionEntry<TMessage> {
  readonly cancel?: readonly TuiCancellation[];
  readonly effects?: readonly TuiEffect<TMessage>[];
  readonly focus?: InitialFocusSelector;
}

const contributions = new WeakMap<object, readonly ContributionEntry<unknown>[]>();
const sources = new WeakMap<object, TuiEventSource<unknown>>();

/** Entries have already crossed the result decoder's ownership boundary. */
export function ownTuiContribution<TMessage>(entries: readonly ContributionEntry<TMessage>[]): TuiContribution<TMessage> {
  const handle = Object.freeze({}) as TuiContribution<TMessage>;
  contributions.set(handle, Object.freeze([...entries]));
  return handle;
}

export function readTuiContribution<TMessage>(value: unknown): readonly ContributionEntry<TMessage>[] {
  const entries = typeof value === 'object' && value !== null ? contributions.get(value) : undefined;
  if (entries === undefined) throw new TypeError('TUI contribution must be an owned result contribution.');
  return entries as readonly ContributionEntry<TMessage>[];
}

export function ownTuiSource<TMessage>(source: TuiEventSource<TMessage>): TuiScopedSource<TMessage> {
  const handle = Object.freeze({}) as TuiScopedSource<TMessage>;
  sources.set(handle, source);
  return handle;
}

export function unwrapTuiSource(value: unknown): unknown {
  return typeof value === 'object' && value !== null ? sources.get(value) ?? value : value;
}

export function retireChildContribution(identity: { readonly id: string; readonly generation: string | number }): TuiContribution<never> {
  return ownTuiContribution<never>([Object.freeze({
    cancel: Object.freeze([Object.freeze({ kind: 'child' as const, id: identity.id, generation: identity.generation })]),
  })]);
}
