import type { ElementKeyBindings, ElementKeyEvent } from '../element/metadata.ts';
import {
  findUnsupportedField,
  isNonEmptyString,
  isNonArrayObject,
  isStringMember,
} from '../foundation/validation.ts';
import type { Rect } from '../geometry/types.ts';
import type {
  BindableKeyName,
  InputTrigger,
} from '../input/types.ts';
import { keyNames } from '../input/types.ts';
import { pointerEventKinds } from '../input/pointer.ts';
import type { PointerEventKind, RoutedPointerEvent } from '../input/pointer.ts';
import { decodeInputTrigger } from '../input/triggers.ts';
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

export function normalizeComponentHitTargets(
  value: unknown,
  allocation: Rect,
  mapper: ((action: unknown) => unknown) | undefined,
  component: ComponentDefinitionName,
  instanceId: string | undefined,
): readonly HitTarget[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Component "${component}" hitTargets must return an array.`);
  }
  const ids = new Set<string>();
  return Object.freeze(value.map((item, index): HitTarget => {
    if (!isNonArrayObject(item)) {
      throw new TypeError(`Component "${component}" hit target ${String(index)} must be an object.`);
    }
    const target = { ...item };
    const id = target['id'];
    if (!isNonEmptyString(id)) {
      throw new TypeError(`Component "${component}" hit target id must be a non-empty string.`);
    }
    if (ids.has(id)) {
      throw new TypeError(`Component "${component}" hit target id must be unique: "${id}".`);
    }
    ids.add(id);
    const bounds = absoluteHitTargetBounds(target['bounds'], allocation, component, id);
    const accepts = normalizeAcceptedPointerEvents(target['accepts'], component, id);
    const focus = normalizePointerFocusIntent(target['focus'], component, id);
    const message = target['message'];
    if (!isPointerMessage(message)) {
      throw new TypeError(`Component "${component}" hit target "${id}" must provide a message function.`);
    }
    const cursor = target['cursor'];
    if (cursor !== undefined && cursor !== 'pointer' && cursor !== 'text' && cursor !== 'default') {
      throw new TypeError(`Component "${component}" hit target "${id}" cursor is invalid.`);
    }
    const zIndex = target['zIndex'];
    if (zIndex !== undefined && (typeof zIndex !== 'number' || !Number.isSafeInteger(zIndex))) {
      throw new TypeError(`Component "${component}" hit target "${id}" zIndex must be a safe integer.`);
    }
    return Object.freeze({
      id,
      bounds,
      ...(accepts === undefined ? {} : { accepts }),
      ...(focus === undefined ? {} : { focus }),
      message: (event: RoutedPointerEvent) => executeComponentPhase(component, instanceId, 'pointer', () =>
        mapComponentAction(message(event), mapper)),
      ...(cursor === undefined ? {} : { cursor }),
      ...(zIndex === undefined ? {} : { zIndex }),
    });
  }));
}

const pointerEventKindSet = new Set<string>(pointerEventKinds);

function absoluteHitTargetBounds(
  value: unknown,
  allocation: Rect,
  component: string,
  id: string,
): Rect {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" hit target "${id}" bounds must be an object.`);
  }
  const { row, column, width, height } = value;
  if (!Number.isSafeInteger(row)
    || !Number.isSafeInteger(column)
    || !isNonNegativeSafeInteger(width)
    || !isNonNegativeSafeInteger(height)) {
    throw new TypeError(
      `Component "${component}" hit target "${id}" bounds must use safe-integer coordinates and non-negative safe-integer dimensions.`,
    );
  }
  return Object.freeze({
    row: allocation.row + Number(row),
    column: allocation.column + Number(column),
    width,
    height,
  });
}

function normalizeAcceptedPointerEvents(
  value: unknown,
  component: string,
  id: string,
): readonly PointerEventKind[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new TypeError(`Component "${component}" hit target "${id}" accepts must be an array.`);
  }
  const accepts: PointerEventKind[] = [];
  const accepted = new Set<PointerEventKind>();
  for (const item of value) {
    if (!isPointerEventKind(item) || accepted.has(item)) {
      throw new TypeError(
        `Component "${component}" hit target "${id}" accepts contains invalid or duplicate event kinds.`,
      );
    }
    accepted.add(item);
    accepts.push(item);
  }
  return Object.freeze(accepts);
}

function isPointerEventKind(value: unknown): value is PointerEventKind {
  return typeof value === 'string' && pointerEventKindSet.has(value);
}

function isPointerMessage(value: unknown): value is (event: RoutedPointerEvent) => unknown {
  return typeof value === 'function';
}

function normalizePointerFocusIntent(
  value: unknown,
  component: string,
  id: string,
): HitTarget['focus'] {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" hit target "${id}" focus must be an object.`);
  }
  const { kind } = value;
  if (kind === 'preserve') return Object.freeze({ kind });
  const targetId = value['targetId'];
  if (kind === 'target' && isNonEmptyString(targetId)) {
    return Object.freeze({ kind, targetId });
  }
  throw new TypeError(`Component "${component}" hit target "${id}" focus intent is invalid.`);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
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
    trigger = decodeInputTrigger(value);
  } catch (cause) {
    const detail = cause instanceof Error ? ` ${cause.message}` : '';
    throw new TypeError(`${subject} is invalid.${detail}`, { cause });
  }
  if (trigger.kind === 'text' || trigger.kind === 'focus') {
    throw new TypeError(`${subject} must be a key, codePoint, or physicalKey trigger.`);
  }
  return trigger;
}
