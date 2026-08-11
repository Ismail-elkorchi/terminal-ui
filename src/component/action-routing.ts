import type { ElementKeyBindings, ElementKeyEvent } from '../element/metadata.ts';
import {
  findUnsupportedField,
  isNonArrayObject,
  isStringMember,
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
  if (!isNonArrayObject(bindings)) {
    throw new TypeError('Component definition keys must be an object.');
  }
  const named: Partial<
    Record<BindableKeyName, NonNullable<ElementKeyBindings<unknown>[BindableKeyName]>>
  > = {};
  let triggers: ElementKeyBindings<unknown>['triggers'];
  let textBindings: ElementKeyBindings<unknown>['text'];
  for (const [key, handler] of Object.entries(bindings)) {
    if (key === 'triggers') {
      if (!Array.isArray(handler)) {
        throw new TypeError('Component definition keys.triggers must be an array.');
      }
      triggers = Object.freeze(handler.map((binding, index) => {
        if (!isNonArrayObject(binding)) {
          throw new TypeError(`Component definition keys.triggers[${String(index)}] must be an object.`);
        }
        const unsupported = findUnsupportedField(binding, triggerBindingFields);
        if (unsupported !== undefined) {
          throw new TypeError(
            `Component definition keys.triggers[${String(index)}] contains unknown field "${unsupported}".`,
          );
        }
        const onKey = binding['onKey'];
        if (!isKeyHandler(onKey)) {
          throw new TypeError(`Component definition keys.triggers[${String(index)}].onKey must be a function.`);
        }
        return Object.freeze({
          trigger: normalizeComponentKeyTrigger(
            binding['trigger'],
            `Component definition keys.triggers[${String(index)}].trigger`,
          ),
          onKey: (event: ElementKeyEvent) =>
            executeComponentPhase(component, instanceId, 'keyboard', () =>
              mapComponentAction(onKey(event), mapper)),
        });
      }));
      continue;
    }
    if (key === 'text') {
      if (!isNonArrayObject(handler)) {
        throw new TypeError('Component definition keys.text must be an object.');
      }
      textBindings = Object.freeze(Object.fromEntries(Object.entries(handler).map(([text, textHandler]) => {
        if (segmentGraphemes(text).length !== 1) {
          throw new TypeError(
            `Component definition keys.text binding ${JSON.stringify(text)} must contain exactly one grapheme.`,
          );
        }
        if (!isKeyHandler(textHandler)) {
          throw new TypeError(`Component definition keys.text[${JSON.stringify(text)}] must be a function.`);
        }
        return [text, (event: ElementKeyEvent) =>
          executeComponentPhase(component, instanceId, 'keyboard', () =>
            mapComponentAction(textHandler(event), mapper))];
      })));
      continue;
    }
    if (!isBindableKeyName(key)) {
      throw new TypeError(`Component definition keys contains unknown binding "${key}".`);
    }
    if (!isKeyHandler(handler)) {
      throw new TypeError(`Component definition keys.${key} must be a function.`);
    }
    named[key] = (event) => executeComponentPhase(component, instanceId, 'keyboard', () =>
      mapComponentAction(handler(event), mapper));
  }
  return Object.freeze({
    ...named,
    ...(triggers === undefined ? {} : { triggers }),
    ...(textBindings === undefined ? {} : { text: textBindings }),
  });
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

function isBindableKeyName(value: unknown): value is BindableKeyName {
  return isStringMember(value, keyNames) && value !== 'unknown';
}

function isKeyHandler(value: unknown): value is (event: ElementKeyEvent) => unknown {
  return typeof value === 'function';
}

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
