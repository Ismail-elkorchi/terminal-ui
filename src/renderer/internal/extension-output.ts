import { validateAccessibleSnapshot } from '../../accessibility/index.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import type { AccessibleNode, AccessibleSnapshot } from '../../accessibility/index.ts';
import type { PointerEventKind } from '../../input/index.ts';
import type { FocusTarget, HitTarget, Measurement, Rect } from '../contracts.ts';

const pointerEventKinds = new Set<PointerEventKind>([
  'pointerDown',
  'pointerUp',
  'click',
  'contextMenu',
  'scroll',
  'dragStart',
  'drag',
  'dragEnd',
  'hover',
  'enter',
  'leave'
]);

export function assertValidCustomMeasurement(value: unknown, owner: string): asserts value is Measurement {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Custom renderer "${owner}" measurement must be an object.`);
  }
  for (const field of ['minWidth', 'minHeight', 'preferredWidth', 'preferredHeight'] as const) {
    if (!isNonNegativeSafeInteger(value[field])) {
      throw new TypeError(`Custom renderer "${owner}" measurement ${field} must be a non-negative safe integer.`);
    }
  }
  for (const field of ['maxWidth', 'maxHeight'] as const) {
    if (value[field] !== undefined && !isNonNegativeSafeInteger(value[field])) {
      throw new TypeError(`Custom renderer "${owner}" measurement ${field} must be a non-negative safe integer.`);
    }
  }
  assertMeasurementAxis(value, owner, 'Width');
  assertMeasurementAxis(value, owner, 'Height');
}

export function assertValidCustomFocusTargets(
  value: unknown,
  owner: string
): asserts value is readonly FocusTarget[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Custom renderer "${owner}" focusTargets must return an array.`);
  }
  const ids = new Set<string>();
  for (const [index, target] of value.entries()) {
    if (!isNonArrayObject(target)) {
      throw new TypeError(`Custom renderer "${owner}" focus target ${String(index)} must be an object.`);
    }
    const id = target['id'];
    assertUniqueId(id, ids, `Custom renderer "${owner}" focus target`);
    assertValidRect(target['bounds'], `Custom renderer "${owner}" focus target "${id}"`);
    const cursor = target['cursor'];
    if (cursor !== undefined) {
      if (!isNonArrayObject(cursor)
        || !Number.isSafeInteger(cursor['row'])
        || !Number.isSafeInteger(cursor['column'])) {
        throw new TypeError(`Custom renderer "${owner}" focus target "${id}" cursor must have safe-integer coordinates.`);
      }
    }
    if (target['disabled'] !== undefined && typeof target['disabled'] !== 'boolean') {
      throw new TypeError(`Custom renderer "${owner}" focus target "${id}" disabled must be a boolean.`);
    }
    if (target['order'] !== undefined && !Number.isSafeInteger(target['order'])) {
      throw new TypeError(`Custom renderer "${owner}" focus target "${id}" order must be a safe integer.`);
    }
    if (target['scopeId'] !== undefined && !isNonEmptyString(target['scopeId'])) {
      throw new TypeError(`Custom renderer "${owner}" focus target "${id}" scopeId must be a non-empty string.`);
    }
  }
}

export function assertValidCustomHitTargets<TMessage>(
  value: unknown,
  owner: string
): asserts value is readonly HitTarget<TMessage>[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Custom renderer "${owner}" hitTargets must return an array.`);
  }
  const ids = new Set<string>();
  for (const [index, target] of value.entries()) {
    if (!isNonArrayObject(target)) {
      throw new TypeError(`Custom renderer "${owner}" hit target ${String(index)} must be an object.`);
    }
    const id = target['id'];
    assertUniqueId(id, ids, `Custom renderer "${owner}" hit target`);
    assertValidRect(target['bounds'], `Custom renderer "${owner}" hit target "${id}"`);
    if (typeof target['message'] !== 'function') {
      throw new TypeError(`Custom renderer "${owner}" hit target "${id}" must provide a message function.`);
    }
    const accepts = target['accepts'];
    if (accepts !== undefined) {
      if (!Array.isArray(accepts)
        || accepts.some((kind) => typeof kind !== 'string' || !pointerEventKinds.has(kind as PointerEventKind))
        || new Set(accepts).size !== accepts.length) {
        throw new TypeError(`Custom renderer "${owner}" hit target "${id}" accepts contains invalid or duplicate event kinds.`);
      }
    }
    assertPointerFocusIntent(target['focus'], owner, id);
    const cursor = target['cursor'];
    if (cursor !== undefined && (typeof cursor !== 'string' || !['pointer', 'text', 'default'].includes(cursor))) {
      throw new TypeError(`Custom renderer "${owner}" hit target "${id}" cursor is invalid.`);
    }
    if (target['zIndex'] !== undefined && !Number.isSafeInteger(target['zIndex'])) {
      throw new TypeError(`Custom renderer "${owner}" hit target "${id}" zIndex must be a safe integer.`);
    }
  }
}

export function assertValidRendererAccessibility(snapshot: AccessibleSnapshot): void {
  const result = validateAccessibleSnapshot(snapshot);
  if (!result.ok) {
    throw new TypeError(`Renderer produced invalid accessibility: ${result.error.message}`);
  }
}

export function assertCustomAccessibilityFocus(
  node: AccessibleNode,
  options: {
    readonly runtimeFocused: boolean;
    readonly focusedTargetId: string | undefined;
    readonly focusTargetIds: readonly string[];
    readonly owner: string;
  }
): void {
  const nodes = collectAccessibleNodes(node);
  const focusedNodes = nodes.filter((candidate) => candidate.focused === true);
  const accessibilityFocused = focusedNodes.length > 0;
  if (options.runtimeFocused !== accessibilityFocused) {
    throw new TypeError(
      `Custom renderer "${options.owner}" accessibility focus must agree with the resolved frame focus: ${
        options.runtimeFocused
          ? 'no accessible node reported the resolved focus.'
          : 'an accessible node reported focus without a resolved frame target.'
      }`
    );
  }
  if (!options.runtimeFocused || options.focusedTargetId === undefined) return;

  const focusTargetIds = new Set(options.focusTargetIds);
  const targetNodes = nodes.filter((candidate) => focusTargetIds.has(candidate.id));
  if (targetNodes.length === 0) return;

  const focusedTargetNode = targetNodes.find((candidate) =>
    candidate.id === options.focusedTargetId
  );
  if (focusedTargetNode?.focused !== true) {
    throw new TypeError(
      `Custom renderer "${options.owner}" accessibility must mark resolved focus target "${options.focusedTargetId}" as focused.`
    );
  }
  if (focusedNodes.some((candidate) => candidate !== focusedTargetNode)) {
    throw new TypeError(
      `Custom renderer "${options.owner}" accessibility reports focus outside resolved target "${options.focusedTargetId}".`
    );
  }
}

function collectAccessibleNodes(root: AccessibleNode): readonly AccessibleNode[] {
  const nodes: AccessibleNode[] = [];
  visit(root);
  return nodes;

  function visit(node: AccessibleNode): void {
    nodes.push(node);
    for (const child of node.children ?? []) visit(child);
  }
}

function assertMeasurementAxis(
  value: Record<string, unknown>,
  owner: string,
  suffix: 'Width' | 'Height'
): void {
  const min = value[`min${suffix}`] as number;
  const preferred = value[`preferred${suffix}`] as number;
  const max = value[`max${suffix}`] as number | undefined;
  if (preferred < min) {
    throw new RangeError(`Custom renderer "${owner}" preferred${suffix} must not be less than min${suffix}.`);
  }
  if (max !== undefined && (max < min || preferred > max)) {
    throw new RangeError(`Custom renderer "${owner}" ${suffix.toLowerCase()} measurement must satisfy min <= preferred <= max.`);
  }
}

function assertPointerFocusIntent(value: unknown, owner: string, id: string): void {
  if (value === undefined) return;
  if (!isNonArrayObject(value)) {
    throw new TypeError(`Custom renderer "${owner}" hit target "${id}" focus must be an object.`);
  }
  if (value['kind'] === 'preserve') return;
  if (value['kind'] === 'target' && isNonEmptyString(value['targetId'])) return;
  throw new TypeError(`Custom renderer "${owner}" hit target "${id}" focus intent is invalid.`);
}

function assertUniqueId(value: unknown, ids: Set<string>, subject: string): asserts value is string {
  if (!isNonEmptyString(value)) throw new TypeError(`${subject} id must be a non-empty string.`);
  if (ids.has(value)) throw new TypeError(`${subject} id must be unique: "${value}".`);
  ids.add(value);
}

function assertValidRect(value: unknown, subject: string): asserts value is Rect {
  if (!isNonArrayObject(value)
    || !Number.isSafeInteger(value['row'])
    || !Number.isSafeInteger(value['column'])
    || !isNonNegativeSafeInteger(value['width'])
    || !isNonNegativeSafeInteger(value['height'])) {
    throw new TypeError(`${subject} bounds must use safe-integer coordinates and non-negative safe-integer dimensions.`);
  }
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
