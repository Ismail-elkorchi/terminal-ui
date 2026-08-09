import type { ElementKeyBindings } from '../element/metadata.ts';
import {
  findUnsupportedField,
  isNonArrayObject,
} from '../foundation/validation.ts';
import type {
  BindableKeyName,
  InputTrigger,
} from '../input/types.ts';
import { keyNames } from '../input/types.ts';
import { normalizeInputTrigger } from '../input/triggers.ts';
import type { PointerInteractionState } from '../interaction/pointer-interaction.ts';
import type { HitTarget } from '../renderer/contracts.ts';
import { segmentGraphemes } from '../text/index.ts';
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
      triggers: Object.freeze(bindings.triggers.map((binding, index) => Object.freeze({
        trigger: normalizeComponentKeyTrigger(
          binding.trigger,
          `Component definition keys.triggers[${String(index)}].trigger`,
        ),
        onKey: (event: Parameters<typeof binding.onKey>[0]) =>
          executeComponentPhase(component, instanceId, 'keyboard', () =>
          mapComponentAction(binding.onKey(event), mapper)),
      }))),
    }),
    ...(bindings.text === undefined ? {} : {
      text: Object.freeze(Object.fromEntries(Object.entries(bindings.text).map(([text, handler]) => [
        text,
        (event: Parameters<typeof handler>[0]) =>
          executeComponentPhase(component, instanceId, 'keyboard', () =>
            mapComponentAction(handler(event), mapper)),
      ]))),
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
        const triggerSubject = `${subject}.triggers[${String(index)}].trigger`;
        normalizeComponentKeyTrigger(binding['trigger'], triggerSubject);
        if (typeof binding['onKey'] !== 'function') {
          throw new TypeError(`${subject}.triggers[${String(index)}].onKey must be a function.`);
        }
      }
      continue;
    }
    if (key === 'text') {
      if (!isNonArrayObject(handler)) throw new TypeError(`${subject}.text must be an object.`);
      for (const [text, textHandler] of Object.entries(handler)) {
        if (segmentGraphemes(text).length !== 1) {
          throw new TypeError(`${subject}.text binding ${JSON.stringify(text)} must contain exactly one grapheme.`);
        }
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

function normalizeComponentKeyTrigger(
  value: unknown,
  subject: string,
): Extract<InputTrigger, { readonly kind: 'key' | 'codePoint' | 'physicalKey' }> {
  let trigger: InputTrigger;
  try {
    trigger = normalizeInputTrigger(value);
  } catch (cause) {
    const detail = cause instanceof Error ? ` ${cause.message}` : '';
    throw new TypeError(`${subject} is invalid.${detail}`, { cause });
  }
  if (trigger.kind === 'text' || trigger.kind === 'focus') {
    throw new TypeError(`${subject} must be a key, codePoint, or physicalKey trigger.`);
  }
  return trigger;
}
