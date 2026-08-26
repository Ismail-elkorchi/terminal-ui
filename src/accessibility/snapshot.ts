import { decodeAccessibleSnapshotWithPolicy } from './validate.ts';
import type {
  AccessibleNode,
  AccessibleSnapshot,
  AccessibleSnapshotInput
} from './types.ts';

export function createAccessibleSnapshot(input: AccessibleSnapshotInput): AccessibleSnapshot {
  const result = decodeAccessibleSnapshotWithPolicy(input, true);
  if (result.status === 'success') return result.value;
  throw new TypeError(result.error.message);
}

export function findAccessibleNode(snapshot: AccessibleSnapshot, id: string): AccessibleNode | undefined {
  return findNode(snapshot.root, id);
}

export function collectFocusPath(node: AccessibleNode): readonly string[] {
  const pending: { readonly node: AccessibleNode; readonly path: readonly string[] }[] = [
    { node, path: Object.freeze([node.id]) },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    if (current.node.focused === true) return current.path;
    const children = current.node.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) pending.push({
        node: child,
        path: Object.freeze([...current.path, child.id]),
      });
    }
  }
  return [];
}

export function findNode(node: AccessibleNode, id: string): AccessibleNode | undefined {
  const pending = [node];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    if (current.id === id) return current;
    pending.push(...(current.children ?? []).toReversed());
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
