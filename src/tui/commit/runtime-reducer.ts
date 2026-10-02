import type { InitialFocusSelector } from '../../interaction/focus.ts';
import type { TuiMessageSource } from '../../interaction/message.ts';
import { decodeTuiUpdateResult } from '../hook-results.ts';
import type { TuiCancellation, TuiContext, TuiEffect, TuiUpdate } from '../types.ts';

export interface PendingTuiMessage<TMessage> {
  readonly message: TMessage;
  readonly source: TuiMessageSource;
  readonly redacted?: boolean;
}

export interface RuntimeReduction<TState, TMessage> {
  readonly state: TState;
  readonly stateVersion: number;
  readonly messages: readonly PendingTuiMessage<TMessage>[];
  readonly cancel: readonly TuiCancellation[];
  readonly effects: readonly TuiEffect<TMessage>[];
  readonly effectOrigins: readonly boolean[];
  readonly focus?: InitialFocusSelector;
  readonly exitReason?: string;
}

export function createRuntimeReducer<TState, TMessage>(
  update: TuiUpdate<TState, TMessage>,
  messageDispatched: () => void
) {
  const reducer = {
    reduce(state: TState, stateVersion: number, messages: readonly PendingTuiMessage<TMessage>[], context: TuiContext) {
      let nextStateVersion = stateVersion;
      let exitReason: string | undefined;
      let focus: InitialFocusSelector | undefined;
      const applied: PendingTuiMessage<TMessage>[] = [];
      const cancel: TuiCancellation[] = [];
      const effects: TuiEffect<TMessage>[] = [];
      const effectOrigins: boolean[] = [];
      for (const item of messages) {
        if (exitReason !== undefined) break;
        messageDispatched();
        const result = decodeTuiUpdateResult<TState, TMessage>(update(state, item.message, context));
        applied.push(item);
        cancel.push(...(result.cancel ?? []));
        effects.push(...(result.effects ?? []));
        for (let index = 0; index < (result.effects?.length ?? 0); index += 1) {
          effectOrigins.push(item.redacted === true);
        }
        if (result.focus !== undefined) focus = result.focus;
        if (!Object.is(result.state, state)) nextStateVersion += 1;
        state = result.state;
        if (result.exit !== undefined) exitReason = result.exit.reason ?? '';
      }
      return {
        state,
        stateVersion: nextStateVersion,
        messages: applied,
        cancel,
        effects,
        effectOrigins,
        ...(focus === undefined ? {} : { focus }),
        ...(exitReason === undefined ? {} : { exitReason })
      };
    }
  };
  return reducer;
}
