import { diagnostic } from '../diagnostics.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type {
  TuiContext,
  TuiEventSource,
  TuiMessageSource,
  TuiSourceLifecycle,
  TuiSubscriptionContext,
  TuiSubscriptions
} from './types.ts';
import { subscriptionExecutionId } from '../internal/identity.ts';
import type { SubscriptionExecutionId } from '../internal/identity.ts';

interface ActiveTuiEventSource<TMessage> {
  readonly id: SubscriptionExecutionId;
  readonly controller: AbortController;
  readonly source: TuiEventSource<TMessage>;
  readonly completion: Promise<void>;
}

type StartingTuiEventSource<TMessage> = Omit<ActiveTuiEventSource<TMessage>, 'completion'>;

export interface TuiSubscriptionManager<TState> {
  reconcile(state: TState): Promise<void>;
  cancel(): void;
  dispose(): Promise<void>;
}

export interface TuiSubscriptionManagerOptions<TState, TMessage> {
  readonly subscriptions?: TuiSubscriptions<TState, TMessage>;
  readonly dispatch: (message: TMessage, source: TuiMessageSource) => Promise<void>;
  readonly context: () => Promise<TuiContext>;
  readonly reportDiagnostic: (item: TerminalDiagnostic) => void;
}

export function createTuiSubscriptionManager<TState, TMessage>(
  options: TuiSubscriptionManagerOptions<TState, TMessage>
): TuiSubscriptionManager<TState> {
  const active = new Map<SubscriptionExecutionId, ActiveTuiEventSource<TMessage>>();
  const retiring = new Set<Promise<void>>();
  const retirementFailures: unknown[] = [];

  return {
    async reconcile(state) {
      if (options.subscriptions === undefined) {
        retireAll(active, retiring, retirementFailures);
        return;
      }
      const context = await options.context();
      const requested = options.subscriptions(state, context);
      const requestedIds = new Set(requested.map((source) => subscriptionExecutionId(source.id)));
      for (const [id, activeSource] of active) {
        if (!requestedIds.has(id)) {
          active.delete(id);
          retireSource(activeSource, retiring, retirementFailures);
        }
      }
      for (const source of requested) {
        const id = subscriptionExecutionId(source.id);
        if (active.has(id)) continue;
        const activeSource = startSource(source, context, options);
        active.set(id, activeSource);
      }
    },
    cancel() {
      cancelAll(active);
    },
    async dispose() {
      retireAll(active, retiring, retirementFailures);
      await Promise.all([...retiring]);
      const failures = retirementFailures.splice(0);
      if (failures.length > 0) throw new AggregateError(failures, 'TUI subscription disposal failed.');
    }
  };
}

function cancelAll<TMessage>(active: Map<SubscriptionExecutionId, ActiveTuiEventSource<TMessage>>): void {
  for (const source of active.values()) source.controller.abort();
}

function startSource<TState, TMessage>(
  source: TuiEventSource<TMessage>,
  baseContext: TuiContext,
  options: TuiSubscriptionManagerOptions<TState, TMessage>
): ActiveTuiEventSource<TMessage> {
  const controller = new AbortController();
  const sourceIdentity: StartingTuiEventSource<TMessage> = {
    id: subscriptionExecutionId(source.id),
    controller,
    source
  };
  const context: TuiSubscriptionContext = { ...baseContext, signal: controller.signal };
  return {
    ...sourceIdentity,
    completion: pumpSource(sourceIdentity, context, options)
  };
}

async function pumpSource<TState, TMessage>(
  active: StartingTuiEventSource<TMessage>,
  context: TuiSubscriptionContext,
  options: TuiSubscriptionManagerOptions<TState, TMessage>
): Promise<void> {
  const sourceName = active.source.source ?? 'external';
  try {
    const messages = active.source.messages(context);
    if (active.source.delivery === 'latest') {
      await pumpLatest(messages, context.signal, (message) => options.dispatch(message, sourceName));
    } else {
      for await (const message of messages) {
        if (context.signal.aborted) break;
        await options.dispatch(message, sourceName);
      }
    }
    if (!context.signal.aborted) await dispatchLifecycle(active.source, { kind: 'completed', id: active.id }, sourceName, options);
  } catch (cause) {
    if (context.signal.aborted) return;
    const item = diagnostic('TUI_SOURCE_FAILED', `TUI event source ${active.id} failed.`, {
      target: active.id,
      cause,
      data: { delivery: active.source.delivery }
    });
    options.reportDiagnostic(item);
    await dispatchLifecycle(active.source, { kind: 'failed', id: active.id, diagnostic: item }, sourceName, options);
  }
}

async function pumpLatest<TMessage>(
  messages: AsyncIterable<TMessage>,
  signal: AbortSignal,
  dispatch: (message: TMessage) => Promise<void>
): Promise<void> {
  let pending: { readonly message: TMessage } | undefined;
  let drain: Promise<void> | undefined;
  const ensureDrain = (): void => {
    if (drain !== undefined) return;
    drain = (async () => {
      while (!signal.aborted && pending !== undefined) {
        const next = pending;
        pending = undefined;
        await dispatch(next.message);
      }
    })().finally(() => {
      drain = undefined;
      if (!signal.aborted && pending !== undefined) ensureDrain();
    });
  };

  for await (const message of messages) {
    if (signal.aborted) break;
    pending = { message };
    ensureDrain();
  }
  while (drain !== undefined) await drain;
}

async function dispatchLifecycle<TState, TMessage>(
  source: TuiEventSource<TMessage>,
  event: TuiSourceLifecycle,
  sourceName: TuiMessageSource,
  options: TuiSubscriptionManagerOptions<TState, TMessage>
): Promise<void> {
  const message = source.onLifecycle?.(event);
  if (message !== undefined) await options.dispatch(message, sourceName);
}

function retireAll<TMessage>(
  active: Map<SubscriptionExecutionId, ActiveTuiEventSource<TMessage>>,
  retiring: Set<Promise<void>>,
  failures: unknown[]
): void {
  const sources = [...active.values()];
  active.clear();
  for (const source of sources) retireSource(source, retiring, failures);
}

function retireSource<TMessage>(
  active: ActiveTuiEventSource<TMessage>,
  retiring: Set<Promise<void>>,
  failures: unknown[]
): void {
  active.controller.abort();
  const cleanup = settleSource(active).catch((cause: unknown) => {
    failures.push(cause);
  });
  retiring.add(cleanup);
  void cleanup.then(() => {
    retiring.delete(cleanup);
  });
}

async function settleSource<TMessage>(active: ActiveTuiEventSource<TMessage>): Promise<void> {
  const outcomes = await Promise.allSettled([
    active.completion,
    Promise.resolve().then(() => active.source.dispose?.())
  ]);
  const failures = outcomes.flatMap((outcome): readonly unknown[] => (
    outcome.status === 'rejected' ? [outcome.reason] : []
  ));
  if (failures.length > 0) {
    throw new AggregateError(failures, `TUI source ${active.id} cleanup failed.`);
  }
}
