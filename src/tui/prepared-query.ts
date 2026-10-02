import type { TerminalDiagnostic } from '../diagnostics.ts';
import { renderNodeId } from '../foundation/identity.ts';
import type { TuiChildResult } from './child.ts';
import type { TuiEffectContext } from './types.ts';

/** Keep this state through cancellation/reopening; child generations fence removed instances. */
export interface TuiPreparedQueryState<TResult> {
  readonly revision: number;
  readonly pending: boolean;
  readonly result: TResult | null;
  readonly error: TerminalDiagnostic | null;
}

export type TuiPreparedQueryMessage<TResult> =
  | { readonly kind: 'ready'; readonly revision: number; readonly result: TResult }
  | { readonly kind: 'failed'; readonly revision: number; readonly diagnostic: TerminalDiagnostic };

/** Prepared work managed through the parent's existing reducer and effect lifecycle. */
export interface TuiPreparedQuery<TInput, TResult, TMessage> {
  readonly init: () => TuiPreparedQueryState<TResult>;
  /** Every request replaces earlier work, including requests with equal input. */
  readonly request: <TState extends TuiPreparedQueryState<TResult>>(state: TState, input: TInput) =>
    TuiChildResult<Omit<TState, keyof TuiPreparedQueryState<TResult>> & TuiPreparedQueryState<TResult>, TMessage>;
  readonly update: <TState extends TuiPreparedQueryState<TResult>>(state: TState, message: TuiPreparedQueryMessage<TResult>) =>
    TuiChildResult<Omit<TState, keyof TuiPreparedQueryState<TResult>> & TuiPreparedQueryState<TResult>, TMessage>;
  readonly cancel: <TState extends TuiPreparedQueryState<TResult>>(state: TState) =>
    TuiChildResult<Omit<TState, keyof TuiPreparedQueryState<TResult>> & TuiPreparedQueryState<TResult>, TMessage>;
}

/** Prepared work in the existing effect lifecycle. Display and selection policy belong to the app. */
export function createTuiPreparedQuery<TInput, TResult, TMessage>(options: {
  readonly id: string;
  readonly prepare: (input: TInput, context: TuiEffectContext) => Promise<TResult>;
  readonly toMessage: (message: TuiPreparedQueryMessage<TResult>) => TMessage;
}): TuiPreparedQuery<TInput, TResult, TMessage> {
  const { id, prepare, toMessage } = options;
  renderNodeId(id, 'TUI prepared query');
  return Object.freeze({
    init: (): TuiPreparedQueryState<TResult> => ({ revision: 0, pending: false, result: null, error: null }),
    request<TState extends TuiPreparedQueryState<TResult>>(state: TState, input: TInput): TuiChildResult<Omit<TState, keyof TuiPreparedQueryState<TResult>> & TuiPreparedQueryState<TResult>, TMessage> {
      const revision = state.revision + 1;
      return {
        state: { ...state, revision, pending: true, error: null },
        effects: [{
          id, concurrency: 'replace' as const,
          async run(context: TuiEffectContext) {
            context.signal.throwIfAborted();
            const result = await prepare(input, context);
            context.signal.throwIfAborted();
            return { kind: 'message' as const, message: toMessage({ kind: 'ready', revision, result }) };
          },
          onError: ({ diagnostic }: { readonly diagnostic: TerminalDiagnostic }) => ({
            kind: 'message' as const, message: toMessage({ kind: 'failed', revision, diagnostic }),
          }),
        }],
      };
    },
    update<TState extends TuiPreparedQueryState<TResult>>(state: TState, message: TuiPreparedQueryMessage<TResult>): TuiChildResult<Omit<TState, keyof TuiPreparedQueryState<TResult>> & TuiPreparedQueryState<TResult>, TMessage> {
      if (!state.pending || message.revision !== state.revision) return { state };
      return { state: message.kind === 'ready'
        ? { ...state, pending: false, result: message.result, error: null }
        : { ...state, pending: false, error: message.diagnostic } };
    },
    cancel<TState extends TuiPreparedQueryState<TResult>>(state: TState): TuiChildResult<Omit<TState, keyof TuiPreparedQueryState<TResult>> & TuiPreparedQueryState<TResult>, TMessage> {
      return { state: { ...state, revision: state.revision + 1, pending: false, error: null }, cancel: [{ kind: 'effect', id }] };
    },
  });
}
