import type { InitialFocusSelector } from '../../interaction/focus.ts';
import type { TuiMessageSource } from '../../interaction/message.ts';
import { decodeTuiUpdateResult } from '../hook-results.ts';
import type { ContributionEntry } from '../lifecycle/contribution.ts';
import { assertRuntimeLimit } from '../lifecycle/runtime-policy.ts';
import { cancellationMatches, removedWork } from '../lifecycle/work-ownership.ts';
import type { TuiEffectRequest } from '../lifecycle/effects.ts';
import type { TuiCancellation, TuiContext, TuiUpdate } from '../types.ts';

export interface PendingTuiMessage<TMessage> {
  readonly message: TMessage;
  readonly source: TuiMessageSource;
  readonly redacted?: boolean;
}

export interface RuntimeContribution<TMessage> extends ContributionEntry<TMessage> {
  readonly redacted: boolean;
}

export interface RuntimeReduction<TState, TMessage> {
  readonly state: TState;
  readonly stateVersion: number;
  readonly messages: readonly PendingTuiMessage<TMessage>[];
  readonly contributions: readonly RuntimeContribution<TMessage>[];
  readonly focus?: InitialFocusSelector;
  readonly exitReason?: string;
}

/** Fold intent without launching provisional work or simulating execution policy. */
export function normalizeRuntimeContributions<TMessage>(contributions: readonly RuntimeContribution<TMessage>[]) {
  const cancel: TuiCancellation[] = [];
  let effects: TuiEffectRequest<TMessage>[] = [];
  for (const entry of contributions) {
    for (const request of entry.cancel ?? []) {
      cancel.push(request);
      effects = effects.filter((item) => !cancellationMatches(request, item.effect));
    }
    for (const effect of entry.effects ?? []) {
      if (effect.concurrency === 'replace') effects = effects.filter((item) => item.effect.id !== effect.id);
      effects.push({ effect, redacted: entry.redacted });
    }
  }
  return { cancel, effects: effects.filter((item) => !removedWork(item.effect, cancel)) };
}

export function createRuntimeReducer<TState, TMessage>(
  update: TuiUpdate<TState, TMessage>,
  messageDispatched: () => void,
  maxContributions = 1_024,
) {
  return {
    reduce(state: TState, stateVersion: number, messages: readonly PendingTuiMessage<TMessage>[], context: TuiContext): RuntimeReduction<TState, TMessage> {
      let nextStateVersion = stateVersion;
      let exitReason: string | undefined;
      let focus: InitialFocusSelector | undefined;
      const applied: PendingTuiMessage<TMessage>[] = [];
      const contributions: RuntimeContribution<TMessage>[] = [];
      let count = 0;
      for (const item of messages) {
        if (exitReason !== undefined) break;
        messageDispatched();
        const result = decodeTuiUpdateResult<TState, TMessage>(update(state, item.message, context), maxContributions - count);
        applied.push(item);
        for (const contribution of result.contributions) {
          count += Math.max(1, (contribution.cancel?.length ?? 0) + (contribution.effects?.length ?? 0));
          assertRuntimeLimit('transaction_contributions', count, maxContributions);
          contributions.push({ ...contribution, redacted: item.redacted === true });
        }
        if (result.focus !== undefined) focus = result.focus;
        if (!Object.is(result.state, state)) nextStateVersion += 1;
        state = result.state;
        if (result.exit !== undefined) exitReason = result.exit.reason ?? '';
      }
      return {
        state, stateVersion: nextStateVersion, messages: applied, contributions,
        ...(focus === undefined ? {} : { focus }),
        ...(exitReason === undefined ? {} : { exitReason }),
      };
    },
  };
}
