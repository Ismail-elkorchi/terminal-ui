import { validateAccessibleSnapshot } from '../../accessibility/index.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import { isThemeColorToken } from '../../visual/color.ts';
import type { AccessibleNode, AccessibleSnapshot } from '../../accessibility/index.ts';
import type { PointerEventKind } from '../../input/index.ts';
import type { TerminalColor, TerminalStyle } from '../../visual/render.ts';
import type { FrameCellSource } from '../../visual/source.ts';
import type { CursorPosition, FocusTarget, HitTarget, Rect } from '../contracts.ts';

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

const terminalStyleFlagFields = [
  'bold',
  'dim',
  'italic',
  'underline',
  'strikethrough',
  'inverse',
  'hidden'
] as const satisfies readonly (keyof TerminalStyle)[];

const terminalStyleFields = new Set<string>([
  'fg',
  'bg',
  ...terminalStyleFlagFields
]);
const ansiColorFields = new Set(['kind', 'value']);
const rgbColorFields = new Set(['kind', 'r', 'g', 'b']);
const themeColorFields = new Set(['kind', 'token']);

type TerminalStyleFlagField = typeof terminalStyleFlagFields[number];

export function normalizeCustomFocusTargets(
  value: unknown,
  owner: string
): readonly FocusTarget[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Custom renderer "${owner}" focusTargets must return an array.`);
  }
  const ids = new Set<string>();
  const normalized: FocusTarget[] = [];
  for (const [index, target] of value.entries()) {
    if (!isNonArrayObject(target)) {
      throw new TypeError(`Custom renderer "${owner}" focus target ${String(index)} must be an object.`);
    }
    const id = target['id'];
    assertUniqueId(id, ids, `Custom renderer "${owner}" focus target`);
    assertValidRect(target['bounds'], `Custom renderer "${owner}" focus target "${id}"`);
    const cursor = target['cursor'];
    const disabled = target['disabled'];
    if (disabled !== undefined && typeof disabled !== 'boolean') {
      throw new TypeError(`Custom renderer "${owner}" focus target "${id}" disabled must be a boolean.`);
    }
    const order = target['order'];
    if (order !== undefined && !isSafeInteger(order)) {
      throw new TypeError(`Custom renderer "${owner}" focus target "${id}" order must be a safe integer.`);
    }
    const scopeId = target['scopeId'];
    if (scopeId !== undefined && !isNonEmptyString(scopeId)) {
      throw new TypeError(`Custom renderer "${owner}" focus target "${id}" scopeId must be a non-empty string.`);
    }
    normalized.push({
      id,
      bounds: target['bounds'],
      ...(cursor === undefined
        ? {}
        : { cursor: normalizeCustomCursor(cursor, `Custom renderer "${owner}" focus target "${id}" cursor`) }),
      ...(disabled === undefined ? {} : { disabled }),
      ...(order === undefined ? {} : { order }),
      ...(scopeId === undefined ? {} : { scopeId })
    });
  }
  return normalized;
}

export function normalizeCustomTerminalStyle(value: unknown, subject: string): TerminalStyle {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`${subject} must be an object.`);
  }
  assertSupportedFields(value, terminalStyleFields, subject);
  const fg = ownValue(value, 'fg');
  const bg = ownValue(value, 'bg');
  const flags: Partial<Record<TerminalStyleFlagField, boolean>> = {};
  for (const field of terminalStyleFlagFields) {
    const flag = ownValue(value, field);
    if (flag === undefined) continue;
    if (typeof flag !== 'boolean') {
      throw new TypeError(`${subject}.${field} must be a boolean.`);
    }
    flags[field] = flag;
  }
  return {
    ...(fg === undefined ? {} : { fg: normalizeCustomTerminalColor(fg, `${subject}.fg`) }),
    ...(bg === undefined ? {} : { bg: normalizeCustomTerminalColor(bg, `${subject}.bg`) }),
    ...flags
  };
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

function normalizeCustomCursor(value: unknown, subject: string): CursorPosition {
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
    ...(style === undefined ? {} : { style: normalizeCustomTerminalStyle(style, `${subject} style`) }),
    ...(source === undefined ? {} : { source: source as FrameCellSource })
  };
}

function normalizeCustomTerminalColor(value: unknown, subject: string): TerminalColor {
  if (!isNonArrayObject(value)) {
    throw new TypeError(`${subject} must be an object.`);
  }
  const kind = ownValue(value, 'kind');
  switch (kind) {
    case 'ansi': {
      assertSupportedFields(value, ansiColorFields, subject);
      const index = ownValue(value, 'value');
      if (!isColorChannel(index)) {
        throw new RangeError(`${subject}.value must be an integer from 0 through 255.`);
      }
      return { kind, value: index };
    }
    case 'rgb': {
      assertSupportedFields(value, rgbColorFields, subject);
      const r = ownValue(value, 'r');
      const g = ownValue(value, 'g');
      const b = ownValue(value, 'b');
      if (!isColorChannel(r)) throw new RangeError(`${subject}.r must be an integer from 0 through 255.`);
      if (!isColorChannel(g)) throw new RangeError(`${subject}.g must be an integer from 0 through 255.`);
      if (!isColorChannel(b)) throw new RangeError(`${subject}.b must be an integer from 0 through 255.`);
      return { kind, r, g, b };
    }
    case 'theme': {
      assertSupportedFields(value, themeColorFields, subject);
      const token = ownValue(value, 'token');
      if (typeof token !== 'string' || !isThemeColorToken(token)) {
        throw new TypeError(`${subject}.token must be a supported theme color token.`);
      }
      return { kind, token };
    }
    default:
      throw new TypeError(`${subject}.kind must be "ansi", "rgb", or "theme".`);
  }
}

function assertSupportedFields(
  value: Readonly<Record<string, unknown>>,
  supported: ReadonlySet<string>,
  subject: string
): void {
  for (const field of Object.keys(value)) {
    if (!supported.has(field)) {
      throw new TypeError(`${subject} contains unsupported field "${field}".`);
    }
  }
}

function ownValue(value: Readonly<Record<string, unknown>>, field: string): unknown {
  return Object.hasOwn(value, field) ? value[field] : undefined;
}

function isColorChannel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
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
