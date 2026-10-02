import { cancellationMatches, copyWorkOwnership } from './work-ownership.ts';
import type { TerminalDiagnostic } from '../../diagnostics.ts';
import { diagnostic } from '../../diagnostics.ts';
import type { TerminalClock } from '../../host/types.ts';
import { decodeTuiEffectOutput } from '../hook-results.ts';
import type { ProducerAdmissionLease } from './producer-admission.ts';
import { createProducerAdmissionLease } from './producer-admission.ts';
import { decodeCopySelectedTextInput } from '../selection.ts';
import type {
  TuiCancellation,
  TuiContext,
  TuiEffect,
  TuiEffectContext,
  TuiEffectOutput,
  TuiEffectPolicy,
} from '../types.ts';

interface EffectExecution {
  readonly id: string;
  readonly controller: AbortController;
  readonly lease: ProducerAdmissionLease;
  completion: Promise<void>;
}

interface ScheduledEffect<TMessage> {
  readonly effect: TuiEffect<TMessage>;
  readonly redacted: boolean;
}

export interface TuiEffectManagerMetrics {
  readonly active: number;
  readonly queued: number;
  readonly rejected: number;
}

export interface TuiEffectManager<TMessage> {
  start(effects: readonly TuiEffect<TMessage>[], redacted?: boolean): void;
  cancelRequests(requests: readonly TuiCancellation[]): void;
  cancel(): void;
  dispose(): Promise<void>;
  metrics(): TuiEffectManagerMetrics;
}

export interface TuiEffectManagerOptions<TMessage> {
  readonly clock: TerminalClock;
  readonly context: () => Promise<TuiContext>;
  readonly dispatch: (
    messages: readonly TMessage[], lease: ProducerAdmissionLease, redacted: boolean
  ) => Promise<void>;
  readonly reportDiagnostic: (item: TerminalDiagnostic) => void;
  readonly copySelectedText: (
    input: import('../selection.ts').CopySelectedTextInput,
    signal: AbortSignal,
  ) => Promise<import('../selection.ts').CopySelectedTextResult>;
  readonly withTerminalSuspended?: <TValue>(
    operation: () => Promise<TValue>,
    signal: AbortSignal
  ) => Promise<TValue>;
  readonly policy?: TuiEffectPolicy;
}

export const defaultTuiEffectPolicy: TuiEffectPolicy = Object.freeze({
  maxActive: 32,
  maxActivePerId: 4,
  maxQueued: 256,
  maxQueuedPerId: 64,
  replacementGracePeriodMs: 1_000
});

export function createTuiEffectManager<TMessage>(
  options: TuiEffectManagerOptions<TMessage>
): TuiEffectManager<TMessage> {
  const policy = normalizeEffectPolicy(options.policy);
  const active = new Set<EffectExecution>();
  // Reliable terminal messages await ordinary dispatch; only their admission identity is retained here.
  const recovering = new Set<EffectExecution>();
  const activeById = new Map<string, Set<EffectExecution>>();
  const queues = new Map<string, ScheduledEffect<TMessage>[]>();
  const pendingReplacements = new Map<string, ScheduledEffect<TMessage>>();
  const replacementDeadlines = new Map<string, ReplacementDeadline>();
  const executionFailures: unknown[] = [];
  let rejected = 0;
  let disposed = false;

  function launch(scheduled: ScheduledEffect<TMessage>): void {
    const { effect } = scheduled;
    const id = effect.id;
    const execution = createExecution(effect);
    execution.completion = executeEffect(effect, scheduled.redacted, execution, options)
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
    const group = activeById.get(id) ?? new Set<EffectExecution>();
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

  function schedule(scheduled: ScheduledEffect<TMessage>): void {
    const { effect } = scheduled;
    const id = effect.id;
    const hasActive = activeById.has(id);
    if (effect.concurrency === 'keep-first') {
      if (!hasActive && !pendingReplacements.has(id) && (queues.get(id)?.length ?? 0) === 0) {
        if (hasCapacity(id)) launch(scheduled);
        else enqueue(scheduled, id);
      }
      return;
    }
    if (effect.concurrency === 'replace') {
      cancelRecovery(id);
      const activeForId = activeById.get(id);
      for (const execution of activeForId ?? []) {
        cancelExecution(execution);
      }
      queues.delete(id);
      if (hasCapacity(id)) {
        cancelReplacementDeadline(id);
        launch(scheduled);
      } else if (pendingReplacements.has(id) || canQueueReplacement()) {
        pendingReplacements.set(id, scheduled);
        if ((activeForId?.size ?? 0) > 0) startReplacementDeadline(id, scheduled);
      } else {
        rejectEffect(scheduled, 'queue_limit');
      }
      return;
    }
    if (effect.concurrency === 'parallel') {
      if (hasCapacity(id)) launch(scheduled);
      else rejectEffect(scheduled, 'active_limit');
      return;
    }
    if (hasCapacity(id) && !hasActive && (queues.get(id)?.length ?? 0) === 0) launch(scheduled);
    else enqueue(scheduled, id);
  }

  function enqueue(scheduled: ScheduledEffect<TMessage>, id: string): void {
    const queue = queues.get(id) ?? [];
    if (queuedCount(queues) >= policy.maxQueued || queue.length >= policy.maxQueuedPerId) {
      rejectEffect(scheduled, 'queue_limit');
      return;
    }
    queue.push(scheduled);
    queues.set(id, queue);
  }

  function rejectEffect(
    scheduled: ScheduledEffect<TMessage>,
    reason: 'active_limit' | 'queue_limit' | 'replacement_timeout'
  ): void {
    rejected += 1;
    const { effect, redacted } = scheduled;
    const execution = createExecution(effect);
    // Recovery uses the ordinary producer admission path without consuming a run slot.
    recovering.add(execution);
    execution.completion = recoverEffect(effect,
      diagnostic('TUI_EFFECT_REJECTED', `TUI effect ${effect.id} was rejected by the execution policy.`, {
        target: effect.id, data: { reason, ...policy }
      }), execution.lease, options, redacted)
      .catch((cause: unknown) => { executionFailures.push(cause); })
      .finally(() => {
        execution.lease.revoke();
        recovering.delete(execution);
      });
  }

  return {
    start(effects, redacted = false) {
      if (disposed) return;
      for (const effect of effects) schedule({ effect, redacted });
    },
    cancelRequests(requests) {
      if (disposed) return;
      for (const request of requests) {
        if (request.kind === 'effect') { cancelId(request.id); continue; }
        for (const [id, queue] of queues) {
          const retained = queue.filter((item) => !cancellationMatches(request, item.effect));
          if (retained.length === 0) queues.delete(id);
          else queues.set(id, retained);
        }
        for (const [id, replacement] of pendingReplacements) {
          if (!cancellationMatches(request, replacement.effect)) continue;
          pendingReplacements.delete(id);
          cancelReplacementDeadline(id);
        }
        for (const execution of [...active, ...recovering]) {
          if (!cancellationMatches(request, execution)) continue;
          cancelExecution(execution);
        }
      }
      launchPending();
    },
    cancel() {
      cancelAll();
    },
    async dispose() {
      const deadlines = [...replacementDeadlines.values()];
      cancelAll();
      await Promise.allSettled([
        ...[...active, ...recovering].map((item) => item.completion),
        ...deadlines.map((item) => item.completion)
      ]);
      active.clear();
      recovering.clear();
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
    for (const execution of [...active, ...recovering]) cancelExecution(execution);
  }

  function cancelId(id: string): void {
    queues.delete(id);
    pendingReplacements.delete(id);
    cancelReplacementDeadline(id);
    for (const execution of activeById.get(id) ?? []) cancelExecution(execution);
    cancelRecovery(id);
  }

  function cancelRecovery(id: string): void {
    for (const execution of recovering) {
      if (execution.id === id) cancelExecution(execution);
    }
  }

  function canQueueReplacement(): boolean {
    return queuedCount(queues) + pendingReplacements.size < policy.maxQueued;
  }

  function startReplacementDeadline(id: string, scheduled: ScheduledEffect<TMessage>): void {
    cancelReplacementDeadline(id);
    const controller = new AbortController();
    const deadline: ReplacementDeadline = {
      controller,
      completion: Promise.resolve()
    };
    deadline.completion = options.clock.sleep(policy.replacementGracePeriodMs, controller.signal)
      .then((outcome) => {
        if (outcome === 'aborted' || pendingReplacements.get(id) !== scheduled) return;
        pendingReplacements.delete(id);
        rejectEffect(scheduled, 'replacement_timeout');
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

function createExecution(effect: TuiEffect<unknown>): EffectExecution {
  const controller = new AbortController();
  return copyWorkOwnership(effect, {
    id: effect.id, controller,
    lease: createProducerAdmissionLease('effect', effect.id, controller.signal),
    completion: Promise.resolve(),
  });
}

function cancelExecution(execution: EffectExecution): void {
  execution.lease.revoke();
  execution.controller.abort();
}

async function executeEffect<TMessage>(
  effect: TuiEffect<TMessage>,
  redacted: boolean,
  execution: EffectExecution,
  options: TuiEffectManagerOptions<TMessage>
): Promise<void> {
  const { controller, lease } = execution;
  let base: TuiContext;
  try {
    base = await options.context();
  } catch (cause) {
    if (controller.signal.aborted) return;
    await recoverEffect(effect, effectFailure(effect.id, cause, 'context'), lease, options, redacted);
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
      },
      copySelectedText: (input) => options.copySelectedText(
        decodeCopySelectedTextInput(input),
        controller.signal,
      ),
    };
    if (signalIsAborted(controller.signal)) return;
    output = decodeTuiEffectOutput<TMessage>(await effect.run(context));
  } catch (cause) {
    if (signalIsAborted(controller.signal)) return;
    await recoverEffect(effect, effectFailure(effect.id, cause, 'run'), lease, options, redacted);
    return;
  }
  if (output.kind === 'none' || signalIsAborted(controller.signal)) return;
  try {
    await options.dispatch(outputMessages(output), lease, redacted);
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
  if (lease.authorized()) options.reportDiagnostic(effectFailure(effect.id, cause, 'dispatch'));
}

function signalIsAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

function recoverEffect<TMessage>(
  effect: TuiEffect<TMessage>,
  initial: TerminalDiagnostic,
  lease: ProducerAdmissionLease,
  options: TuiEffectManagerOptions<TMessage>,
  redacted: boolean,
): Promise<void> {
  let failure = initial;
  let output: TuiEffectOutput<TMessage> | undefined;
  try {
    output = effect.onError === undefined
      ? undefined
      : decodeTuiEffectOutput<TMessage>(
          effect.onError({ id: effect.id, diagnostic: initial }),
          `TUI effect ${effect.id} onError output`
        );
  } catch (handlerCause) {
    failure = effectFailure(effect.id,
      new AggregateError([initial.cause ?? initial, handlerCause], 'TUI effect and its error mapper failed.'),
      'onError');
  }
  return dispatchRecovery(effect.id, failure, output, lease, options, redacted);
}

async function dispatchRecovery<TMessage>(
  id: string,
  initial: TerminalDiagnostic,
  output: TuiEffectOutput<TMessage> | undefined,
  lease: ProducerAdmissionLease,
  options: TuiEffectManagerOptions<TMessage>,
  redacted: boolean,
): Promise<void> {
  let failure = initial;
  if (output !== undefined && output.kind !== 'none' && lease.authorized()) {
    try {
      await options.dispatch(outputMessages(output), lease, redacted);
    } catch (dispatchCause) {
      failure = effectFailure(id,
        new AggregateError([initial.cause ?? initial, dispatchCause], 'TUI effect recovery dispatch failed.'),
        'error_dispatch');
    }
  }
  if (lease.authorized()) options.reportDiagnostic(failure);
}

function outputMessages<TMessage>(output: Exclude<TuiEffectOutput<TMessage>, { readonly kind: 'none' }>): readonly TMessage[] {
  return output.kind === 'message' ? [output.message] : output.messages;
}

function effectFailure(
  id: string,
  cause: unknown,
  phase: 'context' | 'run' | 'dispatch' | 'onError' | 'error_dispatch'
): TerminalDiagnostic {
  return diagnostic('TUI_EFFECT_FAILED', `TUI effect ${id} failed.`, {
    target: id,
    cause,
    data: { phase }
  });
}

function queuedCount<TMessage>(queues: ReadonlyMap<string, readonly ScheduledEffect<TMessage>[]>): number {
  let count = 0;
  for (const queue of queues.values()) count += queue.length;
  return count;
}

function normalizeEffectPolicy(policy: TuiEffectPolicy | undefined): TuiEffectPolicy {
  const result = policy ?? defaultTuiEffectPolicy;
  const maxActive = positivePolicyInteger(result.maxActive, 'maxActive');
  const maxActivePerId = positivePolicyInteger(result.maxActivePerId, 'maxActivePerId');
  const maxQueued = positivePolicyInteger(result.maxQueued, 'maxQueued');
  const maxQueuedPerId = positivePolicyInteger(result.maxQueuedPerId, 'maxQueuedPerId');
  const replacementGracePeriodMs = nonNegativePolicyInteger(
    result.replacementGracePeriodMs,
    'replacementGracePeriodMs',
  );
  return Object.freeze({
    maxActive,
    maxActivePerId,
    maxQueued,
    maxQueuedPerId,
    replacementGracePeriodMs,
  });
}

function positivePolicyInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RangeError(`TUI effect policy ${field} must be a positive safe integer.`);
  }
  return value as number;
}

function nonNegativePolicyInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`TUI effect policy ${field} must be a non-negative safe integer.`);
  }
  return value as number;
}
