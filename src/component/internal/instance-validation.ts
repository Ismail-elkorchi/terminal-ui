import type {
  ElementFocus,
  ElementFocusScope,
  ElementLayer,
  ElementState,
  ElementStyles,
} from '../../element/metadata.ts';
import { elementStateFields } from '../../element/metadata.ts';
import { decodeElementPaint } from '../../element/metadata-normalization.ts';
import { decodeElementStyles } from '../../element/styles.ts';
import {
  findUnsupportedField,
  isNonArrayObject,
  isStringMember,
} from '../../foundation/validation.ts';
import { sanitizeTerminalText } from '../../text/sanitize.ts';
import type { ComponentStateCapability } from '../contracts.ts';
import type { ComponentInstanceOptions, ComponentRuntimeContract } from './runtime-contracts.ts';

export function extractComponentOptions(
  value: unknown,
  definition: ComponentRuntimeContract
): ComponentInstanceOptions {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${definition.name}" options must be an object.`);
  }
  const instance = { ...value };
  assertComponentInstanceIdentity(instance, definition);
  assertComponentInstanceStructure(instance, definition);
  const meta = adoptComponentInstancePresentation(instance, definition);
  assertNoInstanceBehavior(instance, definition);
  if (definition.semantics === 'decorative') {
    assertDecorativeComponentInstance(instance, meta, definition);
    return Object.freeze(instance);
  }
  assertComponentState(instance, definition);
  adoptComponentActionMapping(instance, definition);
  return Object.freeze(instance);
}

function assertComponentInstanceIdentity(
  instance: Readonly<Record<string, unknown>>,
  definition: ComponentRuntimeContract,
): void {
  if (definition.identity === 'required'
    && (typeof instance['id'] !== 'string' || instance['id'].trim() === '')) {
    throw new TypeError(`Component "${definition.name}" requires a non-empty id.`);
  }
  if (instance['id'] !== undefined && (typeof instance['id'] !== 'string' || instance['id'].trim() === '')) {
    throw new TypeError(`Component "${definition.name}" id must be a non-empty string when provided.`);
  }
}

function assertComponentInstanceStructure(
  instance: Readonly<Record<string, unknown>>,
  definition: ComponentRuntimeContract,
): void {
  if (Object.hasOwn(instance, 'children')) {
    throw new TypeError(
      `Component "${definition.name}" options contain unknown field "children"; use declared named slots.`
    );
  }
  if (definition.structure === 'leaf' && instance['slots'] !== undefined) {
    throw new TypeError(`Component "${definition.name}" is a leaf and cannot contain slots.`);
  }
}

function adoptComponentInstancePresentation(
  instance: Record<string, unknown>,
  definition: ComponentRuntimeContract,
): ComponentInstanceOptions['meta'] {
  const meta = decodeComponentMetadata(instance['meta'], definition);
  if (meta !== undefined) instance['meta'] = meta;
  if (instance['styles'] !== undefined) {
    if (!definition.metadata.includes('styles')) {
      throw new TypeError(`Component "${definition.name}" does not permit caller styles.`);
    }
    instance['styles'] = decodeComponentStyles(instance['styles'], definition);
  }
  return meta;
}

function assertNoInstanceBehavior(
  instance: Readonly<Record<string, unknown>>,
  definition: ComponentRuntimeContract,
): void {
  for (const removedInstanceHandler of ['keys', 'onInput', 'onPaste', 'pointer'] as const) {
    if (instance[removedInstanceHandler] !== undefined) {
      throw new TypeError(
        `Component "${definition.name}" ${removedInstanceHandler} behavior must be declared by the definition.`
      );
    }
  }
}

function assertDecorativeComponentInstance(
  instance: Readonly<Record<string, unknown>>,
  meta: ComponentInstanceOptions['meta'],
  definition: ComponentRuntimeContract,
): void {
  if (elementStateFields.some((field) => instance[field] !== undefined)
    || instance['onAction'] !== undefined
    || meta?.focus !== undefined) {
    throw new TypeError(
      `Decorative component "${definition.name}" cannot define state, actions, or focus options.`
    );
  }
}

function adoptComponentActionMapping(
  instance: Record<string, unknown>,
  definition: ComponentRuntimeContract,
): void {
  const actionful = definition.actionful;
  const unavailable = instance['disabled'] === true || instance['inert'] === true;
  if (instance['onAction'] !== undefined && typeof instance['onAction'] !== 'function') {
    throw new TypeError(`Component "${definition.name}" onAction must be a function when provided.`);
  }
  if (actionful && !unavailable && typeof instance['onAction'] !== 'function') {
    throw new TypeError(`Component "${definition.name}" requires onAction to map its semantic actions.`);
  }
  if (!actionful && instance['onAction'] !== undefined) {
    throw new TypeError(`Component "${definition.name}" does not define actions and cannot accept onAction.`);
  }
}

export function normalizeComponentState(
  value: ComponentInstanceOptions,
  enabled: ReadonlySet<ComponentStateCapability>
): Readonly<ElementState> {
  return Object.freeze({
    ...(enabled.has('disabled') && value.disabled === true ? { disabled: true } : {}),
    ...(enabled.has('busy') && value.busy === true ? { busy: true } : {}),
    ...(enabled.has('readOnly') && value.readOnly === true ? { readOnly: true } : {}),
    ...(enabled.has('inert') && value.inert === true ? { inert: true } : {})
  });
}

function assertComponentState(
  value: Readonly<Record<string, unknown>>,
  definition: ComponentRuntimeContract
): void {
  for (const field of elementStateFields) {
    if (value[field] !== undefined && !definition.stateSet.has(field)) {
      throw new TypeError(`Component "${definition.name}" does not declare the ${field} capability.`);
    }
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      throw new TypeError(`Component "${definition.name}" ${field} must be a boolean.`);
    }
  }
}

function decodeComponentMetadata(
  value: unknown,
  definition: ComponentRuntimeContract
): ComponentInstanceOptions['meta'] {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${definition.name}" meta must be an object when provided.`);
  }
  const unsupported = findUnsupportedField(value, definition.metadataFieldSet);
  if (unsupported !== undefined) {
    throw new TypeError(
      `Component "${definition.name}" does not permit caller metadata field "${unsupported}".`
    );
  }
  const paint = decodeElementPaint(value['paint']);
  const focusValue = value['focus'];
  const layerValue = value['layer'];
  const accessibleNameValue = value['accessibleName'];
  const focus = decodeCallerFocus(focusValue, definition.name);
  const layer = decodeElementLayer(layerValue, definition.name, 'caller');
  const accessibleName = accessibleNameValue === undefined
    ? undefined
    : cleanComponentAccessibleName(accessibleNameValue, definition.name);
  return Object.freeze({
    ...(paint === undefined ? {} : { paint }),
    ...(focus === undefined ? {} : { focus }),
    ...(layer === undefined ? {} : { layer }),
    ...(accessibleName === undefined ? {} : { accessibleName }),
  });
}

function cleanComponentAccessibleName(value: unknown, component: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Component "${component}" accessibleName must be a string.`);
  }
  const clean = sanitizeTerminalText(value).text.trim();
  if (clean.length === 0) {
    throw new TypeError(`Component "${component}" accessibleName must be non-empty.`);
  }
  return clean;
}

function decodeCallerFocus(value: unknown, component: string): ElementFocus | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" meta.focus must be an object.`);
  }
  const unsupported = findUnsupportedField(value, new Set(['disabled', 'order']));
  if (unsupported !== undefined) {
    throw new TypeError(`Component "${component}" meta.focus contains unknown field "${unsupported}".`);
  }
  const disabled = value['disabled'];
  const order = value['order'];
  if (disabled !== undefined && typeof disabled !== 'boolean') {
    throw new TypeError(`Component "${component}" meta.focus.disabled must be a boolean.`);
  }
  if (order !== undefined
    && (typeof order !== 'number'
      || !Number.isFinite(order)
      || !Number.isInteger(order))) {
    throw new TypeError(`Component "${component}" meta.focus.order must be a finite integer.`);
  }
  return Object.freeze({
    ...(disabled === undefined ? {} : { disabled }),
    ...(order === undefined ? {} : { order })
  });
}

export function decodeFocusScope(
  value: unknown,
  component: string
): ElementFocusScope | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" focusScope must return an object or undefined.`);
  }
  const unsupported = findUnsupportedField(value, new Set(['kind', 'initialFocus', 'restoreFocus']));
  if (unsupported !== undefined) {
    throw new TypeError(`Component "${component}" focusScope contains unknown field "${unsupported}".`);
  }
  if (value['kind'] !== 'contain') {
    throw new TypeError(`Component "${component}" focusScope.kind must be "contain".`);
  }
  if (value['restoreFocus'] !== undefined && typeof value['restoreFocus'] !== 'boolean') {
    throw new TypeError(`Component "${component}" focusScope.restoreFocus must be a boolean.`);
  }
  const initialFocus = value['initialFocus'] === undefined
    ? undefined
    : decodeInitialFocusSelector(value['initialFocus'], component);
  return Object.freeze({
    kind: 'contain' as const,
    ...(initialFocus === undefined ? {} : { initialFocus }),
    ...(value['restoreFocus'] === undefined ? {} : { restoreFocus: value['restoreFocus'] })
  });
}

function decodeInitialFocusSelector(
  value: unknown,
  component: string
): NonNullable<ElementFocusScope['initialFocus']> {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" initial focus selector must be an object.`);
  }
  if (value['kind'] === 'path') {
    const path = value['path'];
    const unsupported = findUnsupportedField(value, new Set(['kind', 'path']));
    if (unsupported !== undefined || !Array.isArray(path)
      || path.length === 0) {
      throw new TypeError(`Component "${component}" initial focus path must contain non-empty segments.`);
    }
    const ownedPath = path.map((segment: unknown) => {
      if (typeof segment !== 'string' || segment.trim() === '') {
        throw new TypeError(`Component "${component}" initial focus path must contain non-empty segments.`);
      }
      return segment;
    });
    return Object.freeze({ kind: 'path' as const, path: Object.freeze(ownedPath) });
  }
  const kind = value['kind'];
  const supported = kind === 'element'
    ? new Set(['kind', 'elementId'])
    : kind === 'elementTarget'
      ? new Set(['kind', 'elementId', 'targetId'])
      : undefined;
  const unsupported = supported === undefined ? undefined : findUnsupportedField(value, supported);
  if (supported === undefined || unsupported !== undefined
    || typeof value['elementId'] !== 'string' || value['elementId'].trim() === '') {
    throw new TypeError(`Component "${component}" initial focus selector is invalid.`);
  }
  const elementId = value['elementId'];
  if (kind === 'element') {
    return Object.freeze({ kind: 'element' as const, elementId });
  }
  const targetId = value['targetId'];
  if (typeof targetId !== 'string' || targetId.trim() === '') {
    throw new TypeError(`Component "${component}" initial focus targetId must be non-empty.`);
  }
  return Object.freeze({
    kind: 'elementTarget' as const,
    elementId,
    targetId
  });
}

export function decodeElementLayer(
  value: unknown,
  component: string,
  owner: 'caller' | 'definition'
): ElementLayer | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Component "${component}" ${owner} layer must be an object or undefined.`);
  }
  const unsupported = findUnsupportedField(
    value,
    new Set(['zIndex', 'visible', 'underlay', 'backdrop', 'overflowPriority'])
  );
  if (unsupported !== undefined) {
    throw new TypeError(`Component "${component}" ${owner} layer contains unknown field "${unsupported}".`);
  }
  const zIndex = value['zIndex'];
  const visible = value['visible'];
  const underlay = value['underlay'];
  const backdrop = value['backdrop'];
  const overflowPriority = value['overflowPriority'];
  if (zIndex !== undefined
    && (typeof zIndex !== 'number' || !Number.isFinite(zIndex) || !Number.isInteger(zIndex))) {
    throw new TypeError(`Component "${component}" ${owner} layer.zIndex must be a finite integer.`);
  }
  if (visible !== undefined && typeof visible !== 'boolean') {
    throw new TypeError(`Component "${component}" ${owner} layer.visible must be a boolean.`);
  }
  if (underlay !== undefined
    && !isStringMember(underlay, ['clear', 'preserve', 'inheritBackground'])) {
    throw new TypeError(`Component "${component}" ${owner} layer.underlay is invalid.`);
  }
  if (backdrop !== undefined && backdrop !== 'viewport') {
    throw new TypeError(`Component "${component}" ${owner} layer.backdrop is invalid.`);
  }
  if (overflowPriority !== undefined
    && !isStringMember(overflowPriority, ['required', 'important', 'secondary', 'decorative'])) {
    throw new TypeError(`Component "${component}" ${owner} layer.overflowPriority is invalid.`);
  }
  return Object.freeze({
    ...(zIndex === undefined ? {} : { zIndex }),
    ...(visible === undefined ? {} : { visible }),
    ...(underlay === undefined ? {} : { underlay }),
    ...(backdrop === undefined ? {} : { backdrop }),
    ...(overflowPriority === undefined ? {} : { overflowPriority })
  });
}

function decodeComponentStyles(
  value: unknown,
  definition: ComponentRuntimeContract
): ElementStyles {
  return decodeElementStyles(value, {
    subject: `Component "${definition.name}" styles`,
    parts: definition.partSet,
    states: definition.visualStateSet,
  });
}
