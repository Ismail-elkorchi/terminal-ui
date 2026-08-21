import { effectExecutionId, subscriptionExecutionId } from '../foundation/identity.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import type { InitialFocusSelector } from '../interaction/focus.ts';
import type { MessageResolution } from '../interaction/message.ts';
import type {
  TuiEffect,
  TuiEffectContext,
  TuiEffectOutput,
  TuiEventSource,
  TuiInitialResult,
  TuiSubscriptionContext,
  TuiSourceSink,
  TuiUpdateResult
} from './types.ts';

export function decodeTuiInitialResult<TState, TMessage>(
  value: unknown,
): TuiInitialResult<TState, TMessage> {
  const result = objectResult(value, 'TUI initial result');
  if (!Object.hasOwn(result, 'state')) {
    throw new TypeError('TUI initial result must provide state.');
  }
  const effects = optionalArray(result['effects'], 'TUI initial effects')?.map(decodeTuiEffect<TMessage>);
  const focus = result['focus'] === undefined
    ? undefined
    : decodeInitialFocusSelector(result['focus'], 'TUI initial focus');
  const exit = decodeExitRequest(result['exit'], 'TUI initial exit');
  return Object.freeze({
    state: result['state'] as TState,
    ...(effects === undefined ? {} : { effects: Object.freeze(effects) }),
    ...(focus === undefined ? {} : { focus }),
    ...(exit === undefined ? {} : { exit }),
  });
}

export function decodeTuiUpdateResult<TState, TMessage>(
  value: unknown
): TuiUpdateResult<TState, TMessage> {
  const result = objectResult(value, 'TUI update result');
  if (!Object.hasOwn(result, 'state')) {
    throw new TypeError('TUI update result must provide state.');
  }
  const cancelEffects = optionalStringArray(result['cancelEffects'], 'TUI update cancelEffects')
    ?.map((id) => effectExecutionId(id));
  const effects = optionalArray(result['effects'], 'TUI update effects')?.map(decodeTuiEffect<TMessage>);
  const focus = result['focus'] === undefined
    ? undefined
    : decodeInitialFocusSelector(result['focus'], 'TUI update focus');
  const exit = decodeExitRequest(result['exit'], 'TUI update exit');
  return Object.freeze({
    state: result['state'] as TState,
    ...(cancelEffects === undefined ? {} : { cancelEffects: Object.freeze(cancelEffects) }),
    ...(effects === undefined ? {} : { effects: Object.freeze(effects) }),
    ...(focus === undefined ? {} : { focus }),
    ...(exit === undefined ? {} : { exit })
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
  return Object.freeze({
    id,
    concurrency,
    run: (context: TuiEffectContext) =>
      Promise.resolve(run.call(effect, context)) as Promise<TuiEffectOutput<TMessage>>,
    ...(onError === undefined ? {} : {
      onError: (failure: Parameters<NonNullable<TuiEffect<TMessage>['onError']>>[0]) =>
        onError.call(effect, failure) as TuiEffectOutput<TMessage>
    })
  });
}

export function decodeTuiEffectOutput<TMessage>(
  value: unknown,
  label = 'TUI effect output'
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
    const messages = requiredArray(output['messages'], `${label} messages`);
    if (messages.some((message) => message === null || message === undefined)) {
      throw new TypeError(`${label} messages cannot contain null or undefined.`);
    }
    return Object.freeze({ kind: 'messages', messages: Object.freeze([...messages]) as readonly TMessage[] });
  }
  throw new TypeError(`${label} kind is invalid.`);
}

export function decodeTuiEventSources<TMessage>(value: unknown): readonly TuiEventSource<TMessage>[] {
  return Object.freeze(requiredArray(value, 'TUI subscriptions result').map(decodeTuiEventSource<TMessage>));
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
  const channel = source['channel'];
  let capacity: number | undefined;
  let cadenceMs: number | undefined;
  if (channel !== undefined) {
    const decodedChannel = objectResult(channel, `${label} channel`);
    const candidate = decodedChannel['capacity'];
    if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 1) {
      throw new RangeError(`${label} channel capacity must be a positive safe integer.`);
    }
    capacity = candidate;
    const cadenceCandidate = decodedChannel['cadenceMs'];
    if (cadenceCandidate !== undefined) {
      if (typeof cadenceCandidate !== 'number' || !Number.isFinite(cadenceCandidate) || cadenceCandidate <= 0) {
        throw new RangeError(`${label} channel cadenceMs must be a positive finite number.`);
      }
      cadenceMs = cadenceCandidate;
    }
  }
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
  return Object.freeze({
    id,
    generation,
    ...(sourceName === undefined ? {} : { source: sourceName }),
    ...(capacity === undefined ? {} : {
      channel: Object.freeze({ capacity, ...(cadenceMs === undefined ? {} : { cadenceMs }) }),
    }),
    run: (context: TuiSubscriptionContext, sink: TuiSourceSink<TMessage>) =>
      Promise.resolve(run.call(source, context, sink)) as Promise<void>,
    ...(onLifecycle === undefined ? {} : {
      onLifecycle: (event: Parameters<NonNullable<TuiEventSource<TMessage>['onLifecycle']>>[0]) =>
        decodeMessageResolution<TMessage>(onLifecycle.call(source, event), `${label} onLifecycle`)
    }),
    ...(dispose === undefined ? {} : { dispose: () => dispose.call(source) as void | Promise<void> })
  });
}

function decodeInitialFocusSelector(value: unknown, label: string): InitialFocusSelector {
  const selector = objectResult(value, label);
  if (selector['kind'] === 'path') {
    const path = requiredArray(selector['path'], `${label} path`);
    if (path.length === 0 || path.some((segment) => typeof segment !== 'string' || segment.trim() === '')) {
      throw new TypeError(`${label} path must contain non-empty string segments.`);
    }
    return Object.freeze({ kind: 'path', path: Object.freeze([...path]) as readonly string[] });
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

function optionalStringArray(value: unknown, label: string): readonly string[] | undefined {
  const values = optionalArray(value, label);
  if (values === undefined) return undefined;
  if (values.some((item) => typeof item !== 'string')) {
    throw new TypeError(`${label} must contain strings.`);
  }
  return Object.freeze([...values]) as readonly string[];
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
