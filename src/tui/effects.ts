import { diagnostic } from '../diagnostics.ts';
import { effectExecutionId } from '../foundation/identity.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { TerminalClock } from '../host/index.ts';
import { createProducerAdmissionLease } from './producer-admission.ts';
import type { ProducerAdmissionLease } from './producer-admission.ts';
import type {
  TuiContext,
  TuiEffect,
  TuiEffectContext,
  TuiEffectOutput,
  TuiEffectPolicy
} from './types.ts';

interface ActiveEffect {
  readonly id: string;
  readonly controller: AbortController;
  readonly lease: ProducerAdmissionLease;
  completion: Promise<void>;
}

export interface TuiEffectManagerMetrics {
  readonly active: number;
  readonly queued: number;
  readonly rejected: number;
}

export interface TuiEffectManager<TMessage> {
  start(effects: readonly TuiEffect<TMessage>[]): void;
  cancel(): void;
  dispose(): Promise<void>;
  metrics(): TuiEffectManagerMetrics;
}

export interface TuiEffectManagerOptions<TMessage> {
  readonly clock: TerminalClock;
  readonly context: () => Promise<TuiContext>;
  readonly dispatch: (messages: readonly TMessage[], lease: ProducerAdmissionLease) => Promise<void>;
  readonly reportDiagnostic: (item: TerminalDiagnostic) => void;
  readonly withTerminalSuspended?: <TValue>(
    operation: () => Promise<TValue>,
    signal: AbortSignal
  ) => Promise<TValue>;
  readonly policy?: TuiEffectPolicy;
}

export const defaultTuiEffectPolicy: TuiEffectPolicy = {
  maxActive: 32,
  maxActivePerId: 4,
  maxQueued: 256,
  maxQueuedPerId: 64,
  replacementGracePeriodMs: 1_000
};

export function createTuiEffectManager<TMessage>(
  options: TuiEffectManagerOptions<TMessage>
): TuiEffectManager<TMessage> {
  const policy = normalizeEffectPolicy(options.policy);
  const active = new Set<ActiveEffect>();
  const activeById = new Map<string, Set<ActiveEffect>>();
  const queues = new Map<string, TuiEffect<TMessage>[]>();
  const pendingReplacements = new Map<string, TuiEffect<TMessage>>();
  const replacementDeadlines = new Map<string, ReplacementDeadline>();
  const executionFailures: unknown[] = [];
  let rejected = 0;
  let disposed = false;

  function launch(effect: TuiEffect<TMessage>): void {
    const id = effectExecutionId(effect.id);
    const controller = new AbortController();
    const lease = createProducerAdmissionLease('effect', id, controller.signal);
    const execution: ActiveEffect = { id, controller, lease, completion: Promise.resolve() };
    execution.completion = executeEffect(effect, execution, options)
      .catch((cause: unknown) => {
        executionFailures.push(cause);
      })
      .finally(() => {
        execution.lease.revoke();
        active.delete(execution);
        const group = activeById.get(id);
        group?.delete(execution);
        if (group?.size === 0) activeById.delete(id);
        launchPending(id);
      });
    active.add(execution);
    const group = activeById.get(id) ?? new Set<ActiveEffect>();
    group.add(execution);
    activeById.set(id, group);
  }

  function hasCapacity(id: string): boolean {
    return active.size < policy.maxActive
      && (activeById.get(id)?.size ?? 0) < policy.maxActivePerId;
  }

  function launchPending(preferredId?: string): void {
    if (disposed) return;
    if (preferredId !== undefined && hasCapacity(preferredId)) {
      const replacement = pendingReplacements.get(preferredId);
      if (replacement !== undefined) {
        pendingReplacements.delete(preferredId);
        cancelReplacementDeadline(preferredId);
        launch(replacement);
        return;
      }
      const queued = queues.get(preferredId)?.shift();
      if (queues.get(preferredId)?.length === 0) queues.delete(preferredId);
      if (queued !== undefined) {
        launch(queued);
        return;
      }
    }
    for (const [id, replacement] of pendingReplacements) {
      if (!hasCapacity(id)) continue;
      pendingReplacements.delete(id);
      cancelReplacementDeadline(id);
      launch(replacement);
      return;
    }
    for (const [id, queue] of queues) {
      if (!hasCapacity(id)) continue;
      const next = queue.shift();
      if (queue.length === 0) queues.delete(id);
      if (next !== undefined) launch(next);
      return;
    }
  }

  function schedule(effect: TuiEffect<TMessage>): void {
    const id = effectExecutionId(effect.id);
    const hasActive = activeById.has(id);
    if (effect.concurrency === 'keep-first') {
      if (!hasActive && !pendingReplacements.has(id) && (queues.get(id)?.length ?? 0) === 0) {
        if (hasCapacity(id)) launch(effect);
        else enqueue(effect, id);
      }
      return;
    }
    if (effect.concurrency === 'replace') {
      const activeForId = activeById.get(id);
      for (const execution of activeForId ?? []) {
        execution.lease.revoke();
        execution.controller.abort();
      }
      queues.delete(id);
      if (hasCapacity(id)) {
        cancelReplacementDeadline(id);
        launch(effect);
      } else if (pendingReplacements.has(id) || canQueueReplacement()) {
        pendingReplacements.set(id, effect);
        if ((activeForId?.size ?? 0) > 0) startReplacementDeadline(id, effect);
      } else {
        rejectEffect(effect, 'queue_limit');
      }
      return;
    }
    if (effect.concurrency === 'parallel') {
      if (hasCapacity(id)) launch(effect);
      else rejectEffect(effect, 'active_limit');
      return;
    }
    if (hasCapacity(id) && !hasActive && (queues.get(id)?.length ?? 0) === 0) launch(effect);
    else enqueue(effect, id);
  }

  function enqueue(effect: TuiEffect<TMessage>, id: string): void {
    const queue = queues.get(id) ?? [];
    if (queuedCount(queues) >= policy.maxQueued || queue.length >= policy.maxQueuedPerId) {
      rejectEffect(effect, 'queue_limit');
      return;
    }
    queue.push(effect);
    queues.set(id, queue);
  }

  function rejectEffect(
    effect: TuiEffect<TMessage>,
    reason: 'active_limit' | 'queue_limit' | 'replacement_timeout'
  ): void {
    rejected += 1;
    try {
      options.reportDiagnostic(diagnostic('TUI_EFFECT_REJECTED', `TUI effect ${effect.id} was rejected by the execution policy.`, {
        target: effect.id,
        data: { reason, ...policy }
      }));
    } catch (cause) {
      executionFailures.push(cause);
    }
  }

  return {
    start(effects) {
      if (disposed) return;
      for (const effect of effects) schedule(effect);
    },
    cancel() {
      cancelAll();
    },
    async dispose() {
      const deadlines = [...replacementDeadlines.values()];
      cancelAll();
      await Promise.allSettled([
        ...[...active].map((item) => item.completion),
        ...deadlines.map((item) => item.completion)
      ]);
      active.clear();
      activeById.clear();
      if (executionFailures.length > 0) {
        throw new AggregateError(executionFailures.splice(0), 'TUI effect execution cleanup failed.');
      }
    },
    metrics() {
      return {
        active: active.size,
        queued: queuedCount(queues) + pendingReplacements.size,
        rejected
      };
    }
  };

  function cancelAll(): void {
    disposed = true;
    queues.clear();
    pendingReplacements.clear();
    for (const deadline of replacementDeadlines.values()) deadline.controller.abort();
    replacementDeadlines.clear();
    for (const execution of active) {
      execution.lease.revoke();
      execution.controller.abort();
    }
  }

  function canQueueReplacement(): boolean {
    return queuedCount(queues) + pendingReplacements.size < policy.maxQueued;
  }

  function startReplacementDeadline(id: string, effect: TuiEffect<TMessage>): void {
    cancelReplacementDeadline(id);
    const controller = new AbortController();
    const deadline: ReplacementDeadline = {
      controller,
      completion: Promise.resolve()
    };
    deadline.completion = options.clock.sleep(policy.replacementGracePeriodMs, controller.signal)
      .then(() => {
        if (controller.signal.aborted || pendingReplacements.get(id) !== effect) return;
        pendingReplacements.delete(id);
        rejectEffect(effect, 'replacement_timeout');
      })
      .catch((cause: unknown) => {
        executionFailures.push(cause);
      })
      .finally(() => {
        if (replacementDeadlines.get(id) === deadline) replacementDeadlines.delete(id);
      });
    replacementDeadlines.set(id, deadline);
  }

  function cancelReplacementDeadline(id: string): void {
    const deadline = replacementDeadlines.get(id);
    if (deadline === undefined) return;
    replacementDeadlines.delete(id);
    deadline.controller.abort();
  }
}

interface ReplacementDeadline {
  readonly controller: AbortController;
  completion: Promise<void>;
}

async function executeEffect<TMessage>(
  effect: TuiEffect<TMessage>,
  execution: ActiveEffect,
  options: TuiEffectManagerOptions<TMessage>
): Promise<void> {
  const { controller, lease } = execution;
  let base: TuiContext;
  try {
    base = await options.context();
  } catch (cause) {
    if (controller.signal.aborted) return;
    await recoverEffect(effect, cause, 'context', lease, options);
    return;
  }
  if (controller.signal.aborted) return;
  let output: TuiEffectOutput<TMessage>;
  try {
    const context: TuiEffectContext = {
      ...base,
      signal: controller.signal,
      withTerminalSuspended: <TValue>(operation: () => Promise<TValue>) => {
        const suspend = options.withTerminalSuspended;
        return suspend === undefined
          ? Promise.reject(new Error('Terminal suspension is only available to runtimes owned by runTui().'))
          : suspend(operation, controller.signal);
      }
    };
    if (signalIsAborted(controller.signal)) return;
    output = await effect.run(context);
  } catch (cause) {
    if (signalIsAborted(controller.signal)) return;
    await recoverEffect(effect, cause, 'run', lease, options);
    return;
  }
  if (output.kind === 'none' || signalIsAborted(controller.signal)) return;
  try {
    await options.dispatch(outputMessages(output), lease);
  } catch (cause) {
    reportDispatchFailure(effect, cause, lease, options);
  }
}

function reportDispatchFailure<TMessage>(
  effect: TuiEffect<TMessage>,
  cause: unknown,
  lease: ProducerAdmissionLease,
  options: TuiEffectManagerOptions<TMessage>
): void {
  if (lease.authorized()) options.reportDiagnostic(effectFailure(effect, cause, 'dispatch'));
}

function signalIsAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

async function recoverEffect<TMessage>(
  effect: TuiEffect<TMessage>,
  cause: unknown,
  phase: 'context' | 'run',
  lease: ProducerAdmissionLease,
  options: TuiEffectManagerOptions<TMessage>
): Promise<void> {
  let failureCause = cause;
  let failurePhase: 'context' | 'run' | 'onError' | 'error_dispatch' = phase;
  let output: TuiEffectOutput<TMessage> | undefined;
  const initial = effectFailure(effect, cause, phase);
  try {
    output = effect.onError?.({ id: effect.id, diagnostic: initial });
  } catch (handlerCause) {
    failureCause = new AggregateError([cause, handlerCause], 'TUI effect and its error mapper failed.');
    failurePhase = 'onError';
  }
  if (output !== undefined && output.kind !== 'none' && lease.authorized()) {
    try {
      await options.dispatch(outputMessages(output), lease);
    } catch (dispatchCause) {
      failureCause = new AggregateError([cause, dispatchCause], 'TUI effect recovery dispatch failed.');
      failurePhase = 'error_dispatch';
    }
  }
  if (lease.authorized()) options.reportDiagnostic(effectFailure(effect, failureCause, failurePhase));
}

function outputMessages<TMessage>(output: Exclude<TuiEffectOutput<TMessage>, { readonly kind: 'none' }>): readonly TMessage[] {
  return output.kind === 'message' ? [output.message] : output.messages;
}

function effectFailure(
  effect: TuiEffect<unknown>,
  cause: unknown,
  phase: 'context' | 'run' | 'dispatch' | 'onError' | 'error_dispatch'
): TerminalDiagnostic {
  return diagnostic('TUI_EFFECT_FAILED', `TUI effect ${effect.id} failed.`, {
    target: effect.id,
    cause,
    data: { phase }
  });
}

function queuedCount<TMessage>(queues: ReadonlyMap<string, readonly TuiEffect<TMessage>[]>): number {
  let count = 0;
  for (const queue of queues.values()) count += queue.length;
  return count;
}

function normalizeEffectPolicy(policy: TuiEffectPolicy | undefined): TuiEffectPolicy {
  const result = policy ?? defaultTuiEffectPolicy;
  for (const [key, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value < (key === 'replacementGracePeriodMs' ? 0 : 1)) {
      throw new RangeError(`TUI effect policy ${key} must be a ${key === 'replacementGracePeriodMs' ? 'non-negative' : 'positive'} safe integer.`);
    }
  }
  return result;
}
