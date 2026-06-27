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
  const progressIssue = progressIssueForNode(node, id);
  if (progressIssue !== undefined) return progressIssue;
  if (node['children'] !== undefined && !Array.isArray(node['children'])) {
    return accessibilityFailure('Accessible node children must be an array.', id);
  }
  for (const child of node['children'] ?? []) {
    const childIssue = firstNodeIssue(child, ids);
    if (childIssue !== undefined) return childIssue;
  }
  return undefined;
}

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

function progressIssueForNode(node: Record<string, unknown>, id: string): TerminalDiagnostic | undefined {
  const progress = node['progress'];
  if (progress === undefined) return undefined;
  if (node['role'] !== 'progressbar') {
    return accessibilityFailure('Accessible progress state is only valid on progressbar nodes.', id);
  }
  if (!isRecord(progress)) return accessibilityFailure('Accessible progress state must be an object.', id);
  if (progress['value'] !== undefined && typeof progress['value'] !== 'number') {
    return accessibilityFailure('Accessible progress value must be a number.', id);
  }
  if (progress['max'] !== undefined && typeof progress['max'] !== 'number') {
    return accessibilityFailure('Accessible progress max must be a number.', id);
  }
  if (progress['indeterminate'] !== undefined && typeof progress['indeterminate'] !== 'boolean') {
    return accessibilityFailure('Accessible progress indeterminate must be a boolean.', id);
  }
  if (
    typeof progress['value'] === 'number'
    && typeof progress['max'] === 'number'
    && progress['value'] > progress['max']
  ) {
    return accessibilityFailure('Accessible progress value must not exceed max.', id);
  }
  return undefined;
}

function optionalStringIssue(
  node: Record<string, unknown>,
  field: 'label' | 'description',
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

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
