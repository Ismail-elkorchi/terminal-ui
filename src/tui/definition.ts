import { decodeInputTrigger, inputTriggerIdentity } from '../input/index.ts';
import type { TuiBindingHelpItem } from './types.ts';
import type { InputTrigger } from '../input/index.ts';
import type { TuiApp, TuiDefinition, TuiInputBinding } from './types.ts';

const tuiDefinitions = new WeakMap<object, object>();

export function defineTui<TState, TMessage extends NonNullable<unknown>>(
  definition: TuiDefinition<TState, TMessage>
): TuiApp<TState, TMessage>;
export function defineTui<TState, TMessage extends NonNullable<unknown>>(
  definition: unknown,
): TuiApp<TState, TMessage> {
  if (typeof definition !== 'object' || definition === null || Array.isArray(definition)) {
    throw new TypeError('TUI definition must be an object.');
  }
  const supplied = definition as Readonly<Record<string, unknown>>;
  const suppliedId = supplied['id'];
  const init = supplied['init'];
  const update = supplied['update'];
  const view = supplied['view'];
  const suppliedInputBindings = supplied['inputBindings'];
  const subscriptions = supplied['subscriptions'];
  const onExit = supplied['onExit'];
  const transcript = supplied['transcript'];
  const suppliedNonTty = supplied['nonTty'];
  const id = suppliedId ?? 'tui-app';
  if (typeof id !== 'string' || id.trim() === '') throw new TypeError('TUI id must be a non-empty string.');
  if (typeof init !== 'function') throw new TypeError('TUI init must be a function.');
  if (typeof update !== 'function') throw new TypeError('TUI update must be a function.');
  if (typeof view !== 'function') throw new TypeError('TUI view must be a function.');
  if (subscriptions !== undefined && typeof subscriptions !== 'function') {
    throw new TypeError('TUI subscriptions must be a function when provided.');
  }
  if (onExit !== undefined && typeof onExit !== 'function') {
    throw new TypeError('TUI onExit must be a function when provided.');
  }
  if (transcript !== undefined && typeof transcript !== 'boolean') {
    throw new TypeError('TUI transcript must be a boolean when provided.');
  }
  const inputBindings = normalizeInputBindings(suppliedInputBindings);
  const nonTty = normalizeNonTty(suppliedNonTty);
  const normalized = Object.freeze({
    id,
    init,
    update,
    view,
    ...(inputBindings === undefined ? {} : { inputBindings }),
    ...(subscriptions === undefined ? {} : { subscriptions }),
    ...(onExit === undefined ? {} : { onExit }),
    ...(transcript === undefined ? {} : { transcript }),
    ...(nonTty === undefined ? {} : { nonTty })
  }) as TuiDefinition<TState, TMessage>;
  const app = Object.freeze({ id }) as TuiApp<TState, TMessage>;
  tuiDefinitions.set(app, normalized);
  return app;
}

export function assertTuiApp(value: unknown): void {
  if (!tuiDefinitions.has(value as object)) {
    throw new TypeError('TUI app must be created by defineTui().');
  }
}

export function tuiDefinition<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
): TuiDefinition<TState, TMessage> {
  const definition = tuiDefinitions.get(app);
  if (definition === undefined) {
    throw new TypeError('TUI app must be created by defineTui().');
  }
  return definition as TuiDefinition<TState, TMessage>;
}

export function projectTuiBindingHelp<TState, TMessage>(
  app: TuiApp<TState, TMessage>,
): readonly TuiBindingHelpItem[] {
  return Object.freeze((tuiDefinition(app).inputBindings ?? []).flatMap((binding) => {
    if (binding.label === undefined) return [];
    const triggers = binding.triggers.filter((trigger): trigger is import('../interaction/key-binding.ts').KeyboardBinding =>
      trigger.kind === 'key' || trigger.kind === 'codePoint' || trigger.kind === 'physicalKey');
    if (triggers.length === 0) return [];
    return [Object.freeze({
      id: binding.id,
      label: binding.label,
      bindings: Object.freeze(triggers.map((trigger) => Object.freeze({
        binding: trigger,
        label: binding.label ?? '',
      }))),
    })];
  }));
}

function normalizeInputBindings<TState, TMessage>(
  value: unknown,
): readonly TuiInputBinding<TState, TMessage>[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError('TUI inputBindings must be an array.');
  const ids = new Set<string>();
  return Object.freeze(value.map((candidate, index) => {
    const binding = decodeInputBinding(candidate, index);
    if (ids.has(binding.id)) {
      throw new TypeError(`TUI input binding id ${JSON.stringify(binding.id)} is duplicated.`);
    }
    ids.add(binding.id);
    const triggers = normalizeBindingTriggers(binding.id, binding.triggers);
    const base = {
      id: binding.id,
      triggers,
      ...(binding.phase === undefined ? {} : { phase: binding.phase }),
      ...(binding.label === undefined ? {} : { label: binding.label }),
      ...(binding.enabled === undefined ? {} : { enabled: binding.enabled })
    };
    return (binding.toMessage === undefined
      ? Object.freeze({ ...base, message: binding.message })
      : Object.freeze({ ...base, toMessage: binding.toMessage })) as TuiInputBinding<TState, TMessage>;
  }));
}

interface DecodedInputBinding {
  readonly id: string;
  readonly triggers: readonly unknown[];
  readonly phase?: 'beforeFocus' | 'afterFocus';
  readonly label?: string;
  readonly enabled?: boolean | ((context: unknown) => boolean);
  readonly message?: NonNullable<unknown>;
  readonly toMessage?: (context: unknown) => NonNullable<unknown>;
}

function decodeInputBinding(value: unknown, index: number): DecodedInputBinding {
  const subject = `TUI input binding at index ${String(index)}`;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${subject} must be an object.`);
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  const id = candidate['id'];
  const triggers = candidate['triggers'];
  const phase = candidate['phase'];
  const label = candidate['label'];
  const enabled = candidate['enabled'];
  if (typeof id !== 'string' || id.trim() === '') {
    throw new TypeError(`${subject} id must be a non-empty string.`);
  }
  if (!Array.isArray(triggers) || triggers.length === 0) {
    throw new TypeError(`${subject} must define at least one trigger.`);
  }
  if (phase !== undefined && phase !== 'beforeFocus' && phase !== 'afterFocus') {
    throw new TypeError(`${subject} phase must be beforeFocus or afterFocus.`);
  }
  if (label !== undefined && typeof label !== 'string') {
    throw new TypeError(`${subject} label must be a string.`);
  }
  if (enabled !== undefined && typeof enabled !== 'boolean' && typeof enabled !== 'function') {
    throw new TypeError(`${subject} enabled must be a boolean or function.`);
  }
  const hasMessage = Object.hasOwn(candidate, 'message');
  const hasToMessage = Object.hasOwn(candidate, 'toMessage');
  if (hasMessage === hasToMessage) {
    throw new TypeError(`${subject} must define exactly one of message or toMessage.`);
  }
  const message = candidate['message'];
  const toMessage = candidate['toMessage'];
  if (hasMessage && (message === undefined || message === null)) {
    throw new TypeError(`${subject} message cannot be null or undefined.`);
  }
  if (hasToMessage && typeof toMessage !== 'function') {
    throw new TypeError(`${subject} toMessage must be a function.`);
  }
  return Object.freeze({
    id,
    triggers,
    ...(phase === undefined ? {} : { phase }),
    ...(label === undefined ? {} : { label }),
    ...(enabled === undefined ? {} : {
      enabled: enabled as boolean | ((context: unknown) => boolean),
    }),
    ...(hasMessage ? { message: message as NonNullable<unknown> } : {
      toMessage: toMessage as (context: unknown) => NonNullable<unknown>,
    }),
  });
}

function normalizeBindingTriggers(id: string, values: readonly unknown[]): readonly InputTrigger[] {
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

function normalizeNonTty(value: unknown): TuiDefinition<unknown, unknown>['nonTty'] {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('TUI nonTty must be an object.');
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  const mode = candidate['mode'];
  if (mode !== 'reject' && mode !== 'transcript_only' && mode !== 'last_frame') {
    throw new TypeError('TUI nonTty mode is unsupported.');
  }
  const diagnosticHint = candidate['diagnosticHint'];
  if (diagnosticHint !== undefined && typeof diagnosticHint !== 'string') {
    throw new TypeError('TUI nonTty diagnosticHint must be a string.');
  }
  return Object.freeze({
    mode,
    ...(diagnosticHint === undefined ? {} : { diagnosticHint })
  });
}
