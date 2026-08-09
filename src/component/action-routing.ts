import type { ElementKeyBindings } from '../element/metadata.ts';
import {
  findUnsupportedField,
  isNonArrayObject,
  isStringMember,
} from '../foundation/validation.ts';
import type {
  BindableKeyName,
  InputTrigger,
  KeyModifierTrigger,
} from '../input/types.ts';
import { keyEventTypes, keyLocations, keyNames } from '../input/types.ts';
import type { PointerInteractionState } from '../interaction/pointer-interaction.ts';
import type { HitTarget } from '../renderer/contracts.ts';
import { executeComponentPhase, type ComponentDefinitionName } from './execution-error.ts';
import { mapComponentAction } from './message.ts';

export function mappedKeyBindings(
  bindings: ElementKeyBindings<unknown> | undefined,
  mapper: ((action: unknown) => unknown) | undefined,
  component: ComponentDefinitionName,
  instanceId: string | undefined,
): ElementKeyBindings<unknown> | undefined {
  if (bindings === undefined) return undefined;
  assertKeyBindings(bindings, 'Component definition keys');
  const named: Partial<
    Record<BindableKeyName, NonNullable<ElementKeyBindings<unknown>[BindableKeyName]>>
  > = {};
  for (const key of keyNames) {
    if (key === 'unknown') continue;
    const handler = bindings[key];
    if (handler === undefined) continue;
    named[key] = (event) => executeComponentPhase(component, instanceId, 'keyboard', () =>
      mapComponentAction(handler(event), mapper));
  }
  const mapped: ElementKeyBindings<unknown> = {
    ...named,
    ...(bindings.triggers === undefined ? {} : {
      triggers: bindings.triggers.map((binding) => ({
        trigger: binding.trigger,
        onKey: (event) => executeComponentPhase(component, instanceId, 'keyboard', () =>
          mapComponentAction(binding.onKey(event), mapper)),
      })),
    }),
    ...(bindings.text === undefined ? {} : {
      text: Object.fromEntries(Object.entries(bindings.text).map(([text, handler]) => [
        text,
        (event: Parameters<typeof handler>[0]) =>
          executeComponentPhase(component, instanceId, 'keyboard', () =>
            mapComponentAction(handler(event), mapper)),
      ])),
    }),
  };
  return Object.freeze(mapped);
}

export function mapHitTargets(
  targets: readonly HitTarget[],
  mapper: ((action: unknown) => unknown) | undefined,
  component: ComponentDefinitionName,
  instanceId: string | undefined,
): readonly HitTarget[] {
  return targets.map((target) => ({
    ...target,
    message: (event) => executeComponentPhase(component, instanceId, 'pointer', () =>
      mapComponentAction(target.message(event), mapper)),
  }));
}

export function actionMapper(
  renderNode: { readonly props: { readonly toActionMessage?: (action: unknown) => unknown } },
): ((action: unknown) => unknown) | undefined {
  return renderNode.props.toActionMessage;
}

export function assertKeyBindings(
  value: unknown,
  subject: string,
): asserts value is ElementKeyBindings<unknown> {
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const bindable = new Set<string>(keyNames.filter((name) => name !== 'unknown'));
  for (const [key, handler] of Object.entries(value)) {
    if (key === 'triggers') {
      if (!Array.isArray(handler)) throw new TypeError(`${subject}.triggers must be an array.`);
      for (const [index, binding] of handler.entries()) {
        if (!isNonArrayObject(binding)) {
          throw new TypeError(`${subject}.triggers[${String(index)}] must be an object.`);
        }
        const unsupported = findUnsupportedField(binding, triggerBindingFields);
        if (unsupported !== undefined) {
          throw new TypeError(
            `${subject}.triggers[${String(index)}] contains unknown field "${unsupported}".`,
          );
        }
        assertKeyInputTrigger(binding['trigger'], `${subject}.triggers[${String(index)}].trigger`);
        if (typeof binding['onKey'] !== 'function') {
          throw new TypeError(`${subject}.triggers[${String(index)}].onKey must be a function.`);
        }
      }
      continue;
    }
    if (key === 'text') {
      if (!isNonArrayObject(handler)) throw new TypeError(`${subject}.text must be an object.`);
      for (const [text, textHandler] of Object.entries(handler)) {
        if (typeof textHandler !== 'function') {
          throw new TypeError(`${subject}.text[${JSON.stringify(text)}] must be a function.`);
        }
      }
      continue;
    }
    if (!bindable.has(key)) throw new TypeError(`${subject} contains unknown binding "${key}".`);
    if (typeof handler !== 'function') throw new TypeError(`${subject}.${key} must be a function.`);
  }
}

export function assertPointerDefinition(value: unknown): void {
  if (value === undefined) return;
  if (!isNonArrayObject(value)) {
    throw new TypeError('Component definition pointer must be an object.');
  }
  const unsupported = findUnsupportedField(value, new Set(['state', 'onAction']));
  if (unsupported !== undefined) {
    throw new TypeError(
      `Component definition pointer contains unknown field "${unsupported}".`,
    );
  }
  if (value['state'] !== undefined && typeof value['state'] !== 'function') {
    throw new TypeError('Component definition pointer.state must be a function when provided.');
  }
  if (typeof value['onAction'] !== 'function') {
    throw new TypeError('Component definition pointer requires onAction().');
  }
}

export function normalizedPointerState(
  value: unknown,
  component: string,
): PointerInteractionState {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" pointer state must be an object.`);
  }
  const unsupported = findUnsupportedField(
    value,
    new Set(['hoveredTargetId', 'pressedTargetId']),
  );
  if (unsupported !== undefined) {
    throw new TypeError(
      `Component "${component}" pointer state contains unknown field "${unsupported}".`,
    );
  }
  for (const field of ['hoveredTargetId', 'pressedTargetId'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      throw new TypeError(`Component "${component}" pointer state.${field} must be a string.`);
    }
  }
  return Object.freeze({
    ...(typeof value['hoveredTargetId'] === 'string'
      ? { hoveredTargetId: value['hoveredTargetId'] }
      : {}),
    ...(typeof value['pressedTargetId'] === 'string'
      ? { pressedTargetId: value['pressedTargetId'] }
      : {}),
  });
}

const triggerBindingFields = new Set(['trigger', 'onKey']);
const keyTriggerFields = new Set(['kind', 'key', 'modifiers', 'eventType', 'location']);
const codePointTriggerFields = new Set([
  'kind',
  'codePoint',
  'source',
  'modifiers',
  'eventType',
  'location',
]);
const physicalKeyTriggerFields = new Set([
  'kind',
  'codePoint',
  'modifiers',
  'eventType',
  'location',
]);
const modifierFields = new Set(['kind', 'ctrl', 'alt', 'shift', 'meta']);

function assertKeyInputTrigger(
  value: unknown,
  subject: string,
): asserts value is Extract<
  InputTrigger,
  { readonly kind: 'key' | 'codePoint' | 'physicalKey' }
> {
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const kind = value['kind'];
  const fields = kind === 'key'
    ? keyTriggerFields
    : kind === 'codePoint'
      ? codePointTriggerFields
      : kind === 'physicalKey'
        ? physicalKeyTriggerFields
        : undefined;
  if (fields === undefined) {
    throw new TypeError(`${subject}.kind must be "key", "codePoint", or "physicalKey".`);
  }
  const unsupported = findUnsupportedField(value, fields);
  if (unsupported !== undefined) {
    throw new TypeError(`${subject} contains unknown field "${unsupported}".`);
  }
  if (kind === 'key') {
    if (!isStringMember(value['key'], keyNames) || value['key'] === 'unknown') {
      throw new TypeError(`${subject}.key must be a bindable key name.`);
    }
  } else if (!isUnicodeScalar(value['codePoint'])) {
    throw new TypeError(`${subject}.codePoint must be a Unicode scalar value.`);
  }
  if (
    kind === 'codePoint' && value['source'] !== undefined &&
    value['source'] !== 'primary' && value['source'] !== 'shifted'
  ) {
    throw new TypeError(`${subject}.source must be "primary" or "shifted".`);
  }
  if (value['eventType'] !== undefined && !isStringMember(value['eventType'], keyEventTypes)) {
    throw new TypeError(`${subject}.eventType is unsupported.`);
  }
  if (value['location'] !== undefined && !isStringMember(value['location'], keyLocations)) {
    throw new TypeError(`${subject}.location is unsupported.`);
  }
  assertModifierTrigger(value['modifiers'], subject);
}

function assertModifierTrigger(
  value: unknown,
  subject: string,
): asserts value is KeyModifierTrigger | undefined {
  if (value === undefined) return;
  if (!isNonArrayObject(value)) throw new TypeError(`${subject}.modifiers must be an object.`);
  const unsupported = findUnsupportedField(value, modifierFields);
  if (unsupported !== undefined) {
    throw new TypeError(`${subject}.modifiers contains unknown field "${unsupported}".`);
  }
  if (value['kind'] !== undefined && value['kind'] !== 'any' && value['kind'] !== 'exact') {
    throw new TypeError(`${subject}.modifiers.kind must be "any" or "exact".`);
  }
  if (value['kind'] === 'any' && Object.keys(value).some((field) => field !== 'kind')) {
    throw new TypeError(`${subject}.modifiers kind "any" cannot define modifier flags.`);
  }
  for (const field of ['ctrl', 'alt', 'shift', 'meta'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      throw new TypeError(`${subject}.modifiers.${field} must be a boolean.`);
    }
  }
}

function isUnicodeScalar(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 0x10ffff &&
    !(Number(value) >= 0xd800 && Number(value) <= 0xdfff);
}
