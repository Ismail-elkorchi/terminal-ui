import { diagnostic } from '../diagnostics.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import { isIgnoredMessage } from '../interaction/message.ts';
import { createProducerAdmissionLease } from './producer-admission.ts';
import type { ProducerAdmissionLease } from './producer-admission.ts';
import { decodeTuiEventSources } from './hook-results.ts';
import { createTuiSourceChannel, decodeTuiSourceEmission } from './source-channel.ts';
import type { TuiSourceChannel } from './source-channel.ts';
import type {
  TuiContext,
  TuiEventSource,
  TuiMessageSource,
  TuiSourceLifecycle,
  TuiSubscriptionContext,
  TuiSubscriptions
} from './types.ts';
import type { TuiSourceChannelMetrics } from './types.ts';

interface ActiveTuiEventSource<TMessage> {
  readonly id: string;
  readonly generation: string | number;
  readonly controller: AbortController;
  readonly lease: ProducerAdmissionLease;
  readonly source: TuiEventSource<TMessage>;
  readonly channel: TuiSourceChannel<TMessage>;
  metricsRetained: boolean;
  completion: Promise<void>;
  disposal?: Promise<void>;
}

interface TerminalSourceGeneration {
  readonly generation: string | number;
  readonly outcome: 'completed' | 'failed';
}

/** The source set calculated for a state and ready for post-commit activation. */
export interface TuiSubscriptionPlan<TMessage> {
  readonly context: TuiContext;
  readonly sources: readonly TuiEventSource<TMessage>[];
}

export interface TuiSubscriptionManager<TState, TMessage> {
  plan(state: TState, context?: TuiContext): Promise<TuiSubscriptionPlan<TMessage>>;
  activate(plan: TuiSubscriptionPlan<TMessage>): void;
  reconcile(state: TState): Promise<void>;
  cancel(): void;
  dispose(): Promise<void>;
  metrics(): TuiSourceChannelMetrics;
}

export interface TuiSubscriptionManagerOptions<TState, TMessage> {
  readonly subscriptions?: TuiSubscriptions<TState, TMessage>;
  readonly dispatchMany: (
    messages: readonly TMessage[],
    source: TuiMessageSource,
    lease: ProducerAdmissionLease
  ) => Promise<void>;
  readonly context: () => Promise<TuiContext>;
  readonly reportDiagnostic: (item: TerminalDiagnostic) => void;
}

export function createTuiSubscriptionManager<TState, TMessage>(
  options: TuiSubscriptionManagerOptions<TState, TMessage>
): TuiSubscriptionManager<TState, TMessage> {
  const active = new Map<string, ActiveTuiEventSource<TMessage>>();
  const terminal = new Map<string, TerminalSourceGeneration>();
  const retiring = new Set<Promise<void>>();
  const retiringSources = new Set<ActiveTuiEventSource<TMessage>>();
  const retirementFailures: unknown[] = [];
  const retainedMetrics = emptySourceMetrics();
  let disposed = false;

  return {
    async plan(state, suppliedContext) {
      const context = suppliedContext ?? await options.context();
      const supplied: unknown = options.subscriptions?.(state, context) ?? [];
      const sources = decodeTuiEventSources<TMessage>(supplied);
      assertUniqueSourceIds(sources, options.reportDiagnostic);
      return { context, sources };
    },
    activate(plan) {
      applyPlan(plan);
    },
    async reconcile(state) {
      const plan = await this.plan(state);
      applyPlan(plan);
    },
    cancel() {
      retireAll();
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      retireAll();
      await Promise.all([...retiring]);
      const failures = retirementFailures.splice(0);
      if (failures.length > 0) throw new AggregateError(failures, 'TUI subscription disposal failed.');
    },
    metrics() {
      const result = { ...retainedMetrics };
      for (const source of active.values()) {
        if (!source.metricsRetained) addSourceMetrics(result, source.channel.metrics());
      }
      for (const source of retiringSources) {
        if (!source.metricsRetained) addSourceMetrics(result, source.channel.metrics());
      }
      return Object.freeze(result);
    },
  };

  function applyPlan(plan: TuiSubscriptionPlan<TMessage>): void {
    if (disposed) return;
    const requestedIds = new Set(plan.sources.map((source) => source.id));
    for (const id of terminal.keys()) {
      if (!requestedIds.has(id)) terminal.delete(id);
    }
    for (const [id, activeSource] of active) {
      const requested = plan.sources.find((source) => source.id === id);
      if (requested?.generation !== activeSource.generation) {
        active.delete(id);
        retireSource(activeSource);
      }
    }
    for (const source of plan.sources) {
      const id = source.id;
      if (active.has(id)) continue;
      const outcome = terminal.get(id);
      if (outcome?.generation === source.generation) continue;
      terminal.delete(id);
      const activeSource = startSource(source, plan.context);
      active.set(id, activeSource);
    }
  }

  function startSource(
    source: TuiEventSource<TMessage>,
    baseContext: TuiContext
  ): ActiveTuiEventSource<TMessage> {
    const controller = new AbortController();
    const id = source.id;
    const lease = createProducerAdmissionLease('subscription', `${id}:${String(source.generation)}`, controller.signal);
    const sourceName = source.source ?? 'external';
    const channel = createTuiSourceChannel<TMessage>({
      ...(source.channel === undefined ? {} : { capacity: source.channel.capacity }),
      ...(source.channel?.cadenceMs === undefined ? {} : {
        cadence: { intervalMs: source.channel.cadenceMs, clock: baseContext.clock },
      }),
      dispatchMany: (messages) => options.dispatchMany(messages, sourceName, lease),
    });
    const activeSource: ActiveTuiEventSource<TMessage> = {
      id,
      generation: source.generation,
      controller,
      lease,
      source,
      channel,
      metricsRetained: false,
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
      .finally(() => {
        activeSource.lease.revoke();
        retainSourceMetrics(activeSource);
        retiringSources.delete(activeSource);
      });
    return activeSource;
  }

  async function pumpSource(
    activeSource: ActiveTuiEventSource<TMessage>,
    context: TuiSubscriptionContext
  ): Promise<'completed' | 'failed'> {
    const sourceName = activeSource.source.source ?? 'external';
    try {
      let emissionIndex = 0;
      await activeSource.source.run(context, Object.freeze({
        emit: async (value: import('./types.ts').TuiSourceEmission<TMessage>) => {
          if (context.signal.aborted) return;
          const emission = decodeTuiSourceEmission<TMessage>(
            value,
            `TUI event source ${activeSource.id} emission ${String(emissionIndex)}`,
          );
          emissionIndex += 1;
          await activeSource.channel.admit(emission);
        },
      }));
      await activeSource.channel.close();
      if (context.signal.aborted) return 'completed';
      await dispatchLifecycle(activeSource.source, {
        kind: 'completed',
        id: activeSource.id,
        generation: activeSource.generation
      }, sourceName, activeSource.lease, options.dispatchMany);
      return 'completed';
    } catch (cause) {
      activeSource.channel.cancel();
      if (context.signal.aborted) return 'completed';
      const provisional = sourceFailure(activeSource, cause);
      let finalCause = cause;
      try {
        await dispatchLifecycle(activeSource.source, {
          kind: 'failed',
          id: activeSource.id,
          generation: activeSource.generation,
          diagnostic: provisional
        }, sourceName, activeSource.lease, options.dispatchMany);
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
    if (source.metricsRetained || retiringSources.has(source)) return;
    retiringSources.add(source);
    source.lease.revoke();
    source.controller.abort();
    source.channel.cancel();
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
      options.reportDiagnostic(diagnostic('TUI_SOURCE_FAILED', `TUI event source ${source.id} cleanup failed.`, {
        target: source.id,
        cause,
        data: { generation: source.generation, phase: 'dispose' }
      }));
    });
    return source.disposal;
  }

  function retainSourceMetrics(source: ActiveTuiEventSource<TMessage>): void {
    if (source.metricsRetained) return;
    source.metricsRetained = true;
    addSourceMetrics(retainedMetrics, source.channel.metrics());
  }
}

async function invokeSourceDisposer<TMessage>(source: ActiveTuiEventSource<TMessage>): Promise<void> {
  await source.source.dispose?.();
}

async function dispatchLifecycle<TMessage>(
  source: TuiEventSource<TMessage>,
  event: TuiSourceLifecycle,
  sourceName: TuiMessageSource,
  lease: ProducerAdmissionLease,
  dispatchMany: (messages: readonly TMessage[], source: TuiMessageSource, lease: ProducerAdmissionLease) => Promise<void>
): Promise<void> {
  if (source.onLifecycle === undefined) return;
  const message = source.onLifecycle(event);
  if (!isIgnoredMessage(message)) await dispatchMany([message], sourceName, lease);
}

async function settleSource<TMessage>(active: ActiveTuiEventSource<TMessage>): Promise<void> {
  await active.completion;
}

function assertUniqueSourceIds<TMessage>(
  sources: readonly TuiEventSource<TMessage>[],
  reportDiagnostic: (item: TerminalDiagnostic) => void
): void {
  const seen = new Set<string>();
  for (const source of sources) {
    const id = source.id;
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
    data: { generation: source.generation }
  });
}

function emptySourceMetrics(): TuiSourceChannelMetrics {
  return {
    reliableAdmissions: 0,
    replaceableAdmissions: 0,
    replacements: 0,
    dispatchedMessages: 0,
    dispatchedBatches: 0,
    maximumBuffered: 0,
    cadenceFlushes: 0,
  };
}

function addSourceMetrics(
  target: { -readonly [TKey in keyof TuiSourceChannelMetrics]: number },
  source: TuiSourceChannelMetrics,
): void {
  target.reliableAdmissions += source.reliableAdmissions;
  target.replaceableAdmissions += source.replaceableAdmissions;
  target.replacements += source.replacements;
  target.dispatchedMessages += source.dispatchedMessages;
  target.dispatchedBatches += source.dispatchedBatches;
  target.maximumBuffered = Math.max(target.maximumBuffered, source.maximumBuffered);
  target.cadenceFlushes += source.cadenceFlushes;
}
