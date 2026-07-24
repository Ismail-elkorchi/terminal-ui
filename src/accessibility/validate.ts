import { diagnostic, terminalDiagnosticIssue } from '../diagnostics.ts';
import { err, ok } from '../result.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import { collectFocusPath, nodePath } from './snapshot.ts';
import { accessibleRoles, accessibleSources } from './types.ts';
import type { Result } from '../result.ts';
import type { TerminalDiagnostic } from '../diagnostics.ts';
import type { AccessibleNode, AccessibleSnapshot } from './types.ts';

export function validateAccessibleSnapshot(snapshot: unknown): Result<AccessibleSnapshot> {
  const failure = firstSnapshotIssue(snapshot);
  if (failure !== undefined) return err(failure);
  return isAccessibleSnapshot(snapshot)
    ? ok(snapshot)
    : err(accessibilityFailure('Accessible snapshot failed type narrowing after validation.'));
}

function firstSnapshotIssue(snapshot: unknown): TerminalDiagnostic | undefined {
  if (!isRecord(snapshot)) return accessibilityFailure('Accessible snapshot must be an object.');
  if (snapshot['schemaVersion'] !== 'terminal-ui.accessible-snapshot.v1') {
    return accessibilityFailure('Unsupported accessible snapshot schema version.');
  }
  if (!isAccessibleSource(snapshot['source'])) {
    return accessibilityFailure(`Unsupported accessible snapshot source: ${String(snapshot['source'])}.`);
  }
  if (snapshot['title'] !== undefined && typeof snapshot['title'] !== 'string') {
    return accessibilityFailure('Accessible snapshot title must be a string.');
  }
  if (!Array.isArray(snapshot['focusPath']) || !snapshot['focusPath'].every((item) => typeof item === 'string')) {
    return accessibilityFailure('Accessible snapshot focusPath must be a string array.');
  }
  if (!Array.isArray(snapshot['diagnostics'])) {
    return accessibilityFailure('Accessible snapshot diagnostics must be an array.');
  }
  for (const [index, item] of snapshot['diagnostics'].entries()) {
    const issue = terminalDiagnosticIssue(item);
    if (issue !== undefined) return accessibilityFailure(`Invalid accessible snapshot diagnostic at index ${String(index)}: ${issue}`);
  }
  const nodeIssue = firstNodeIssue(snapshot['root'], new Set());
  if (nodeIssue !== undefined) return nodeIssue;
  if (!isAccessibleNode(snapshot['root'])) {
    return accessibilityFailure('Accessible snapshot root failed type narrowing after validation.');
  }
  const focusIssue = firstFocusIssue({
    root: snapshot['root'],
    focusPath: snapshot['focusPath']
  });
  if (focusIssue !== undefined) return focusIssue;
  const labelRelationshipIssue = firstLabelRelationshipIssue(snapshot['root']);
  if (labelRelationshipIssue !== undefined) return labelRelationshipIssue;
  return undefined;
}

function isAccessibleSnapshot(value: unknown): value is AccessibleSnapshot {
  return firstSnapshotIssue(value) === undefined;
}

function isAccessibleNode(value: unknown): value is AccessibleNode {
  return firstNodeIssue(value, new Set()) === undefined;
}

function firstNodeIssue(node: unknown, ids: Set<string>): TerminalDiagnostic | undefined {
  if (!isRecord(node)) return accessibilityFailure('Accessible node must be an object.');
  const unknownField = firstUnknownField(node, accessibleNodeFields);
  if (unknownField !== undefined) {
    return accessibilityFailure(`Accessible node field is unsupported: ${unknownField}.`);
  }
  if (!isNonEmptyString(node['id'])) return accessibilityFailure('Accessible node id must not be empty.');
  const id = node['id'];
  if (ids.has(id)) return accessibilityFailure(`Accessible node id must be unique: ${id}.`);
  ids.add(id);
  if (!isAccessibleRole(node['role'])) {
    return accessibilityFailure(`Unsupported accessible node role: ${String(node['role'])}.`, id);
  }
  const labelIssue = optionalStringIssue(node, 'label', id);
  if (labelIssue !== undefined) return labelIssue;
  const descriptionIssue = optionalStringIssue(node, 'description', id);
  if (descriptionIssue !== undefined) return descriptionIssue;
  const controlsIssue = optionalStringIssue(node, 'controls', id);
  if (controlsIssue !== undefined) return controlsIssue;
  if (node['controls'] === '') return accessibilityFailure('Accessible node controls must not be empty.', id);
  const labelledByIssue = optionalStringIssue(node, 'labelledBy', id);
  if (labelledByIssue !== undefined) return labelledByIssue;
  if (node['labelledBy'] === '') return accessibilityFailure('Accessible node labelledBy must not be empty.', id);
  if (node['value'] !== undefined && !isAccessibleValue(node['value'])) {
    return accessibilityFailure('Accessible node value must be string, number, boolean, or null.', id);
  }
  if (typeof node['value'] === 'string' && sanitizeTerminalText(node['value']).changed) {
    return accessibilityFailure('Accessible node value must not contain terminal control sequences.', id);
  }
  for (const field of ['focused', 'selected', 'disabled', 'expanded'] as const) {
    if (node[field] !== undefined && typeof node[field] !== 'boolean') {
      return accessibilityFailure(`Accessible node ${field} must be a boolean.`, id);
    }
  }
  if (node['checked'] !== undefined && typeof node['checked'] !== 'boolean' && node['checked'] !== 'mixed') {
    return accessibilityFailure('Accessible node checked must be a boolean or "mixed".', id);
  }
  const stateRoleIssue = roleStateIssue(node, id);
  if (stateRoleIssue !== undefined) return stateRoleIssue;
  const numericValueIssue = numericValueIssueForNode(node, id);
  if (numericValueIssue !== undefined) return numericValueIssue;
  const liveIssue = liveIssueForNode(node, id);
  if (liveIssue !== undefined) return liveIssue;
  const scopeIssue = scopeIssueForNode(node, id);
  if (scopeIssue !== undefined) return scopeIssue;
  const windowIssue = windowIssueForNode(node, id);
  if (windowIssue !== undefined) return windowIssue;
  const positionIssue = positionIssueForNode(node, id);
  if (positionIssue !== undefined) return positionIssue;
  if (node['children'] !== undefined && !Array.isArray(node['children'])) {
    return accessibilityFailure('Accessible node children must be an array.', id);
  }
  for (const child of node['children'] ?? []) {
    const childIssue = firstNodeIssue(child, ids);
    if (childIssue !== undefined) return childIssue;
  }
  const relationshipIssue = childRoleIssue(node, id);
  if (relationshipIssue !== undefined) return relationshipIssue;
  return undefined;
}

const accessibleNodeFields = new Set([
  'id',
  'role',
  'label',
  'value',
  'focused',
  'selected',
  'disabled',
  'expanded',
  'checked',
  'numericValue',
  'live',
  'scope',
  'window',
  'position',
  'description',
  'controls',
  'labelledBy',
  'children'
]);

function liveIssueForNode(node: Record<string, unknown>, id: string): TerminalDiagnostic | undefined {
  return node['live'] === undefined || (typeof node['live'] === 'string' && ['off', 'polite', 'assertive'].includes(node['live']))
    ? undefined
    : accessibilityFailure('Accessible node live region must be "off", "polite", or "assertive".', id);
}

function scopeIssueForNode(node: Record<string, unknown>, id: string): TerminalDiagnostic | undefined {
  const scope = node['scope'];
  if (scope === undefined) return undefined;
  if (!isRecord(scope)) return accessibilityFailure('Accessible node scope must be an object.', id);
  const unknownField = firstUnknownField(scope, scopeFields);
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
  if (!isRecord(window)) return accessibilityFailure('Accessible node window must be an object.', id);
  const unknownField = firstUnknownField(window, windowFields);
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
  if (!isRecord(position)) return accessibilityFailure('Accessible node position must be an object.', id);
  const unknownField = firstUnknownField(position, positionFields);
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
  snapshot: Pick<AccessibleSnapshot, 'root' | 'focusPath'>
): TerminalDiagnostic | undefined {
  const actualFocusPath = collectFocusPath(snapshot.root);
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

function firstLabelRelationshipIssue(root: AccessibleNode): TerminalDiagnostic | undefined {
  const nodes = new Map<string, AccessibleNode>();
  collectAccessibleNodes(root, nodes);
  for (const node of nodes.values()) {
    if (node.labelledBy === undefined) continue;
    if (node.labelledBy === node.id) {
      return accessibilityFailure('Accessible node labelledBy must identify a different node.', node.id);
    }
    if (!nodes.has(node.labelledBy)) {
      return accessibilityFailure(
        `Accessible node labelledBy must identify a node in the same snapshot: ${node.labelledBy}.`,
        node.id
      );
    }
  }
  return undefined;
}

function collectAccessibleNodes(node: AccessibleNode, nodes: Map<string, AccessibleNode>): void {
  nodes.set(node.id, node);
  for (const child of node.children ?? []) collectAccessibleNodes(child, nodes);
}

function accessibilityFailure(message: string, target?: string): TerminalDiagnostic {
  return diagnostic(
    'ACCESSIBLE_SNAPSHOT_INVALID',
    message,
    target === undefined ? {} : { target }
  );
}

function isAccessibleSource(value: unknown): boolean {
  return typeof value === 'string' && (accessibleSources as readonly string[]).includes(value);
}

function isAccessibleRole(value: unknown): boolean {
  return typeof value === 'string' && (accessibleRoles as readonly string[]).includes(value);
}

function numericValueIssueForNode(node: Record<string, unknown>, id: string): TerminalDiagnostic | undefined {
  const numericValue = node['numericValue'];
  if (numericValue === undefined) return undefined;
  if (!['progressbar', 'meter', 'slider', 'spinbutton'].includes(String(node['role']))) {
    return accessibilityFailure('Accessible numericValue is only valid on progressbar, meter, slider, or spinbutton nodes.', id);
  }
  if (!isRecord(numericValue)) return accessibilityFailure('Accessible numericValue must be an object.', id);
  const unknownField = firstUnknownField(numericValue, numericValueFields);
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
  return undefined;
}

const checkedRoles = new Set(['checkbox', 'switch', 'radio', 'menuitemcheckbox', 'menuitemradio']);
const mixedCheckedRoles = new Set(['checkbox', 'menuitemcheckbox']);
const selectedRoles = new Set(['option', 'tab', 'row', 'gridcell', 'treeitem']);
const expandedRoles = new Set(['button', 'combobox', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'treeitem']);

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
  menu: new Set(['menuitem', 'menuitemcheckbox', 'menuitemradio', 'group']),
  menubar: new Set(['menuitem', 'menuitemcheckbox', 'menuitemradio', 'group']),
  combobox: new Set(['listbox', 'status']),
  tablist: new Set(['tab']),
  radiogroup: new Set(['radio', 'group']),
  table: new Set(['row', 'rowgroup']),
  grid: new Set(['row', 'rowgroup']),
  rowgroup: new Set(['row']),
  row: new Set(['cell', 'gridcell', 'columnheader', 'rowheader']),
  tree: new Set(['treeitem', 'group'])
});

function optionalStringIssue(
  node: Record<string, unknown>,
  field: 'label' | 'description' | 'controls' | 'labelledBy',
  id: string
): TerminalDiagnostic | undefined {
  if (node[field] === undefined) return undefined;
  if (typeof node[field] !== 'string') return accessibilityFailure(`Accessible node ${field} must be a string.`, id);
  return sanitizeTerminalText(node[field]).changed
    ? accessibilityFailure(`Accessible node ${field} must not contain terminal control sequences.`, id)
    : undefined;
}

function isAccessibleValue(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function firstUnknownField(
  value: Record<string, unknown>,
  allowedFields: ReadonlySet<string>
): string | undefined {
  return Object.keys(value).find((field) => !allowedFields.has(field));
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
