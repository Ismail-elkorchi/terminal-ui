import { TerminalUiError } from '../../errors.ts';
import { assertRuntimeLimit } from './runtime-policy.ts';
import { cancellationMatches, removedWork } from './work-ownership.ts';
import type { TerminalDiagnostic } from '../../diagnostics.ts';
import { diagnostic } from '../../diagnostics.ts';
import type { TuiMessageSource } from '../../interaction/message.ts';
import { isIgnoredMessage } from '../../interaction/message.ts';
import { decodeTuiEventSources, decodeMessageResolution } from '../hook-results.ts';
import type { ProducerAdmissionLease } from './producer-admission.ts';
import { createProducerAdmissionLease } from './producer-admission.ts';
import type { TuiSourceChannel } from './source-channel.ts';
import { createTuiSourceChannel, decodeTuiSourceEmission } from './source-channel.ts';
import type {
  TuiCancellation,
  TuiContext,
  TuiEventSource,
  TuiSourceChannelMetrics,
  TuiSourceLifecycle,
  TuiSubscriptionContext,
  TuiSubscriptions,
} from '../types.ts';

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
  physicallySettled: boolean;
  readonly token: SourceObligation;
}

interface SourceObligation {
  readonly capacity: number;
  released: boolean;
  creditReserved: boolean;
  source?: { readonly lease: ProducerAdmissionLease; readonly physicallySettled: boolean };
}

interface TerminalSourceGeneration {
  readonly generation: string | number;
  readonly outcome: 'completed' | 'failed';
}

/** The source set calculated for a state and ready for post-commit activation. */
export interface TuiSubscriptionPlan<TMessage> {
  readonly context: TuiContext;
  readonly sources: readonly TuiEventSource<TMessage>[];
  activate(): void;
  release(): void;
}

export interface TuiSubscriptionManager<TState, TMessage> {
  plan(state: TState, context?: TuiContext, cancel?: readonly TuiCancellation[], completing?: ProducerAdmissionLease): Promise<TuiSubscriptionPlan<TMessage>>;
  activate(plan: TuiSubscriptionPlan<TMessage>, cancel?: readonly TuiCancellation[]): void;
  cancelRequests(requests: readonly TuiCancellation[]): void;
  reconcile(state: TState): Promise<void>;
  cancel(): void;
  dispose(): Promise<void>;
  metrics(): TuiSourceChannelMetrics & { readonly owned: number; readonly capacity: number; readonly retiring: number };
}

export interface TuiSubscriptionManagerOptions<TState, TMessage> {
  readonly subscriptions?: TuiSubscriptions<TState, TMessage>;
  readonly maxOwned?: number;
  readonly maxCapacity?: number;
  readonly maxBatchMessages?: number;
  readonly fatal?: (cause: unknown) => void;
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
  const owned = new Set<SourceObligation>();
  const requested = new Map<string, string | number>();
  const active = new Map<string, ActiveTuiEventSource<TMessage>>();
  const terminal = new Map<string, TerminalSourceGeneration>();
  const retiring = new Set<Promise<void>>();
  const retiringSources = new Set<ActiveTuiEventSource<TMessage>>();
  let retirementFailure: unknown;
  const retainedMetrics = emptySourceMetrics();
  let disposed = false;

  return {
    async plan(state, suppliedContext, cancel = [], completing) {
      const context = suppliedContext ?? await options.context();
      const supplied: unknown = options.subscriptions?.(state, context) ?? [];
      const sources = decodeTuiEventSources<TMessage>(supplied, options.maxOwned ?? 64)
        .filter((source) => !removedWork(source, cancel));
      assertUniqueSourceIds(sources, options.reportDiagnostic);
      const additions = sources.filter((source) => active.get(source.id)?.generation !== source.generation
        && terminal.get(source.id)?.generation !== source.generation);
      const credit = completing === undefined ? undefined : [...owned].find((token) =>
        !token.creditReserved && token.source?.lease === completing && token.source.physicallySettled);
      const capacity = additions.reduce((sum, source) => sum + (source.channel?.capacity ?? 64), 0);
      const retainedCapacity = [...owned].reduce((sum, token) => sum + token.capacity, 0);
      const needsCredit = additions.length > 0 && (owned.size + additions.length > (options.maxOwned ?? 64)
        || retainedCapacity + capacity > (options.maxCapacity ?? 4_096)) ? credit : undefined;
      assertRuntimeLimit('owned_sources', owned.size + additions.length - Number(needsCredit !== undefined), options.maxOwned ?? 64);
      assertRuntimeLimit('source_capacity', retainedCapacity + capacity - (needsCredit?.capacity ?? 0), options.maxCapacity ?? 4_096);
      if (needsCredit !== undefined) needsCredit.creditReserved = true;
      const reservations = new Map<TuiEventSource<TMessage>, SourceObligation>();
      for (const source of additions) {
        const token = { capacity: source.channel?.capacity ?? 64, released: false, creditReserved: false };
        owned.add(token); reservations.set(source, token);
      }
      let pending = true;
      return {
        context, sources,
        activate() {
          if (!pending) return;
          pending = false;
          if (needsCredit !== undefined) release(needsCredit);
          applyPlan({ context, sources }, reservations);
        },
        release() {
          if (!pending) return;
          pending = false;
          if (needsCredit !== undefined) needsCredit.creditReserved = false;
          for (const token of reservations.values()) release(token);
        },
      };
    },
    activate(plan) { plan.activate(); },
    cancelRequests(requests) {
      for (const [id, source] of active) {
        if (!requests.some((request) => request.kind === 'child' && cancellationMatches(request, source.source))) continue;
        active.delete(id);
        terminal.delete(id);
        retireSource(source);
      }
    },
    async reconcile(state) {
      const plan = await this.plan(state);
      plan.activate();
    },
    cancel() {
      retireAll();
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      retireAll();
      await Promise.all([...retiring]);
      if (retirementFailure !== undefined) throw new AggregateError([retirementFailure], 'TUI subscription disposal failed.');
    },
    metrics() {
      const result = { ...retainedMetrics };
      for (const source of active.values()) {
        if (!source.metricsRetained) addSourceMetrics(result, source.channel.metrics());
      }
      for (const source of retiringSources) {
        if (!source.metricsRetained) addSourceMetrics(result, source.channel.metrics());
      }
      return Object.freeze({ ...result,
        owned: [...owned].filter((token) => !token.creditReserved).length,
        capacity: [...owned].reduce((sum, token) => sum + (token.creditReserved ? 0 : token.capacity), 0),
        retiring: retiringSources.size,
      });
    },
  };

  function release(token: SourceObligation): void {
    if (token.released) return;
    token.released = true;
    owned.delete(token);
  }

  function applyPlan(plan: Pick<TuiSubscriptionPlan<TMessage>, 'context' | 'sources'>,
    reservations: ReadonlyMap<TuiEventSource<TMessage>, SourceObligation>): void {
    if (disposed) { for (const token of reservations.values()) release(token); return; }
    requested.clear();
    for (const source of plan.sources) requested.set(source.id, source.generation);
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
      const token = reservations.get(source);
      if (token === undefined) continue;
      const activeSource = startSource(source, plan.context, token);
      active.set(id, activeSource);
    }
  }

  function startSource(
    source: TuiEventSource<TMessage>,
    baseContext: TuiContext,
    token: SourceObligation,
  ): ActiveTuiEventSource<TMessage> {
    const controller = new AbortController();
    const id = source.id;
    const lease = createProducerAdmissionLease('subscription', `${id}:${String(source.generation)}`, controller.signal);
    const sourceName = source.source ?? 'external';
    const channel = createTuiSourceChannel<TMessage>({
      ...(options.maxBatchMessages === undefined ? {} : { maxBatchMessages: options.maxBatchMessages }),
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
      physicallySettled: false,
      token,
      completion: Promise.resolve()
    };
    token.source = activeSource;
    const context: TuiSubscriptionContext = { ...baseContext, signal: controller.signal };
    activeSource.completion = pumpSource(activeSource, context)
      .then(async (outcome) => {
        if (active.get(id) === activeSource && !context.signal.aborted && requested.get(id) === source.generation) {
          terminal.set(id, { generation: source.generation, outcome });
        }
        await disposeSource(activeSource);
        if (active.get(id) === activeSource) active.delete(id);
      })
      .catch((cause: unknown) => {
        if (active.get(id) === activeSource) active.delete(id);
        retirementFailure ??= cause;
        options.fatal?.(cause);
      })
      .finally(() => {
        activeSource.lease.revoke();
        retainSourceMetrics(activeSource);
        retiringSources.delete(activeSource);
        release(token);
      });
    return activeSource;
  }

  async function pumpSource(
    activeSource: ActiveTuiEventSource<TMessage>,
    context: TuiSubscriptionContext
  ): Promise<'completed' | 'failed'> {
    const sourceName = activeSource.source.source ?? 'external';
    let lifecycleStarted = false;
    try {
      let emissionIndex = 0;
      await activeSource.source.run(context, Object.freeze({
        emit: async (value: import('../types.ts').TuiSourceEmission<TMessage>) => {
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
      await settleSourceWork(activeSource);
      if (context.signal.aborted) return 'completed';
      lifecycleStarted = true;
      await dispatchLifecycle(activeSource.source, {
        kind: 'completed',
        id: activeSource.id,
        generation: activeSource.generation
      }, sourceName, activeSource.lease, options.dispatchMany);
      return 'completed';
    } catch (cause) {
      activeSource.channel.cancel();
      await settleSourceWork(activeSource);
      if (context.signal.aborted) return 'completed';
      if (lifecycleStarted) {
        options.fatal?.(new TerminalUiError('TUI source completion settlement failed.', { code: 'TUI_RUNTIME_FAULT', reason: 'source_lifecycle', cause }));
        return 'failed';
      }
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
        finalCause = new TerminalUiError('TUI source lifecycle settlement failed.', {
          code: 'TUI_RUNTIME_FAULT', reason: 'source_lifecycle', cause: lifecycleCause,
        });
        options.fatal?.(finalCause);
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
      retirementFailure ??= cause;
    });
    retiring.add(cleanup);
    void cleanup.then(() => retiring.delete(cleanup));
  }

  function disposeSource(source: ActiveTuiEventSource<TMessage>): Promise<void> {
    source.disposal ??= invokeSourceDisposer(source).catch((cause: unknown) => {
      retirementFailure ??= cause;
      options.reportDiagnostic(diagnostic('TUI_SOURCE_FAILED', `TUI event source ${source.id} cleanup failed.`, {
        target: source.id,
        cause,
        data: { generation: source.generation, phase: 'dispose' }
      }));
    });
    return source.disposal;
  }

  async function settleSourceWork(source: ActiveTuiEventSource<TMessage>): Promise<void> {
    // The producer has returned, but cancel/failed close can precede its physical
    // dispatch drain. Keep its obligation until both drain and disposer settle,
    // even when a cleanup diagnostic callback throws.
    const [disposal] = await Promise.allSettled([disposeSource(source), source.channel.settle()]);
    source.physicallySettled = true;
    if (disposal.status === 'rejected') throw disposal.reason;
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
  const message = decodeMessageResolution<TMessage>(source.onLifecycle(event), 'TUI source lifecycle message');
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
