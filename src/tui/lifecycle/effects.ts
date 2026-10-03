import { withEffectOutputLimit } from './effect-output-limit.ts';
import { TerminalUiError, errorFromUnknown } from '../../errors.ts';
import { assertRuntimeLimit } from './runtime-policy.ts';
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
  physicallySettled: boolean;
}

interface ScheduledEffect<TMessage> {
  readonly effect: TuiEffect<TMessage>;
  readonly redacted: boolean;
  readonly token: EffectObligation;
}

interface EffectObligation {
  execution?: EffectExecution;
  released: boolean;
  creditReserved: boolean;
}

export interface PreparedTuiEffects {
  activate(): void;
  release(): void;
}

export interface TuiEffectRequest<TMessage> {
  readonly effect: TuiEffect<TMessage>;
  readonly redacted: boolean;
}

export interface TuiEffectManagerMetrics {
  readonly active: number;
  readonly queued: number;
  readonly rejected: number;
  readonly owned: number;
}

export interface TuiEffectManager<TMessage> {
  prepare(effects: readonly TuiEffectRequest<TMessage>[], completing?: ProducerAdmissionLease): PreparedTuiEffects;
  start(effects: readonly TuiEffect<TMessage>[], redacted?: boolean): void;
  cancelRequests(requests: readonly TuiCancellation[]): void;
  cancel(): void;
  dispose(): Promise<void>;
  metrics(): TuiEffectManagerMetrics;
}

export interface TuiEffectManagerOptions<TMessage> {
  readonly fatal?: (cause: unknown) => void;
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

export const defaultTuiEffectPolicy: Required<TuiEffectPolicy> = Object.freeze({
  maxOwned: 512,
  maxOutputMessages: 1_024,
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
  const owned = new Set<EffectObligation>();
  const active = new Set<EffectExecution>();
  // Reliable terminal messages await ordinary dispatch; only their admission identity is retained here.
  const recovering = new Set<EffectExecution>();
  const activeById = new Map<string, Set<EffectExecution>>();
  const queues = new Map<string, ScheduledEffect<TMessage>[]>();
  const pendingReplacements = new Map<string, ScheduledEffect<TMessage>>();
  const replacementDeadlines = new Map<string, ReplacementDeadline>();
  let executionFailure: unknown;
  let rejected = 0;
  let disposed = false;

  function launch(scheduled: ScheduledEffect<TMessage>): void {
    const { effect } = scheduled;
    const id = effect.id;
    const execution = createExecution(effect);
    scheduled.token.execution = execution;
    execution.completion = executeEffect(effect, scheduled.redacted, execution, {
      ...options,
      maxOutputMessages: policy.maxOutputMessages,
      physicallySettled: () => { execution.physicallySettled = true; },
    })
      .catch((cause: unknown) => {
        executionFailure ??= cause;
        options.fatal?.(cause);
      })
      .finally(() => {
        execution.lease.revoke();
        active.delete(execution);
        release(scheduled.token);
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
      else release(scheduled.token);
      return;
    }
    if (effect.concurrency === 'replace') {
      cancelRecovery(id);
      const activeForId = activeById.get(id);
      for (const execution of activeForId ?? []) {
        cancelExecution(execution);
      }
      clearScheduledId(id);
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

  function clearScheduledId(id: string): void {
    for (const queued of queues.get(id) ?? []) release(queued.token);
    queues.delete(id);
    const previous = pendingReplacements.get(id);
    if (previous !== undefined) { release(previous.token); pendingReplacements.delete(id); }
  }

  function enqueue(scheduled: ScheduledEffect<TMessage>, id: string): void {
    const queue = queues.get(id) ?? [];
    if (queuedCount(queues) + pendingReplacements.size >= policy.maxQueued
      || queue.length + Number(pendingReplacements.has(id)) >= policy.maxQueuedPerId) {
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
    scheduled.token.execution = execution;
    execution.physicallySettled = true;
    // The reserved obligation owns rejection recovery and its terminal envelope.
    recovering.add(execution);
    execution.completion = recoverEffect(effect,
      diagnostic('TUI_EFFECT_REJECTED', `TUI effect ${effect.id} was rejected by the execution policy.`, {
        target: effect.id, data: { reason, ...policy }
      }), execution.lease, { ...options, maxOutputMessages: policy.maxOutputMessages }, redacted)
      .catch((cause: unknown) => { executionFailure ??= cause; options.fatal?.(cause); })
      .finally(() => {
        execution.lease.revoke();
        recovering.delete(execution);
        release(scheduled.token);
      });
  }

  function release(token: EffectObligation): void {
    if (token.released) return;
    token.released = true;
    owned.delete(token);
  }

  function prepare(effects: readonly TuiEffectRequest<TMessage>[], completing?: ProducerAdmissionLease): PreparedTuiEffects {
    if (disposed) throw new TerminalUiError('TUI effect manager is closed.');
    const credit = completing === undefined ? undefined : [...owned].find((token) =>
      !token.creditReserved && token.execution?.lease === completing && token.execution.physicallySettled);
    const neededCredit = owned.size + effects.length > policy.maxOwned && effects.length > 0 ? credit : undefined;
    assertRuntimeLimit('owned_effects', owned.size + effects.length - Number(neededCredit !== undefined), policy.maxOwned);
    if (neededCredit !== undefined) neededCredit.creditReserved = true;
    const scheduled = effects.map((request) => {
      const token: EffectObligation = { released: false, creditReserved: false };
      owned.add(token);
      return { ...request, token };
    });
    let pending = true;
    return {
      activate() {
        if (!pending) return;
        pending = false;
        if (neededCredit !== undefined) release(neededCredit);
        if (disposed) { for (const item of scheduled) release(item.token); return; }
        for (const item of scheduled) schedule(item);
      },
      release() {
        if (!pending) return;
        pending = false;
        if (neededCredit !== undefined) neededCredit.creditReserved = false;
        for (const item of scheduled) release(item.token);
      },
    };
  }

  return {
    prepare,
    start(effects, redacted = false) {
      if (disposed) return;
      prepare(effects.map((effect) => ({ effect, redacted }))).activate();
    },
    cancelRequests(requests) {
      if (disposed) return;
      for (const request of requests) {
        if (request.kind === 'effect') { cancelId(request.id); continue; }
        for (const [id, queue] of queues) {
          const retained = queue.filter((item) => {
            if (!cancellationMatches(request, item.effect)) return true;
            release(item.token); return false;
          });
          if (retained.length === 0) queues.delete(id);
          else queues.set(id, retained);
        }
        for (const [id, replacement] of pendingReplacements) {
          if (!cancellationMatches(request, replacement.effect)) continue;
          pendingReplacements.delete(id);
          release(replacement.token);
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
      const failure = executionFailure;
      executionFailure = undefined;
      if (failure !== undefined) throw new AggregateError([failure], 'TUI effect execution cleanup failed.');
    },
    metrics() {
      return {
        active: active.size,
        queued: queuedCount(queues) + pendingReplacements.size,
        rejected,
        owned: [...owned].filter((token) => !token.creditReserved).length,
      };
    }
  };

  function cancelAll(): void {
    disposed = true;
    for (const queue of queues.values()) for (const item of queue) release(item.token);
    for (const item of pendingReplacements.values()) release(item.token);
    queues.clear();
    pendingReplacements.clear();
    for (const deadline of replacementDeadlines.values()) deadline.controller.abort();
    replacementDeadlines.clear();
    for (const execution of [...active, ...recovering]) cancelExecution(execution);
  }

  function cancelId(id: string): void {
    for (const item of queues.get(id) ?? []) release(item.token);
    const pending = pendingReplacements.get(id);
    if (pending !== undefined) release(pending.token);
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

  async function replacementSleep(signal: AbortSignal) {
    return options.clock.sleep(policy.replacementGracePeriodMs, signal);
  }

  function startReplacementDeadline(id: string, scheduled: ScheduledEffect<TMessage>): void {
    cancelReplacementDeadline(id);
    const controller = new AbortController();
    const deadline: ReplacementDeadline = {
      controller,
      completion: Promise.resolve()
    };
    deadline.completion = replacementSleep(controller.signal)
      .then((outcome) => {
        if (outcome === 'aborted' || pendingReplacements.get(id) !== scheduled) return;
        pendingReplacements.delete(id);
        rejectEffect(scheduled, 'replacement_timeout');
      })
      .catch((cause: unknown) => {
        executionFailure ??= cause;
        options.fatal?.(cause);
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
    physicallySettled: false,
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
  options: TuiEffectManagerOptions<TMessage> & { readonly maxOutputMessages: number; readonly physicallySettled: () => void }
): Promise<void> {
  const { controller, lease } = execution;
  let base: TuiContext;
  try {
    base = await options.context();
  } catch (cause) {
    if (controller.signal.aborted) return;
    options.physicallySettled();
    await recoverEffect(effect, effectFailure(effect.id, cause, 'context'), lease, options, redacted);
    return;
  }
  if (controller.signal.aborted) return;
  let output: TuiEffectOutput<TMessage>;
  let terminalCompletion: Promise<unknown> | undefined;
  let acceptingTerminalOperations = true;
  try {
    let terminalOperation = false;
    const runTerminalOperation = <TValue>(prepare: () => () => Promise<TValue>): Promise<TValue> => {
      if (!acceptingTerminalOperations || !lease.authorized()) return Promise.reject(new TerminalUiError('TUI effect terminal authority is closed.'));
      if (terminalOperation) return Promise.reject(new TerminalUiError('An effect already owns a terminal operation.', {
        code: 'TUI_OVERLOAD', reason: 'effect_terminal_operation', limit: 1, observed: 2,
      }));
      terminalOperation = true;
      let operation: () => Promise<TValue>;
      try { operation = prepare(); }
      catch (cause) { terminalOperation = false; return Promise.reject(errorFromUnknown(cause)); }
      const completion = Promise.resolve().then(() => { controller.signal.throwIfAborted(); return operation(); })
        .finally(() => { terminalOperation = false; });
      terminalCompletion = completion;
      void completion.catch(() => undefined);
      return completion;
    };
    const context: TuiEffectContext = withEffectOutputLimit({
      ...base,
      signal: controller.signal,
      withTerminalSuspended: <TValue>(operation: () => Promise<TValue>) => {
        const suspend = options.withTerminalSuspended;
        return suspend === undefined
          ? Promise.reject(new Error('Terminal suspension is only available to runtimes owned by runTui().'))
          : runTerminalOperation(() => () => suspend(operation, controller.signal));
      },
      copySelectedText: (input) => runTerminalOperation(() => {
        const request = decodeCopySelectedTextInput(input);
        return () => options.copySelectedText(request, controller.signal);
      }),
    }, options.maxOutputMessages);
    if (signalIsAborted(controller.signal)) return;
    const supplied = await effect.run(context);
    acceptingTerminalOperations = false;
    await terminalCompletion;
    options.physicallySettled();
    output = boundedEffectOutput<TMessage>(supplied, 'TUI effect output', options.maxOutputMessages);
  } catch (cause) {
    acceptingTerminalOperations = false;
    await terminalCompletion?.catch(() => undefined);
    if (signalIsAborted(controller.signal)) return;
    options.physicallySettled();
    await recoverEffect(effect, effectFailure(effect.id, cause, 'run'), lease, options, redacted);
    return;
  }
  if (output.kind === 'none' || signalIsAborted(controller.signal)) return;
  try {
    await options.dispatch(outputMessages(output), lease, redacted);
  } catch (cause) {
    if (lease.authorized()) throw new TerminalUiError(`TUI effect ${effect.id} settlement failed.`, { code: 'TUI_RUNTIME_FAULT', cause });
  }
}

function signalIsAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

function recoverEffect<TMessage>(
  effect: TuiEffect<TMessage>,
  initial: TerminalDiagnostic,
  lease: ProducerAdmissionLease,
  options: TuiEffectManagerOptions<TMessage> & { readonly maxOutputMessages: number },
  redacted: boolean,
): Promise<void> {
  const failure = initial;
  let output: TuiEffectOutput<TMessage> | undefined;
  try {
    output = effect.onError === undefined
      ? undefined
      : boundedEffectOutput<TMessage>(
          effect.onError(withEffectOutputLimit({ id: effect.id, diagnostic: initial }, options.maxOutputMessages)),
          `TUI effect ${effect.id} onError output`,
          options.maxOutputMessages,
        );
  } catch (handlerCause) {
    return Promise.reject(new TerminalUiError(`TUI effect ${effect.id} recovery mapper failed.`, {
      code: 'TUI_RUNTIME_FAULT', reason: 'effect_recovery', cause: handlerCause,
    }));
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
  const failure = initial;
  if (output !== undefined && output.kind !== 'none' && lease.authorized()) {
    try {
      await options.dispatch(outputMessages(output), lease, redacted);
    } catch (dispatchCause) {
      if (lease.authorized()) throw new TerminalUiError(`TUI effect ${id} recovery settlement failed.`, {
        code: 'TUI_RUNTIME_FAULT', reason: 'effect_recovery_dispatch', cause: dispatchCause,
      });
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

export function normalizeEffectPolicy(policy: TuiEffectPolicy | undefined): Required<TuiEffectPolicy> {
  const result = policy ?? defaultTuiEffectPolicy;
  const maxOwned = positivePolicyInteger(result.maxOwned ?? defaultTuiEffectPolicy.maxOwned, 'maxOwned');
  const maxOutputMessages = positivePolicyInteger(result.maxOutputMessages ?? defaultTuiEffectPolicy.maxOutputMessages, 'maxOutputMessages');
  const maxActive = positivePolicyInteger(result.maxActive, 'maxActive');
  const maxActivePerId = positivePolicyInteger(result.maxActivePerId, 'maxActivePerId');
  const maxQueued = positivePolicyInteger(result.maxQueued, 'maxQueued');
  const maxQueuedPerId = positivePolicyInteger(result.maxQueuedPerId, 'maxQueuedPerId');
  const replacementGracePeriodMs = nonNegativePolicyInteger(
    result.replacementGracePeriodMs,
    'replacementGracePeriodMs',
  );
  return Object.freeze({
    maxOwned,
    maxOutputMessages,
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

function boundedEffectOutput<TMessage>(value: unknown, label: string, limit: number): TuiEffectOutput<TMessage> {
  if (typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'messages'
    && 'messages' in value && Array.isArray(value.messages)) {
    assertRuntimeLimit('effect_output_messages', value.messages.length, limit);
  }
  return decodeTuiEffectOutput<TMessage>(value, label, limit);
}
