import { snapshotArray } from '../foundation/array-snapshot.ts';
import { copyWorkOwnership } from './lifecycle/work-ownership.ts';
import { readTuiContribution, unwrapTuiSource } from './lifecycle/contribution.ts';
import type { ContributionEntry } from './lifecycle/contribution.ts';
import { TerminalUiError } from '../errors.ts';
import { effectExecutionId, subscriptionExecutionId } from '../foundation/identity.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import type { InitialFocusSelector } from '../interaction/focus.ts';
import type { MessageResolution } from '../interaction/message.ts';
import type {
  TuiCancellation,
  TuiEffect,
  TuiEffectContext,
  TuiEffectOutput,
  TuiEventSource,
  TuiSourceSink,
  TuiSubscriptionContext,
} from './types.ts';

export interface DecodedTuiResult<TState, TMessage> {
  readonly state: TState;
  readonly contributions: readonly ContributionEntry<TMessage>[];
  readonly focus?: InitialFocusSelector;
  readonly exit?: { readonly reason?: string };
}

export function decodeTuiInitialResult<TState, TMessage>(
  value: unknown, maxEntries = 4096,
): DecodedTuiResult<TState, TMessage> {
  return decodeResult(value, 'TUI initial result', maxEntries);
}

export function decodeTuiUpdateResult<TState, TMessage>(
  value: unknown, maxEntries = 4096,
): DecodedTuiResult<TState, TMessage> {
  return decodeResult(value, 'TUI update result', maxEntries);
}

function decodeResult<TState, TMessage>(value: unknown, label: string, maxEntries: number): DecodedTuiResult<TState, TMessage> {
  const result = objectResult(value, label);
  if (!Object.hasOwn(result, 'state')) throw new TypeError(`${label} must provide state.`);
  if (Object.hasOwn(result, 'cancelEffects')) throw new TypeError('TUI update cancelEffects is obsolete; use typed cancel requests.');
  const entries = result['contribution'] === undefined ? [] : readTuiContribution<TMessage>(result['contribution']);
  const rawCancel = optionalArray(result['cancel'], `${label} cancel`);
  const rawEffects = optionalArray(result['effects'], `${label} effects`);
  const cancelCount = rawCancel?.length ?? 0;
  const effectCount = rawEffects?.length ?? 0;
  let count = cancelCount + effectCount;
  checkCount(count, maxEntries, 'transaction_contributions');
  for (const entry of entries) {
    count += Math.max(1, (entry.cancel?.length ?? 0) + (entry.effects?.length ?? 0));
    checkCount(count, maxEntries, 'transaction_contributions');
  }
  const cancel = rawCancel === undefined ? undefined : snapshotArray(rawCancel, cancelCount).map(decodeCancellation);
  const effects = rawEffects === undefined ? undefined : snapshotArray(rawEffects, effectCount).map(decodeTuiEffect<TMessage>);
  const ownFocus = result['focus'] === undefined ? undefined : decodeInitialFocusSelector(result['focus'], `${label} focus`, maxEntries);
  const contributions: ContributionEntry<TMessage>[] = [...entries];
  if (cancel !== undefined || effects !== undefined || ownFocus !== undefined) contributions.push(Object.freeze({
    ...(cancel === undefined ? {} : { cancel: Object.freeze(cancel) }),
    ...(effects === undefined ? {} : { effects: Object.freeze(effects) }),
    ...(ownFocus === undefined ? {} : { focus: ownFocus }),
  }));
  const focus = contributions.findLast(entry => entry.focus !== undefined)?.focus;
  const exit = decodeExitRequest(result['exit'], `${label} exit`);
  return Object.freeze({ state: result['state'] as TState, contributions: Object.freeze(contributions),
    ...(focus === undefined ? {} : { focus }), ...(exit === undefined ? {} : { exit }) });
}

function checkCount(observed: number, limit: number, reason: string): void {
  if (observed > limit) throw new TerminalUiError(`TUI ${reason} exceeds its admitted limit.`, {
    code: 'TUI_OVERLOAD', reason, limit, observed,
  });
}

export function decodeTuiEffect<TMessage>(value: unknown, index?: number): TuiEffect<TMessage> {
  const label = index === undefined ? 'TUI effect' : `TUI effect at index ${String(index)}`;
  const effect = objectResult(value, label);
  const id = requiredIdentity(effect['id'], label, effectExecutionId);
  const concurrency = effect['concurrency'];
  if (
    concurrency !== 'parallel'
    && concurrency !== 'keep-first'
    && concurrency !== 'replace'
    && concurrency !== 'enqueue'
  ) {
    throw new TypeError(`${label} concurrency is invalid.`);
  }
  const run = effect['run'];
  if (typeof run !== 'function') throw new TypeError(`${label} run must be a function.`);
  const onError = effect['onError'];
  if (onError !== undefined && typeof onError !== 'function') {
    throw new TypeError(`${label} onError must be a function when provided.`);
  }
  return Object.freeze(copyWorkOwnership(effect, {
    id,
    concurrency,
    run: (context: TuiEffectContext) =>
      Promise.resolve(run.call(effect, context)) as Promise<TuiEffectOutput<TMessage>>,
    ...(onError === undefined ? {} : {
      onError: (failure: Parameters<NonNullable<TuiEffect<TMessage>['onError']>>[0]) =>
        onError.call(effect, failure) as TuiEffectOutput<TMessage>
    })
  }));
}

export function decodeTuiEffectOutput<TMessage>(
  value: unknown,
  label = 'TUI effect output',
  maxMessages = 1024,
): TuiEffectOutput<TMessage> {
  const output = objectResult(value, label);
  if (output['kind'] === 'none') return Object.freeze({ kind: 'none' });
  if (output['kind'] === 'message') {
    if (!Object.hasOwn(output, 'message') || output['message'] === null || output['message'] === undefined) {
      throw new TypeError(`${label} message cannot be null or undefined.`);
    }
    return Object.freeze({ kind: 'message', message: output['message'] as TMessage });
  }
  if (output['kind'] === 'messages') {
    const supplied = requiredArray(output['messages'], `${label} messages`);
    const count = supplied.length;
    checkCount(count, maxMessages, 'effect_output_messages');
    const messages = snapshotArray(supplied, count);
    if (messages.some((message) => message === null || message === undefined)) {
      throw new TypeError(`${label} messages cannot contain null or undefined.`);
    }
    return Object.freeze({ kind: 'messages', messages: Object.freeze(messages) as readonly TMessage[] });
  }
  throw new TypeError(`${label} kind is invalid.`);
}

export function decodeTuiEventSources<TMessage>(value: unknown, maxEntries = 4096): readonly TuiEventSource<TMessage>[] {
  const entries = requiredArray(value, 'TUI subscriptions result');
  const count = entries.length;
  checkCount(count, maxEntries, 'source_generations');
  return Object.freeze(snapshotArray(entries, count).map((entry, index) => decodeTuiEventSource<TMessage>(unwrapTuiSource(entry), index)));
}

export function decodeMessageResolution<TMessage>(value: unknown, label: string): MessageResolution<TMessage> {
  if (value === null || value === undefined) {
    throw new TypeError(`${label} cannot return null or undefined. Return ignoreMessage() to ignore the event.`);
  }
  return value as MessageResolution<TMessage>;
}

function decodeTuiEventSource<TMessage>(value: unknown, index: number): TuiEventSource<TMessage> {
  const label = `TUI event source at index ${String(index)}`;
  const source = objectResult(value, label);
  const id = requiredIdentity(source['id'], label, subscriptionExecutionId);
  const generation = source['generation'];
  if (
    typeof generation !== 'string'
    && !(typeof generation === 'number' && Number.isFinite(generation))
  ) {
    throw new TypeError(`${label} generation must be a string or finite number.`);
  }
  const sourceName = source['source'];
  if (sourceName !== undefined && sourceName !== 'signal' && sourceName !== 'timer' && sourceName !== 'external') {
    throw new TypeError(`${label} source is invalid.`);
  }
  const channel = decodeTuiEventSourceChannel(source['channel'], label);
  const callbacks = decodeTuiEventSourceCallbacks<TMessage>(source, label);
  return Object.freeze(copyWorkOwnership(source, {
    id,
    generation,
    ...(sourceName === undefined ? {} : { source: sourceName }),
    ...(channel === undefined ? {} : { channel }),
    ...callbacks,
  }));
}

function decodeTuiEventSourceChannel(
  value: unknown,
  label: string,
): TuiEventSource<unknown>['channel'] {
  if (value === undefined) return undefined;
  const channel = objectResult(value, `${label} channel`);
  const capacity = channel['capacity'];
  if (typeof capacity !== 'number' || !Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError(`${label} channel capacity must be a positive safe integer.`);
  }
  const cadenceMs = channel['cadenceMs'];
  if (cadenceMs !== undefined
    && (typeof cadenceMs !== 'number' || !Number.isFinite(cadenceMs) || cadenceMs <= 0)) {
    throw new RangeError(`${label} channel cadenceMs must be a positive finite number.`);
  }
  return Object.freeze({ capacity, ...(cadenceMs === undefined ? {} : { cadenceMs }) });
}

function decodeTuiEventSourceCallbacks<TMessage>(
  source: Readonly<Record<string, unknown>>,
  label: string,
): Pick<TuiEventSource<TMessage>, 'run' | 'onLifecycle' | 'dispose'> {
  const run = source['run'];
  if (typeof run !== 'function') throw new TypeError(`${label} run must be a function.`);
  const onLifecycle = source['onLifecycle'];
  if (onLifecycle !== undefined && typeof onLifecycle !== 'function') {
    throw new TypeError(`${label} onLifecycle must be a function when provided.`);
  }
  const dispose = source['dispose'];
  if (dispose !== undefined && typeof dispose !== 'function') {
    throw new TypeError(`${label} dispose must be a function when provided.`);
  }
  return {
    run: (context: TuiSubscriptionContext, sink: TuiSourceSink<TMessage>) =>
      Promise.resolve(run.call(source, context, sink)) as Promise<void>,
    ...(onLifecycle === undefined ? {} : {
      onLifecycle: (event: Parameters<NonNullable<TuiEventSource<TMessage>['onLifecycle']>>[0]) =>
        decodeMessageResolution<TMessage>(onLifecycle.call(source, event), `${label} onLifecycle`)
    }),
    ...(dispose === undefined ? {} : { dispose: () => dispose.call(source) as void | Promise<void> })
  };
}

function decodeInitialFocusSelector(value: unknown, label: string, maxEntries: number): InitialFocusSelector {
  const selector = objectResult(value, label);
  if (selector['kind'] === 'path') {
    const supplied = requiredArray(selector['path'], `${label} path`);
    const count = supplied.length;
    checkCount(count, maxEntries, 'focus_path');
    const path = snapshotArray(supplied, count);
    if (path.length === 0 || path.some((segment) => typeof segment !== 'string' || segment.trim() === '')) {
      throw new TypeError(`${label} path must contain non-empty string segments.`);
    }
    return Object.freeze({ kind: 'path', path: Object.freeze(path) as readonly string[] });
  }
  const elementId = nonEmptyString(selector['elementId'], `${label} elementId`);
  if (selector['kind'] === 'element') return Object.freeze({ kind: 'element', elementId });
  if (selector['kind'] === 'elementTarget') {
    return Object.freeze({
      kind: 'elementTarget',
      elementId,
      targetId: nonEmptyString(selector['targetId'], `${label} targetId`)
    });
  }
  throw new TypeError(`${label} kind is invalid.`);
}

function decodeExitRequest(value: unknown, label: string): { readonly reason?: string } | undefined {
  if (value === undefined) return undefined;
  const exit = objectResult(value, label);
  const reason = exit['reason'];
  if (reason !== undefined && typeof reason !== 'string') {
    throw new TypeError(`${label} reason must be a string when provided.`);
  }
  return Object.freeze(reason === undefined ? {} : { reason });
}

function objectResult(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!isNonArrayObject(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function requiredArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  return value;
}

function optionalArray(value: unknown, label: string): readonly unknown[] | undefined {
  return value === undefined ? undefined : requiredArray(value, label);
}

function requiredIdentity(
  value: unknown,
  label: string,
  validate: (identity: string) => string
): string {
  if (typeof value !== 'string') throw new TypeError(`${label} id must be a string.`);
  return validate(value);
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function decodeCancellation(value: unknown): TuiCancellation {
  const request = objectResult(value, 'TUI cancellation');
  const id = requiredIdentity(request['id'], 'TUI cancellation', effectExecutionId);
  if (request['kind'] === 'effect') return Object.freeze({ kind: 'effect', id });
  const generation = request['generation'];
  if (request['kind'] !== 'child' || (typeof generation !== 'string' && !(typeof generation === 'number' && Number.isFinite(generation)))) {
    throw new TypeError('TUI cancellation must identify an effect or a child lifetime.');
  }
  return Object.freeze(copyWorkOwnership(request, { kind: 'child', id, generation }));
}
