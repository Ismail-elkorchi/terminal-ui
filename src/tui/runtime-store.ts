import type { InitialFocusSelector } from '../interaction/focus.ts';
import type { TuiContext, TuiEffect, TuiUpdate } from './types.ts';
import type { TuiMessageSource } from '../interaction/message.ts';

export interface PendingTuiMessage<TMessage> {
  readonly message: TMessage;
  readonly source: TuiMessageSource;
  readonly redacted?: boolean;
}

export interface RuntimeReduction<TState, TMessage> {
  readonly state: TState;
  readonly stateVersion: number;
  readonly stateUpdates: number;
  readonly messages: readonly PendingTuiMessage<TMessage>[];
  readonly cancelEffects: readonly string[];
  readonly effects: readonly TuiEffect<TMessage>[];
  readonly focus?: InitialFocusSelector;
  readonly exitReason?: string;
}

export function createRuntimeStore<TState, TMessage>(
  update: TuiUpdate<TState, TMessage>,
  messageDispatched: () => void
) {
  let current: RuntimeStateSlot<TState> = { kind: 'empty' };
  let stateVersion = 0;

  const store = {
    initialize(state: TState) {
      current = { kind: 'ready', value: state };
    },
    hasState: () => current.kind === 'ready',
    state: committedState,
    version: () => stateVersion,
    reduce(messages: readonly PendingTuiMessage<TMessage>[], context: TuiContext) {
      let state = committedState();
      let nextStateVersion = stateVersion;
      let stateUpdates = 0;
      let exitReason: string | undefined;
      let focus: InitialFocusSelector | undefined;
      const applied: PendingTuiMessage<TMessage>[] = [];
      const cancelEffects = new Set<string>();
      const effects: TuiEffect<TMessage>[] = [];
      for (const item of messages) {
        if (exitReason !== undefined) break;
        messageDispatched();
        const result = update(state, item.message, context);
        applied.push(item);
        for (const id of result.cancelEffects ?? []) cancelEffects.add(id);
        effects.push(...(result.effects ?? []));
        if (result.focus !== undefined) focus = result.focus;
        if (result.state !== state) {
          nextStateVersion += 1;
          stateUpdates += 1;
        }
        state = result.state;
        if (result.exit !== undefined) exitReason = result.exit.reason ?? '';
      }
      return {
        state,
        stateVersion: nextStateVersion,
        stateUpdates,
        messages: applied,
        cancelEffects: [...cancelEffects],
        effects,
        ...(focus === undefined ? {} : { focus }),
        ...(exitReason === undefined ? {} : { exitReason })
      };
    },
    commit(reduction: RuntimeReduction<TState, TMessage>) {
      current = { kind: 'ready', value: reduction.state };
      stateVersion = reduction.stateVersion;
    }
  };
  return store;

  function committedState(): TState {
    if (current.kind === 'empty') throw new Error('TUI runtime does not have state.');
    return current.value;
  }
}

type RuntimeStateSlot<TState> =
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly value: TState };
