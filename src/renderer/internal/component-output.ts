import { decodeAccessibleSnapshot } from '../../accessibility/index.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import { normalizeTerminalStyle } from '../../visual/terminal-style.ts';
import { normalizeUntrustedFrameCellSource } from '../../visual/source.ts';
import type { AccessibleNode, AccessibleSnapshot } from '../../accessibility/index.ts';
import type { CursorPosition, FocusTarget, Rect } from '../contracts.ts';

export function normalizeComponentFocusTargets(
  value: unknown,
  owner: string
): readonly FocusTarget[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Component "${owner}" focusTargets must return an array.`);
  }
  const ids = new Set<string>();
  const normalized: FocusTarget[] = [];
  for (const [index, target] of value.entries()) {
    if (!isNonArrayObject(target)) {
      throw new TypeError(`Component "${owner}" focus target ${String(index)} must be an object.`);
    }
    const id = target['id'];
    assertUniqueId(id, ids, `Component "${owner}" focus target`);
    assertValidRect(target['bounds'], `Component "${owner}" focus target "${id}"`);
    const cursor = target['cursor'];
    const disabled = target['disabled'];
    if (disabled !== undefined && typeof disabled !== 'boolean') {
      throw new TypeError(`Component "${owner}" focus target "${id}" disabled must be a boolean.`);
    }
    const order = target['order'];
    if (order !== undefined && !isSafeInteger(order)) {
      throw new TypeError(`Component "${owner}" focus target "${id}" order must be a safe integer.`);
    }
    const scopeId = target['scopeId'];
    if (scopeId !== undefined && !isNonEmptyString(scopeId)) {
      throw new TypeError(`Component "${owner}" focus target "${id}" scopeId must be a non-empty string.`);
    }
    normalized.push({
      id,
      bounds: target['bounds'],
      ...(cursor === undefined
        ? {}
        : { cursor: normalizeComponentCursor(cursor, `Component "${owner}" focus target "${id}" cursor`) }),
      ...(disabled === undefined ? {} : { disabled }),
      ...(order === undefined ? {} : { order }),
      ...(scopeId === undefined ? {} : { scopeId })
    });
  }
  return normalized;
}

export function adoptRenderedAccessibility(
  snapshot: AccessibleSnapshot,
  frameFocused: boolean
): AccessibleSnapshot {
  const result = decodeAccessibleSnapshot(snapshot);
  if (!result.ok) {
    throw new TypeError(`Renderer returned invalid accessibility: ${result.error.message}`);
  }
  if ((result.value.focusPath.length > 0) !== frameFocused) {
    throw new TypeError(
      'Rendered accessibility focus must agree with the resolved frame focus.'
    );
  }
  return result.value;
}

export function assertComponentAccessibilityFocus(
  node: AccessibleNode,
  options: {
    readonly runtimeFocused: boolean;
    readonly focusedTargetId: string | undefined;
    readonly focusTargetIds: readonly string[];
    readonly excludedSubtreeIds: ReadonlySet<string>;
    readonly owner: string;
    readonly maxNodes?: number;
    readonly maxDepth?: number;
  }
): void {
  const nodes = collectAccessibleNodes(
    node,
    options.excludedSubtreeIds,
    options.owner,
    options.maxNodes,
    options.maxDepth,
  );
  const focusedNodes = nodes.filter((candidate) => candidate.focused === true);
  const accessibilityFocused = focusedNodes.length > 0;
  if (options.runtimeFocused !== accessibilityFocused) {
    throw new TypeError(
      `Component "${options.owner}" accessibility focus must agree with the resolved frame focus: ${
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
      `Component "${options.owner}" accessibility must mark resolved focus target "${options.focusedTargetId}" as focused.`
    );
  }
  if (focusedNodes.some((candidate) => candidate !== focusedTargetNode)) {
    throw new TypeError(
      `Component "${options.owner}" accessibility reports focus outside resolved target "${options.focusedTargetId}".`
    );
  }
}

function collectAccessibleNodes(
  root: AccessibleNode,
  excludedSubtreeIds: ReadonlySet<string>,
  owner: string,
  maxNodes = Number.MAX_SAFE_INTEGER,
  maxDepth = Number.MAX_SAFE_INTEGER,
): readonly AccessibleNode[] {
  const nodes: AccessibleNode[] = [];
  const pending: { readonly node: AccessibleNode; readonly depth: number; readonly isRoot: boolean }[] = [
    { node: root, depth: 0, isRoot: true },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    if (!current.isRoot && excludedSubtreeIds.has(current.node.id)) continue;
    if (current.depth > maxDepth) {
      throw new RangeError(`Component "${owner}" accessibility exceeded depth limit of ${String(maxDepth)}.`);
    }
    nodes.push(current.node);
    if (nodes.length > maxNodes) {
      throw new RangeError(`Component "${owner}" accessibility exceeded node limit of ${String(maxNodes)}.`);
    }
    const children = current.node.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) pending.push({ node: child, depth: current.depth + 1, isRoot: false });
    }
  }
  return nodes;
}

function normalizeComponentCursor(value: unknown, subject: string): CursorPosition {
  if (!isNonArrayObject(value)
    || !isSafeInteger(value['row'])
    || !isSafeInteger(value['column'])) {
    throw new TypeError(`${subject} must have safe-integer coordinates.`);
  }
  const style = ownValue(value, 'style');
  const source = ownValue(value, 'source');
  return {
    row: value['row'],
    column: value['column'],
    ...(style === undefined ? {} : { style: normalizeTerminalStyle(style, `${subject} style`) }),
    ...(source === undefined ? {} : { source: normalizeUntrustedFrameCellSource(source) })
  };
}

function ownValue(value: Readonly<Record<string, unknown>>, field: string): unknown {
  return Object.hasOwn(value, field) ? value[field] : undefined;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
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
