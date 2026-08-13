import { adoptTerminalDiagnostic, diagnostic } from '../diagnostics.ts';
import {
  findUnsupportedField,
  isNonArrayObject,
  isNonEmptyString
} from '../foundation/validation.ts';
import { err, ok } from '../result.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import {
  accessibleRoles,
  accessibleRoleSupportsReadOnly,
  accessibleSources
} from './types.ts';
import type { Result } from '../result.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type {
  AccessibleNode,
  AccessibleNumericValue,
  AccessiblePosition,
  AccessibleScope,
  AccessibleSnapshot,
  AccessibleValue,
  AccessibleWindow
} from './types.ts';

const decodedAccessibleSnapshots = new WeakMap<object, AccessibleSnapshot>();

export function decodeAccessibleSnapshot(snapshot: unknown): Result<AccessibleSnapshot> {
  return adoptAccessibleSnapshot(snapshot, false);
}

export function adoptAccessibleSnapshot(
  snapshot: unknown,
  sanitizeText: boolean
): Result<AccessibleSnapshot> {
  if (typeof snapshot === 'object' && snapshot !== null) {
    const existing = decodedAccessibleSnapshots.get(snapshot);
    if (existing !== undefined) return ok(existing);
  }
  if (!isNonArrayObject(snapshot)) return err(accessibilityFailure('Accessible snapshot must be an object.'));
  const candidate = { ...snapshot };
  const unknownField = findUnsupportedField(candidate, accessibleSnapshotFields);
  if (unknownField !== undefined) {
    return err(accessibilityFailure(`Accessible snapshot contains unsupported field: ${unknownField}.`));
  }
  if (!isAccessibleSource(candidate['source'])) {
    return err(accessibilityFailure(`Unsupported accessible snapshot source: ${String(candidate['source'])}.`));
  }
  const source = candidate['source'];
  let title = candidate['title'];
  if (title !== undefined && typeof title !== 'string') {
    return err(accessibilityFailure('Accessible snapshot title must be a string.'));
  }
  if (typeof title === 'string') {
    const sanitizedTitle = sanitizeTerminalText(title);
    if (!sanitizeText && sanitizedTitle.changed) {
      return err(accessibilityFailure('Accessible snapshot title must not contain terminal control sequences.'));
    }
    title = sanitizedTitle.text;
  }
  const suppliedFocusPath = candidate['focusPath'];
  if (!sanitizeText && suppliedFocusPath === undefined) {
    return err(accessibilityFailure('Accessible snapshot focusPath must be a string array.'));
  }
  if (suppliedFocusPath !== undefined
    && (!Array.isArray(suppliedFocusPath) || !suppliedFocusPath.every((item) => typeof item === 'string'))) {
    return err(accessibilityFailure('Accessible snapshot focusPath must be a string array.'));
  }
  const suppliedDiagnostics = candidate['diagnostics'];
  if (!sanitizeText && suppliedDiagnostics === undefined) {
    return err(accessibilityFailure('Accessible snapshot diagnostics must be an array.'));
  }
  if (suppliedDiagnostics !== undefined && !Array.isArray(suppliedDiagnostics)) {
    return err(accessibilityFailure('Accessible snapshot diagnostics must be an array.'));
  }
  const diagnostics = [];
  for (const [index, item] of (suppliedDiagnostics ?? []).entries()) {
    try {
      diagnostics.push(adoptTerminalDiagnostic(item));
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      return err(accessibilityFailure(`Invalid accessible snapshot diagnostic at index ${String(index)}: ${detail}`));
    }
  }
  const nodes = new WeakMap<object, AccessibleNode>();
  const nodesById = new Map<string, AccessibleNode>();
  let actualFocusPath: readonly string[] = [];
  const rootValue = candidate['root'];
  const nodeIssue = firstNodeIssue(
    rootValue,
    new Set(),
    nodes,
    nodesById,
    sanitizeText,
    [],
    (path) => { if (actualFocusPath.length === 0) actualFocusPath = path; },
  );
  if (nodeIssue !== undefined) return err(nodeIssue);
  if (!isNonArrayObject(rootValue)) {
    return err(accessibilityFailure('Accessible node must be an object.'));
  }
  const root = nodes.get(rootValue);
  if (root === undefined) return err(accessibilityFailure('Accessible snapshot root was not adopted.'));
  const ownedTitle = typeof title === 'string' ? title : undefined;
  const focusPath = Object.freeze([
    ...(suppliedFocusPath ?? actualFocusPath)
  ]);
  const owned = Object.freeze({
    source,
    ...(ownedTitle === undefined ? {} : { title: ownedTitle }),
    root,
    focusPath,
    diagnostics: Object.freeze(diagnostics)
  });
  const focusIssue = firstFocusIssue(owned, actualFocusPath);
  if (focusIssue !== undefined) return err(focusIssue);
  const relationshipIssue = firstRelationshipIssue(nodesById);
  if (relationshipIssue !== undefined) return err(relationshipIssue);
  decodedAccessibleSnapshots.set(snapshot, owned);
  decodedAccessibleSnapshots.set(owned, owned);
  return ok(owned);
}

function firstNodeIssue(
  node: unknown,
  ids: Set<string>,
  adopted: WeakMap<object, AccessibleNode>,
  nodesById: Map<string, AccessibleNode>,
  sanitizeText: boolean,
  path: readonly string[],
  recordFocusPath: (path: readonly string[]) => void,
): TerminalDiagnostic | undefined {
  if (!isNonArrayObject(node)) return accessibilityFailure('Accessible node must be an object.');
  const original = node;
  const candidate = { ...node };
  for (const field of ['numericValue', 'scope', 'window', 'position'] as const) {
    if (isNonArrayObject(candidate[field])) candidate[field] = { ...candidate[field] };
  }
  if (Array.isArray(candidate['children'])) {
    const children: unknown[] = [];
    for (const child of candidate['children']) children.push(child);
    candidate['children'] = children;
  }
  const unknownField = findUnsupportedField(candidate, accessibleNodeFields);
  if (unknownField !== undefined) {
    return accessibilityFailure(`Accessible node field is unsupported: ${unknownField}.`);
  }
  if (!isNonEmptyString(candidate['id'])) return accessibilityFailure('Accessible node id must not be empty.');
  const id = candidate['id'];
  const currentPath = [...path, id];
  if (ids.has(id)) return accessibilityFailure(`Accessible node id must be unique: ${id}.`);
  ids.add(id);
  if (!isAccessibleRole(candidate['role'])) {
    return accessibilityFailure(`Unsupported accessible node role: ${String(candidate['role'])}.`, id);
  }
  const role = candidate['role'];
  if (sanitizeText) sanitizeNodeText(candidate);
  const labelIssue = optionalStringIssue(candidate, 'label', id);
  if (labelIssue !== undefined) return labelIssue;
  const descriptionIssue = optionalStringIssue(candidate, 'description', id);
  if (descriptionIssue !== undefined) return descriptionIssue;
  const controlsIssue = optionalStringIssue(candidate, 'controls', id);
  if (controlsIssue !== undefined) return controlsIssue;
  if (candidate['controls'] === '') return accessibilityFailure('Accessible node controls must not be empty.', id);
  const labelledByIssue = optionalStringIssue(candidate, 'labelledBy', id);
  if (labelledByIssue !== undefined) return labelledByIssue;
  if (candidate['labelledBy'] === '') return accessibilityFailure('Accessible node labelledBy must not be empty.', id);
  const activeDescendantIssue = optionalStringIssue(candidate, 'activeDescendant', id);
  if (activeDescendantIssue !== undefined) return activeDescendantIssue;
  if (candidate['activeDescendant'] === '') {
    return accessibilityFailure('Accessible node activeDescendant must not be empty.', id);
  }
  const errorMessageIssue = optionalStringIssue(candidate, 'errorMessage', id);
  if (errorMessageIssue !== undefined) return errorMessageIssue;
  if (candidate['errorMessage'] === '') {
    return accessibilityFailure('Accessible node errorMessage must not be empty.', id);
  }
  if (candidate['value'] !== undefined && !isAccessibleValue(candidate['value'])) {
    return accessibilityFailure('Accessible node value must be string, number, boolean, or null.', id);
  }
  if (typeof candidate['value'] === 'string' && sanitizeTerminalText(candidate['value']).changed) {
    return accessibilityFailure('Accessible node value must not contain terminal control sequences.', id);
  }
  for (const field of [
    'focused',
    'selected',
    'disabled',
    'busy',
    'readOnly',
    'expanded',
    'multiSelectable',
    'required',
  ] as const) {
    if (candidate[field] !== undefined && typeof candidate[field] !== 'boolean') {
      return accessibilityFailure(`Accessible node ${field} must be a boolean.`, id);
    }
  }
  if (candidate['checked'] !== undefined && typeof candidate['checked'] !== 'boolean' && candidate['checked'] !== 'mixed') {
    return accessibilityFailure('Accessible node checked must be a boolean or "mixed".', id);
  }
  if (candidate['pressed'] !== undefined && typeof candidate['pressed'] !== 'boolean' && candidate['pressed'] !== 'mixed') {
    return accessibilityFailure('Accessible node pressed must be a boolean or "mixed".', id);
  }
  const current = candidate['current'];
  if (current !== undefined && typeof current !== 'boolean'
    && current !== 'page' && current !== 'step' && current !== 'location'
    && current !== 'date' && current !== 'time') {
    return accessibilityFailure('Accessible node current state is invalid.', id);
  }
  if (candidate['orientation'] !== undefined
    && candidate['orientation'] !== 'horizontal'
    && candidate['orientation'] !== 'vertical') {
    return accessibilityFailure('Accessible node orientation must be horizontal or vertical.', id);
  }
  if (candidate['invalid'] !== undefined && typeof candidate['invalid'] !== 'boolean'
    && candidate['invalid'] !== 'grammar' && candidate['invalid'] !== 'spelling') {
    return accessibilityFailure('Accessible node invalid state is invalid.', id);
  }
  const stateRoleIssue = roleStateIssue(candidate, id);
  if (stateRoleIssue !== undefined) return stateRoleIssue;
  const numericValueIssue = numericValueIssueForNode(candidate, id);
  if (numericValueIssue !== undefined) return numericValueIssue;
  const liveIssue = liveIssueForNode(candidate, id);
  if (liveIssue !== undefined) return liveIssue;
  const scopeIssue = scopeIssueForNode(candidate, id);
  if (scopeIssue !== undefined) return scopeIssue;
  const windowIssue = windowIssueForNode(candidate, id);
  if (windowIssue !== undefined) return windowIssue;
  const positionIssue = positionIssueForNode(candidate, id);
  if (positionIssue !== undefined) return positionIssue;
  if (candidate['children'] !== undefined && !Array.isArray(candidate['children'])) {
    return accessibilityFailure('Accessible node children must be an array.', id);
  }
  if (candidate['focused'] === true) recordFocusPath(Object.freeze(currentPath));
  const children: AccessibleNode[] = [];
  for (const child of candidate['children'] ?? []) {
    const childIssue = firstNodeIssue(
      child,
      ids,
      adopted,
      nodesById,
      sanitizeText,
      currentPath,
      recordFocusPath,
    );
    if (childIssue !== undefined) return childIssue;
    if (isNonArrayObject(child)) {
      const ownedChild = adopted.get(child);
      if (ownedChild !== undefined) children.push(ownedChild);
    }
  }
  const relationshipIssue = childRoleIssue(candidate, id);
  if (relationshipIssue !== undefined) return relationshipIssue;
  const owned = ownedAccessibleNode(candidate, id, role, children);
  adopted.set(original, owned);
  nodesById.set(id, owned);
  return undefined;
}

function sanitizeNodeText(node: Record<string, unknown>): void {
  for (const field of [
    'label',
    'description',
    'controls',
    'labelledBy',
    'activeDescendant',
    'errorMessage'
  ] as const) {
    if (typeof node[field] === 'string') node[field] = sanitizeTerminalText(node[field]).text;
  }
  if (typeof node['value'] === 'string') node['value'] = sanitizeTerminalText(node['value']).text;
  const position = node['position'];
  if (!isNonArrayObject(position)) return;
  const mutablePosition = position as Record<string, unknown>;
  for (const field of ['columnLabel', 'group'] as const) {
    if (typeof mutablePosition[field] === 'string') {
      mutablePosition[field] = sanitizeTerminalText(mutablePosition[field]).text;
    }
  }
}

function ownedAccessibleNode(
  value: Readonly<Record<string, unknown>>,
  id: string,
  role: AccessibleNode['role'],
  children: readonly AccessibleNode[]
): AccessibleNode {
  const accessibleValue = value['value'];
  const checked = value['checked'];
  const live = value['live'];
  return Object.freeze({
    id,
    role,
    ...(typeof value['label'] === 'string' ? { label: value['label'] } : {}),
    ...(isAccessibleValue(accessibleValue) ? { value: accessibleValue } : {}),
    ...(typeof value['focused'] === 'boolean' ? { focused: value['focused'] } : {}),
    ...(typeof value['selected'] === 'boolean' ? { selected: value['selected'] } : {}),
    ...(typeof value['disabled'] === 'boolean' ? { disabled: value['disabled'] } : {}),
    ...(typeof value['busy'] === 'boolean' ? { busy: value['busy'] } : {}),
    ...(typeof value['readOnly'] === 'boolean' ? { readOnly: value['readOnly'] } : {}),
    ...(typeof value['expanded'] === 'boolean' ? { expanded: value['expanded'] } : {}),
    ...(typeof checked === 'boolean' || checked === 'mixed' ? { checked } : {}),
    ...(typeof value['pressed'] === 'boolean' || value['pressed'] === 'mixed'
      ? { pressed: value['pressed'] }
      : {}),
    ...(typeof value['current'] === 'boolean' || ['page', 'step', 'location', 'date', 'time'].includes(String(value['current']))
      ? { current: value['current'] as NonNullable<AccessibleNode['current']> }
      : {}),
    ...(value['orientation'] === 'horizontal' || value['orientation'] === 'vertical'
      ? { orientation: value['orientation'] }
      : {}),
    ...(typeof value['multiSelectable'] === 'boolean' ? { multiSelectable: value['multiSelectable'] } : {}),
    ...(typeof value['required'] === 'boolean' ? { required: value['required'] } : {}),
    ...(typeof value['invalid'] === 'boolean' || value['invalid'] === 'grammar' || value['invalid'] === 'spelling'
      ? { invalid: value['invalid'] }
      : {}),
    ...ownedNumericValue(value['numericValue']),
    ...(live === 'off' || live === 'polite' || live === 'assertive' ? { live } : {}),
    ...ownedScope(value['scope']),
    ...ownedWindow(value['window']),
    ...ownedPosition(value['position']),
    ...(typeof value['description'] === 'string' ? { description: value['description'] } : {}),
    ...(typeof value['controls'] === 'string' ? { controls: value['controls'] } : {}),
    ...(typeof value['labelledBy'] === 'string' ? { labelledBy: value['labelledBy'] } : {}),
    ...(typeof value['activeDescendant'] === 'string' ? { activeDescendant: value['activeDescendant'] } : {}),
    ...(typeof value['errorMessage'] === 'string' ? { errorMessage: value['errorMessage'] } : {}),
    ...(value['children'] === undefined ? {} : { children: Object.freeze([...children]) })
  });
}

function ownedNumericValue(value: unknown): { readonly numericValue?: AccessibleNumericValue } {
  if (!isNonArrayObject(value)) return {};
  return { numericValue: Object.freeze({
    ...(typeof value['current'] === 'number' ? { current: value['current'] } : {}),
    ...(typeof value['minimum'] === 'number' ? { minimum: value['minimum'] } : {}),
    ...(typeof value['maximum'] === 'number' ? { maximum: value['maximum'] } : {}),
    ...(typeof value['indeterminate'] === 'boolean' ? { indeterminate: value['indeterminate'] } : {})
  }) };
}

function ownedScope(value: unknown): { readonly scope?: AccessibleScope } {
  if (!isNonArrayObject(value)) return {};
  const kind = value['kind'];
  if (kind !== 'document' && kind !== 'modal' && kind !== 'popover' && kind !== 'menu') return {};
  return { scope: Object.freeze({
    kind,
    ...(typeof value['trapsFocus'] === 'boolean' ? { trapsFocus: value['trapsFocus'] } : {}),
    ...(typeof value['obscuresBackground'] === 'boolean'
      ? { obscuresBackground: value['obscuresBackground'] }
      : {})
  }) };
}

function ownedWindow(value: unknown): { readonly window?: AccessibleWindow } {
  if (!isNonArrayObject(value)) return {};
  const { startIndex, endIndexExclusive, totalCount } = value;
  if (typeof startIndex !== 'number' || typeof endIndexExclusive !== 'number' || typeof totalCount !== 'number') {
    return {};
  }
  return { window: Object.freeze({
    startIndex,
    endIndexExclusive,
    totalCount,
    ...(typeof value['omittedBefore'] === 'number' ? { omittedBefore: value['omittedBefore'] } : {}),
    ...(typeof value['omittedAfter'] === 'number' ? { omittedAfter: value['omittedAfter'] } : {})
  }) };
}

function ownedPosition(value: unknown): { readonly position?: AccessiblePosition } {
  if (!isNonArrayObject(value)) return {};
  return { position: Object.freeze({
    ...(typeof value['positionInSet'] === 'number' ? { positionInSet: value['positionInSet'] } : {}),
    ...(typeof value['setSize'] === 'number' ? { setSize: value['setSize'] } : {}),
    ...(typeof value['level'] === 'number' ? { level: value['level'] } : {}),
    ...(typeof value['rowIndex'] === 'number' ? { rowIndex: value['rowIndex'] } : {}),
    ...(typeof value['rowCount'] === 'number' ? { rowCount: value['rowCount'] } : {}),
    ...(typeof value['columnIndex'] === 'number' ? { columnIndex: value['columnIndex'] } : {}),
    ...(typeof value['columnCount'] === 'number' ? { columnCount: value['columnCount'] } : {}),
    ...(typeof value['columnLabel'] === 'string' ? { columnLabel: value['columnLabel'] } : {}),
    ...(typeof value['group'] === 'string' ? { group: value['group'] } : {})
  }) };
}

const accessibleNodeFields = new Set([
  'id',
  'role',
  'label',
  'value',
  'focused',
  'selected',
  'disabled',
  'busy',
  'readOnly',
  'expanded',
  'checked',
  'pressed',
  'current',
  'orientation',
  'multiSelectable',
  'required',
  'invalid',
  'numericValue',
  'live',
  'scope',
  'window',
  'position',
  'description',
  'controls',
  'labelledBy',
  'activeDescendant',
  'errorMessage',
  'children'
]);

const accessibleSnapshotFields = new Set([
  'source',
  'title',
  'root',
  'focusPath',
  'diagnostics'
]);

function liveIssueForNode(node: Record<string, unknown>, id: string): TerminalDiagnostic | undefined {
  return node['live'] === undefined || (typeof node['live'] === 'string' && ['off', 'polite', 'assertive'].includes(node['live']))
    ? undefined
    : accessibilityFailure('Accessible node live region must be "off", "polite", or "assertive".', id);
}

function scopeIssueForNode(node: Record<string, unknown>, id: string): TerminalDiagnostic | undefined {
  const scope = node['scope'];
  if (scope === undefined) return undefined;
  if (!isNonArrayObject(scope)) return accessibilityFailure('Accessible node scope must be an object.', id);
  const unknownField = findUnsupportedField(scope, scopeFields);
  if (unknownField !== undefined) {
    return accessibilityFailure(`Accessible node scope field is unsupported: ${unknownField}.`, id);
  }
  if (!['document', 'modal', 'popover', 'menu'].includes(String(scope['kind']))) {
    return accessibilityFailure('Accessible node scope kind is unsupported.', id);
  }
  for (const field of ['trapsFocus', 'obscuresBackground'] as const) {
    if (scope[field] !== undefined && typeof scope[field] !== 'boolean') {
      return accessibilityFailure(`Accessible node scope ${field} must be a boolean.`, id);
    }
  }
  return undefined;
}

const scopeFields = new Set(['kind', 'trapsFocus', 'obscuresBackground']);

function windowIssueForNode(node: Record<string, unknown>, id: string): TerminalDiagnostic | undefined {
  const window = node['window'];
  if (window === undefined) return undefined;
  if (!isNonArrayObject(window)) return accessibilityFailure('Accessible node window must be an object.', id);
  const unknownField = findUnsupportedField(window, windowFields);
  if (unknownField !== undefined) {
    return accessibilityFailure(`Accessible node window field is unsupported: ${unknownField}.`, id);
  }
  for (const field of ['startIndex', 'endIndexExclusive', 'totalCount'] as const) {
    if (!isNonNegativeInteger(window[field])) return accessibilityFailure(`Accessible node window ${field} must be a non-negative integer.`, id);
  }
  for (const field of ['omittedBefore', 'omittedAfter'] as const) {
    if (window[field] !== undefined && !isNonNegativeInteger(window[field])) {
      return accessibilityFailure(`Accessible node window ${field} must be a non-negative integer.`, id);
    }
  }
  if (Number(window['endIndexExclusive']) < Number(window['startIndex'])) {
    return accessibilityFailure('Accessible node window endIndexExclusive must not be before startIndex.', id);
  }
  if (Number(window['endIndexExclusive']) > Number(window['totalCount'])) {
    return accessibilityFailure('Accessible node window endIndexExclusive must not exceed totalCount.', id);
  }
  return undefined;
}

const windowFields = new Set([
  'startIndex',
  'endIndexExclusive',
  'totalCount',
  'omittedBefore',
  'omittedAfter'
]);

function positionIssueForNode(node: Record<string, unknown>, id: string): TerminalDiagnostic | undefined {
  const position = node['position'];
  if (position === undefined) return undefined;
  if (!isNonArrayObject(position)) return accessibilityFailure('Accessible node position must be an object.', id);
  const unknownField = findUnsupportedField(position, positionFields);
  if (unknownField !== undefined) {
    return accessibilityFailure(`Accessible node position field is unsupported: ${unknownField}.`, id);
  }
  for (const field of [
    'positionInSet',
    'setSize',
    'level',
    'rowIndex',
    'rowCount',
    'columnIndex',
    'columnCount'
  ] as const) {
    if (position[field] !== undefined && !isPositiveInteger(position[field])) {
      return accessibilityFailure(`Accessible node position ${field} must be a positive integer.`, id);
    }
  }
  for (const field of ['columnLabel', 'group'] as const) {
    if (position[field] !== undefined && typeof position[field] !== 'string') {
      return accessibilityFailure(`Accessible node position ${field} must be a string.`, id);
    }
    if (typeof position[field] === 'string' && sanitizeTerminalText(position[field]).changed) {
      return accessibilityFailure(`Accessible node position ${field} must not contain terminal control sequences.`, id);
    }
  }
  for (const [indexField, countField] of [
    ['positionInSet', 'setSize'],
    ['rowIndex', 'rowCount'],
    ['columnIndex', 'columnCount']
  ] as const) {
    if (
      typeof position[indexField] === 'number'
      && typeof position[countField] === 'number'
      && position[indexField] > position[countField]
    ) {
      return accessibilityFailure(
        `Accessible node position ${indexField} must not exceed ${countField}.`,
        id
      );
    }
  }
  return undefined;
}

const positionFields = new Set([
  'positionInSet',
  'setSize',
  'level',
  'rowIndex',
  'rowCount',
  'columnIndex',
  'columnCount',
  'columnLabel',
  'group'
]);

function firstFocusIssue(
  snapshot: Pick<AccessibleSnapshot, 'root' | 'focusPath'>,
  actualFocusPath: readonly string[],
): TerminalDiagnostic | undefined {
  if (snapshot.focusPath.length === 0) {
    return actualFocusPath.length === 0
      ? undefined
      : accessibilityFailure('Accessible snapshot focusPath is empty but a node is focused.');
  }
  const nodes = nodePath(snapshot.root, snapshot.focusPath);
  if (nodes === undefined) {
    return accessibilityFailure('Accessible snapshot focusPath must identify a real root-to-node path.');
  }
  if (actualFocusPath.length > 0 && !samePath(snapshot.focusPath, actualFocusPath)) {
    return accessibilityFailure('Accessible snapshot focusPath must match the focused node path.');
  }
  return undefined;
}

function nodePath(root: AccessibleNode, path: readonly string[]): readonly AccessibleNode[] | undefined {
  if (path.length === 0) return [];
  if (root.id !== path[0]) return undefined;
  const nodes: AccessibleNode[] = [root];
  let current = root;
  for (const id of path.slice(1)) {
    const next = current.children?.find((child) => child.id === id);
    if (next === undefined) return undefined;
    nodes.push(next);
    current = next;
  }
  return nodes;
}

function firstRelationshipIssue(nodes: ReadonlyMap<string, AccessibleNode>): TerminalDiagnostic | undefined {
  for (const node of nodes.values()) {
    if (node.labelledBy !== undefined) {
      if (node.labelledBy === node.id) {
        return accessibilityFailure('Accessible node labelledBy must identify a different node.', node.id);
      }
      const label = nodes.get(node.labelledBy);
      if (label === undefined) {
        return accessibilityFailure(
          `Accessible node labelledBy must identify a node in the same snapshot: ${node.labelledBy}.`,
          node.id
        );
      }
      if (node.role === 'tabpanel' && label.role !== 'tab') {
        return accessibilityFailure('Accessible tabpanel nodes must be labelled by a tab.', node.id);
      }
    }
    if (node.controls !== undefined) {
      if (node.controls === node.id) {
        return accessibilityFailure('Accessible node controls must identify a different node.', node.id);
      }
      const controlled = nodes.get(node.controls);
      if (controlled === undefined) {
        return accessibilityFailure(
          `Accessible node controls must identify a node in the same snapshot: ${node.controls}.`,
          node.id
        );
      }
      if (node.role === 'tab' && controlled.role !== 'tabpanel') {
        return accessibilityFailure('Accessible tab nodes must control a tabpanel.', node.id);
      }
    }
    for (const [field, targetId] of [
      ['activeDescendant', node.activeDescendant],
      ['errorMessage', node.errorMessage],
    ] as const) {
      if (targetId === undefined) continue;
      if (targetId === node.id || !nodes.has(targetId)) {
        return accessibilityFailure(
          `Accessible node ${field} must identify a different node in the same snapshot: ${targetId}.`,
          node.id,
        );
      }
    }
  }
  return undefined;
}

function accessibilityFailure(message: string, target?: string): TerminalDiagnostic {
  return diagnostic(
    'ACCESSIBLE_SNAPSHOT_INVALID',
    message,
    target === undefined ? {} : { target }
  );
}

function isAccessibleSource(value: unknown): value is AccessibleSnapshot['source'] {
  return typeof value === 'string' && (accessibleSources as readonly string[]).includes(value);
}

function isAccessibleRole(value: unknown): value is AccessibleNode['role'] {
  return typeof value === 'string' && (accessibleRoles as readonly string[]).includes(value);
}

function numericValueIssueForNode(node: Record<string, unknown>, id: string): TerminalDiagnostic | undefined {
  const numericValue = node['numericValue'];
  if (numericValue === undefined) return undefined;
  if (!['progressbar', 'meter', 'slider', 'spinbutton'].includes(String(node['role']))) {
    return accessibilityFailure('Accessible numericValue is only valid on progressbar, meter, slider, or spinbutton nodes.', id);
  }
  if (!isNonArrayObject(numericValue)) return accessibilityFailure('Accessible numericValue must be an object.', id);
  const unknownField = findUnsupportedField(numericValue, numericValueFields);
  if (unknownField !== undefined) {
    return accessibilityFailure(`Accessible numericValue field is unsupported: ${unknownField}.`, id);
  }
  for (const field of ['current', 'minimum', 'maximum'] as const) {
    if (numericValue[field] !== undefined && !isFiniteNumber(numericValue[field])) {
      return accessibilityFailure(`Accessible numericValue ${field} must be a finite number.`, id);
    }
  }
  if (numericValue['indeterminate'] !== undefined && typeof numericValue['indeterminate'] !== 'boolean') {
    return accessibilityFailure('Accessible numericValue indeterminate must be a boolean.', id);
  }
  if (numericValue['indeterminate'] === true && node['role'] !== 'progressbar') {
    return accessibilityFailure('Only progressbar nodes may have an indeterminate numericValue.', id);
  }
  const current = numericValue['current'];
  const minimum = numericValue['minimum'];
  const maximum = numericValue['maximum'];
  if (typeof minimum === 'number' && typeof maximum === 'number' && minimum > maximum) {
    return accessibilityFailure('Accessible numericValue minimum must not exceed maximum.', id);
  }
  if (typeof current === 'number' && typeof minimum === 'number' && current < minimum) {
    return accessibilityFailure('Accessible numericValue current must not be below minimum.', id);
  }
  if (typeof current === 'number' && typeof maximum === 'number' && current > maximum) {
    return accessibilityFailure('Accessible numericValue current must not exceed maximum.', id);
  }
  return undefined;
}

const numericValueFields = new Set(['current', 'minimum', 'maximum', 'indeterminate']);

function roleStateIssue(node: Record<string, unknown>, id: string): TerminalDiagnostic | undefined {
  const role = String(node['role']);
  if (node['checked'] !== undefined && !checkedRoles.has(role)) {
    return accessibilityFailure(`Accessible checked state is not valid on ${role} nodes.`, id);
  }
  if (node['checked'] === 'mixed' && !mixedCheckedRoles.has(role)) {
    return accessibilityFailure(`Accessible mixed checked state is not valid on ${role} nodes.`, id);
  }
  if (node['selected'] !== undefined && !selectedRoles.has(role)) {
    return accessibilityFailure(`Accessible selected state is not valid on ${role} nodes.`, id);
  }
  if (node['expanded'] !== undefined && !expandedRoles.has(role)) {
    return accessibilityFailure(`Accessible expanded state is not valid on ${role} nodes.`, id);
  }
  if (node['pressed'] !== undefined && role !== 'button') {
    return accessibilityFailure(`Accessible pressed state is not valid on ${role} nodes.`, id);
  }
  if (node['orientation'] !== undefined && !orientationRoles.has(role)) {
    return accessibilityFailure(`Accessible orientation is not valid on ${role} nodes.`, id);
  }
  if (node['multiSelectable'] !== undefined && !multiSelectableRoles.has(role)) {
    return accessibilityFailure(`Accessible multiSelectable is not valid on ${role} nodes.`, id);
  }
  if (node['required'] !== undefined && !requiredRoles.has(role)) {
    return accessibilityFailure(`Accessible required state is not valid on ${role} nodes.`, id);
  }
  if (node['invalid'] !== undefined && !invalidRoles.has(role)) {
    return accessibilityFailure(`Accessible invalid state is not valid on ${role} nodes.`, id);
  }
  if (
    node['readOnly'] !== undefined
    && isAccessibleRole(role)
    && !accessibleRoleSupportsReadOnly(role)
  ) {
    return accessibilityFailure(`Accessible readOnly state is not valid on ${role} nodes.`, id);
  }
  return undefined;
}

const checkedRoles = new Set(['checkbox', 'switch', 'radio', 'menuitemcheckbox', 'menuitemradio']);
const mixedCheckedRoles = new Set(['checkbox', 'menuitemcheckbox']);
const selectedRoles = new Set(['option', 'tab', 'row', 'gridcell', 'treeitem', 'listitem']);
const expandedRoles = new Set(['button', 'combobox', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'treeitem']);
const orientationRoles = new Set(['separator', 'slider', 'tablist', 'toolbar']);
const multiSelectableRoles = new Set(['grid', 'listbox', 'tree']);
const requiredRoles = new Set([
  'checkbox', 'combobox', 'radiogroup', 'slider', 'spinbutton', 'switch', 'textbox',
]);
const invalidRoles = new Set([
  'checkbox', 'combobox', 'grid', 'listbox', 'radiogroup', 'slider', 'spinbutton', 'switch', 'textbox', 'tree',
]);

function childRoleIssue(node: Record<string, unknown>, id: string): TerminalDiagnostic | undefined {
  const role = String(node['role']);
  const allowed = requiredChildRoles[role];
  if (allowed === undefined) return undefined;
  for (const child of node['children'] as readonly Record<string, unknown>[] | undefined ?? []) {
    if (!allowed.has(String(child['role']))) {
      return accessibilityFailure(
        `Accessible ${role} nodes may contain only ${[...allowed].join(' or ')} children.`,
        id
      );
    }
  }
  return undefined;
}

const requiredChildRoles: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  listbox: new Set(['option', 'group']),
  menu: new Set(['menuitem', 'menuitemcheckbox', 'menuitemradio', 'group', 'separator']),
  menubar: new Set(['menuitem', 'menuitemcheckbox', 'menuitemradio', 'group', 'separator']),
  combobox: new Set(['listbox', 'status']),
  tablist: new Set(['tab']),
  list: new Set(['listitem', 'group']),
  radiogroup: new Set(['radio', 'group']),
  table: new Set(['row', 'rowgroup']),
  grid: new Set(['row', 'rowgroup']),
  rowgroup: new Set(['row']),
  row: new Set(['cell', 'gridcell', 'columnheader', 'rowheader']),
  tree: new Set(['treeitem', 'group'])
});

function optionalStringIssue(
  node: Record<string, unknown>,
  field: 'label' | 'description' | 'controls' | 'labelledBy' | 'activeDescendant' | 'errorMessage',
  id: string
): TerminalDiagnostic | undefined {
  if (node[field] === undefined) return undefined;
  if (typeof node[field] !== 'string') return accessibilityFailure(`Accessible node ${field} must be a string.`, id);
  return sanitizeTerminalText(node[field]).changed
    ? accessibilityFailure(`Accessible node ${field} must not contain terminal control sequences.`, id)
    : undefined;
}

function isAccessibleValue(value: unknown): value is AccessibleValue {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
