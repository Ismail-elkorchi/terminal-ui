import { diagnostic } from '../diagnostics.ts';
import { subscriptionExecutionId } from '../foundation/identity.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { SubscriptionExecutionId } from '../foundation/identity.ts';
import { isIgnoredMessage } from '../interaction/message.ts';
import { createProducerAdmissionLease } from './producer-admission.ts';
import type { ProducerAdmissionLease } from './producer-admission.ts';
import type {
  TuiContext,
  TuiEventSource,
  TuiMessageSource,
  TuiSourceLifecycle,
  TuiSubscriptionContext,
  TuiSubscriptions
} from './types.ts';

interface ActiveTuiEventSource<TMessage> {
  readonly id: SubscriptionExecutionId;
  readonly generation: string | number;
  readonly controller: AbortController;
  readonly lease: ProducerAdmissionLease;
  readonly source: TuiEventSource<TMessage>;
  completion: Promise<void>;
  disposal?: Promise<void>;
}

interface TerminalSourceGeneration {
  readonly generation: string | number;
  readonly outcome: 'completed' | 'failed';
}

export interface PreparedTuiSubscriptions<TMessage> {
  readonly context: TuiContext;
  readonly sources: readonly TuiEventSource<TMessage>[];
}

export interface TuiSubscriptionManager<TState, TMessage> {
  prepare(state: TState): Promise<PreparedTuiSubscriptions<TMessage>>;
  activate(prepared: PreparedTuiSubscriptions<TMessage>): void;
  reconcile(state: TState): Promise<void>;
  cancel(): void;
  dispose(): Promise<void>;
}

export interface TuiSubscriptionManagerOptions<TState, TMessage> {
  readonly subscriptions?: TuiSubscriptions<TState, TMessage>;
  readonly dispatch: (
    message: TMessage,
    source: TuiMessageSource,
    lease: ProducerAdmissionLease
  ) => Promise<void>;
  readonly context: () => Promise<TuiContext>;
  readonly reportDiagnostic: (item: TerminalDiagnostic) => void;
}

export function createTuiSubscriptionManager<TState, TMessage>(
  options: TuiSubscriptionManagerOptions<TState, TMessage>
): TuiSubscriptionManager<TState, TMessage> {
  const active = new Map<SubscriptionExecutionId, ActiveTuiEventSource<TMessage>>();
  const terminal = new Map<SubscriptionExecutionId, TerminalSourceGeneration>();
  const retiring = new Set<Promise<void>>();
  const retirementFailures: unknown[] = [];
  let disposed = false;

  return {
    async prepare(state) {
      const context = await options.context();
      const sources = options.subscriptions?.(state, context) ?? [];
      assertUniqueSourceIds(sources, options.reportDiagnostic);
      return { context, sources };
    },
    activate(prepared) {
      reconcilePrepared(prepared);
    },
    async reconcile(state) {
      const prepared = await this.prepare(state);
      reconcilePrepared(prepared);
    },
    cancel() {
      for (const source of active.values()) {
        source.lease.revoke();
        source.controller.abort();
      }
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      retireAll();
      await Promise.all([...retiring]);
      const failures = retirementFailures.splice(0);
      if (failures.length > 0) throw new AggregateError(failures, 'TUI subscription disposal failed.');
    }
  };

  function reconcilePrepared(prepared: PreparedTuiSubscriptions<TMessage>): void {
    if (disposed) return;
    const requestedIds = new Set(prepared.sources.map((source) => subscriptionExecutionId(source.id)));
    for (const id of terminal.keys()) {
      if (!requestedIds.has(id)) terminal.delete(id);
    }
    for (const [id, activeSource] of active) {
      const requested = prepared.sources.find((source) => subscriptionExecutionId(source.id) === id);
      if (requested?.generation !== activeSource.generation) {
        active.delete(id);
        retireSource(activeSource);
      }
    }
    for (const source of prepared.sources) {
      const id = subscriptionExecutionId(source.id);
      if (active.has(id)) continue;
      const outcome = terminal.get(id);
      if (outcome?.generation === source.generation) continue;
      terminal.delete(id);
      const activeSource = startSource(source, prepared.context);
      active.set(id, activeSource);
    }
  }

  function startSource(
    source: TuiEventSource<TMessage>,
    baseContext: TuiContext
  ): ActiveTuiEventSource<TMessage> {
    const controller = new AbortController();
    const id = subscriptionExecutionId(source.id);
    const lease = createProducerAdmissionLease('subscription', `${String(id)}:${String(source.generation)}`, controller.signal);
    const activeSource: ActiveTuiEventSource<TMessage> = {
      id,
      generation: source.generation,
      controller,
      lease,
      source,
      completion: Promise.resolve()
    };
    const context: TuiSubscriptionContext = { ...baseContext, signal: controller.signal };
    activeSource.completion = pumpSource(activeSource, context)
      .then(async (outcome) => {
        if (active.get(id) === activeSource && !context.signal.aborted) {
          terminal.set(id, { generation: source.generation, outcome });
        }
        await disposeSource(activeSource);
        if (active.get(id) === activeSource) active.delete(id);
      })
      .catch((cause: unknown) => {
        if (active.get(id) === activeSource) active.delete(id);
        retirementFailures.push(cause);
      })
      .finally(() => { activeSource.lease.revoke(); });
    return activeSource;
  }

  async function pumpSource(
    activeSource: ActiveTuiEventSource<TMessage>,
    context: TuiSubscriptionContext
  ): Promise<'completed' | 'failed'> {
    const sourceName = activeSource.source.source ?? 'external';
    try {
      const messages = activeSource.source.messages(context);
      if (activeSource.source.delivery === 'latest') {
        await pumpLatest(messages, context.signal, (message) => options.dispatch(message, sourceName, activeSource.lease));
      } else {
        for await (const message of messages) {
          if (context.signal.aborted) return 'completed';
          await options.dispatch(message, sourceName, activeSource.lease);
        }
      }
      if (context.signal.aborted) return 'completed';
      await dispatchLifecycle(activeSource.source, {
        kind: 'completed',
        id: activeSource.id,
        generation: activeSource.generation
      }, sourceName, activeSource.lease, options.dispatch);
      return 'completed';
    } catch (cause) {
      if (context.signal.aborted) return 'completed';
      const provisional = sourceFailure(activeSource, cause);
      let finalCause = cause;
      try {
        await dispatchLifecycle(activeSource.source, {
          kind: 'failed',
          id: activeSource.id,
          generation: activeSource.generation,
          diagnostic: provisional
        }, sourceName, activeSource.lease, options.dispatch);
      } catch (lifecycleCause) {
        finalCause = new AggregateError([cause, lifecycleCause], 'TUI source and its lifecycle mapper failed.');
      }
      options.reportDiagnostic(sourceFailure(activeSource, finalCause));
      return 'failed';
    }
  }

  function retireAll(): void {
    const sources = [...active.values()];
    active.clear();
    for (const source of sources) retireSource(source);
  }

  function retireSource(source: ActiveTuiEventSource<TMessage>): void {
    source.lease.revoke();
    source.controller.abort();
    void disposeSource(source);
    const cleanup = settleSource(source).catch((cause: unknown) => {
      retirementFailures.push(cause);
    });
    retiring.add(cleanup);
    void cleanup.then(() => retiring.delete(cleanup));
  }

  function disposeSource(source: ActiveTuiEventSource<TMessage>): Promise<void> {
    source.disposal ??= invokeSourceDisposer(source).catch((cause: unknown) => {
      retirementFailures.push(cause);
    });
    return source.disposal;
  }
}

async function invokeSourceDisposer<TMessage>(source: ActiveTuiEventSource<TMessage>): Promise<void> {
  await source.source.dispose?.();
}

async function pumpLatest<TMessage>(
  messages: AsyncIterable<TMessage>,
  signal: AbortSignal,
  dispatch: (message: TMessage) => Promise<void>
): Promise<void> {
  let pending: { readonly message: TMessage } | undefined;
  let drain: Promise<void> | undefined;
  let drainFailure: Error | undefined;
  const ensureDrain = (): void => {
    if (drain !== undefined || drainFailure !== undefined) return;
    drain = (async () => {
      while (!signal.aborted && pending !== undefined) {
        const next = pending;
        pending = undefined;
        await dispatch(next.message);
      }
    })()
      .catch((cause: unknown) => {
        drainFailure = sourceDispatchError(cause);
      })
      .finally(() => {
        drain = undefined;
        if (!signal.aborted && pending !== undefined && drainFailure === undefined) ensureDrain();
      });
  };
  for await (const message of messages) {
    if (signal.aborted) break;
    pending = { message };
    ensureDrain();
  }
  while (drain !== undefined) await drain;
  if (drainFailure !== undefined) throw drainFailure;
}

function sourceDispatchError(cause: unknown): Error {
  return cause instanceof Error
    ? cause
    : new Error('TUI event source dispatch failed.', { cause });
}

async function dispatchLifecycle<TMessage>(
  source: TuiEventSource<TMessage>,
  event: TuiSourceLifecycle,
  sourceName: TuiMessageSource,
  lease: ProducerAdmissionLease,
  dispatch: (message: TMessage, source: TuiMessageSource, lease: ProducerAdmissionLease) => Promise<void>
): Promise<void> {
  if (source.onLifecycle === undefined) return;
  const message = source.onLifecycle(event);
  if (!isIgnoredMessage(message)) await dispatch(message, sourceName, lease);
}

async function settleSource<TMessage>(active: ActiveTuiEventSource<TMessage>): Promise<void> {
  await active.completion;
}

function assertUniqueSourceIds<TMessage>(
  sources: readonly TuiEventSource<TMessage>[],
  reportDiagnostic: (item: TerminalDiagnostic) => void
): void {
  const seen = new Set<SubscriptionExecutionId>();
  for (const source of sources) {
    const id = subscriptionExecutionId(source.id);
    if (seen.has(id)) {
      const item = diagnostic('TUI_SOURCE_DUPLICATE_ID', `Duplicate TUI event source id: ${id}.`, {
        target: id,
        data: { generation: source.generation }
      });
      reportDiagnostic(item);
      throw new Error(item.message);
    }
    seen.add(id);
  }
}

function sourceFailure<TMessage>(
  source: ActiveTuiEventSource<TMessage>,
  cause: unknown
): TerminalDiagnostic {
  return diagnostic('TUI_SOURCE_FAILED', `TUI event source ${source.id} failed.`, {
    target: source.id,
    cause,
    data: { delivery: source.source.delivery, generation: source.generation }
  });
}
