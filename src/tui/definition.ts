/* eslint-disable @typescript-eslint/no-unnecessary-condition -- Public JavaScript callers can bypass TypeScript. */
import { decodeInputTrigger, inputTriggerIdentity } from '../input/index.ts';
import type { InputTrigger } from '../input/index.ts';
import type { TuiApp, TuiDefinition, TuiInputBinding } from './types.ts';

export function defineTui<TState, TMessage extends NonNullable<unknown>>(
  definition: TuiDefinition<TState, TMessage>
): TuiApp<TState, TMessage> {
  if (typeof definition !== 'object' || definition === null || Array.isArray(definition)) {
    throw new TypeError('TUI definition must be an object.');
  }
  const id = definition.id ?? 'tui-app';
  if (typeof id !== 'string' || id.trim() === '') throw new TypeError('TUI id must be a non-empty string.');
  for (const field of ['init', 'update', 'view'] as const) {
    if (typeof definition[field] !== 'function') throw new TypeError(`TUI ${field} must be a function.`);
  }
  for (const field of ['subscriptions', 'onExit'] as const) {
    if (definition[field] !== undefined && typeof definition[field] !== 'function') {
      throw new TypeError(`TUI ${field} must be a function when provided.`);
    }
  }
  if (definition.transcript !== undefined && typeof definition.transcript !== 'boolean') {
    throw new TypeError('TUI transcript must be a boolean when provided.');
  }
  const inputBindings = normalizeInputBindings(definition.inputBindings);
  const accessibility = normalizeAccessibility(definition.accessibility);
  const nonTty = normalizeNonTty(definition.nonTty);
  const normalized: TuiDefinition<TState, TMessage> = Object.freeze({
    id,
    init: definition.init,
    update: definition.update,
    view: definition.view,
    ...(inputBindings === undefined ? {} : { inputBindings }),
    ...(definition.subscriptions === undefined ? {} : { subscriptions: definition.subscriptions }),
    ...(definition.onExit === undefined ? {} : { onExit: definition.onExit }),
    ...(definition.transcript === undefined ? {} : { transcript: definition.transcript }),
    ...(accessibility === undefined ? {} : { accessibility }),
    ...(nonTty === undefined ? {} : { nonTty })
  });
  return Object.freeze({ id, definition: normalized });
}

function normalizeInputBindings<TState, TMessage>(
  value: readonly TuiInputBinding<TState, TMessage>[] | undefined
): readonly TuiInputBinding<TState, TMessage>[] | undefined {
  if (value === undefined) return undefined;
  const bindings = value;
  if (!Array.isArray(value)) throw new TypeError('TUI inputBindings must be an array.');
  const ids = new Set<string>();
  return Object.freeze(bindings.map((candidate, index) => {
    assertInputBinding(candidate, index);
    if (ids.has(candidate.id)) {
      throw new TypeError(`TUI input binding id ${JSON.stringify(candidate.id)} is duplicated.`);
    }
    ids.add(candidate.id);
    const triggers = normalizeBindingTriggers(candidate.id, candidate.triggers);
    const base = {
      id: candidate.id,
      triggers,
      ...(candidate.phase === undefined ? {} : { phase: candidate.phase }),
      ...(candidate.label === undefined ? {} : { label: candidate.label }),
      ...(candidate.enabled === undefined ? {} : { enabled: candidate.enabled })
    };
    return 'toMessage' in candidate
      ? Object.freeze({ ...base, toMessage: candidate.toMessage })
      : Object.freeze({ ...base, message: candidate.message });
  }));
}

function assertInputBinding<TState, TMessage>(
  value: TuiInputBinding<TState, TMessage>,
  index: number
): void {
  const subject = `TUI input binding at index ${String(index)}`;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${subject} must be an object.`);
  }
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    throw new TypeError(`${subject} id must be a non-empty string.`);
  }
  if (!Array.isArray(value.triggers) || value.triggers.length === 0) {
    throw new TypeError(`${subject} must define at least one trigger.`);
  }
  if (value.phase !== undefined && value.phase !== 'beforeFocus' && value.phase !== 'afterFocus') {
    throw new TypeError(`${subject} phase must be beforeFocus or afterFocus.`);
  }
  if (value.label !== undefined && typeof value.label !== 'string') {
    throw new TypeError(`${subject} label must be a string.`);
  }
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean' && typeof value.enabled !== 'function') {
    throw new TypeError(`${subject} enabled must be a boolean or function.`);
  }
  const hasMessage = Object.hasOwn(value, 'message');
  const hasToMessage = Object.hasOwn(value, 'toMessage');
  if (hasMessage === hasToMessage) {
    throw new TypeError(`${subject} must define exactly one of message or toMessage.`);
  }
  if (hasMessage && (value.message === undefined || value.message === null)) {
    throw new TypeError(`${subject} message cannot be null or undefined.`);
  }
  if (hasToMessage && typeof value.toMessage !== 'function') {
    throw new TypeError(`${subject} toMessage must be a function.`);
  }
}

function normalizeBindingTriggers(id: string, values: readonly InputTrigger[]): readonly InputTrigger[] {
  const identities = new Set<string>();
  return Object.freeze(values.map((value) => {
    const trigger = decodeInputTrigger(value);
    const identity = inputTriggerIdentity(trigger);
    if (identities.has(identity)) {
      throw new TypeError(`TUI input binding ${JSON.stringify(id)} contains duplicate trigger ${identity}.`);
    }
    identities.add(identity);
    return trigger;
  }));
}

function normalizeAccessibility<TState>(
  value: TuiDefinition<TState, unknown>['accessibility']
): TuiDefinition<TState, unknown>['accessibility'] {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('TUI accessibility must be an object.');
  }
  if (value.describe !== undefined && typeof value.describe !== 'function') {
    throw new TypeError('TUI accessibility describe must be a function.');
  }
  return Object.freeze({ ...(value.describe === undefined ? {} : { describe: value.describe }) });
}

function normalizeNonTty(value: TuiDefinition<unknown, unknown>['nonTty']): TuiDefinition<unknown, unknown>['nonTty'] {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('TUI nonTty must be an object.');
  }
  const mode = value.mode;
  if (mode !== 'reject' && mode !== 'transcript_only' && mode !== 'last_frame') {
    throw new TypeError('TUI nonTty mode is unsupported.');
  }
  const diagnosticHint = value.diagnosticHint;
  if (diagnosticHint !== undefined && typeof diagnosticHint !== 'string') {
    throw new TypeError('TUI nonTty diagnosticHint must be a string.');
  }
  return Object.freeze({
    mode,
    ...(diagnosticHint === undefined ? {} : { diagnosticHint })
  });
}
