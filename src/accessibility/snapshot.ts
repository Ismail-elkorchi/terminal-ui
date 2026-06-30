import { sanitizeTerminalText } from '../text/index.ts';
import type {
  AccessibleNode,
  AccessibleSnapshot,
  AccessibleValue,
  AccessibleSnapshotInput
} from './types.ts';

export function toAccessibleSnapshot(input: AccessibleSnapshotInput): AccessibleSnapshot {
  const root = sanitizeAccessibleNode(input.root);
  return {
    schemaVersion: 'terminal-ui.accessible-snapshot.v1',
    source: input.source,
    ...(input.title === undefined ? {} : { title: sanitizeAccessibleText(input.title) }),
    root,
    focusPath: input.focusPath ?? collectFocusPath(root),
    diagnostics: input.diagnostics ?? []
  };
}

export function findAccessibleNode(snapshot: AccessibleSnapshot, id: string): AccessibleNode | undefined {
  return findNode(snapshot.root, id);
}

export function collectFocusPath(node: AccessibleNode): readonly string[] {
  if (node.focused === true) return [node.id];
  for (const child of node.children ?? []) {
    const childPath = collectFocusPath(child);
    if (childPath.length > 0) return [node.id, ...childPath];
  }
  return [];
}

export function findNode(node: AccessibleNode, id: string): AccessibleNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const match = findNode(child, id);
    if (match !== undefined) return match;
  }
  return undefined;
}

export function nodePath(root: AccessibleNode, path: readonly string[]): readonly AccessibleNode[] | undefined {
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

function sanitizeAccessibleNode(node: AccessibleNode): AccessibleNode {
  return {
    ...node,
    ...(node.label === undefined ? {} : { label: sanitizeAccessibleText(node.label) }),
    ...(node.description === undefined ? {} : { description: sanitizeAccessibleText(node.description) }),
    ...(node.value === undefined ? {} : { value: sanitizeAccessibleValue(node.value) }),
    ...(node.position === undefined ? {} : { position: sanitizePosition(node.position) }),
    ...(node.children === undefined ? {} : { children: node.children.map(sanitizeAccessibleNode) })
  };
}

function sanitizePosition(position: NonNullable<AccessibleNode['position']>): NonNullable<AccessibleNode['position']> {
  return {
    ...position,
    ...(position.columnLabel === undefined ? {} : { columnLabel: sanitizeAccessibleText(position.columnLabel) }),
    ...(position.group === undefined ? {} : { group: sanitizeAccessibleText(position.group) })
  };
}

function sanitizeAccessibleValue(value: AccessibleValue): AccessibleValue {
  return typeof value === 'string' ? sanitizeAccessibleText(value) : value;
}

function sanitizeAccessibleText(text: string): string {
  return sanitizeTerminalText(text).text;
}
