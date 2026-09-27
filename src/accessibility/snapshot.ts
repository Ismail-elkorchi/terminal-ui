import type { AccessibleNode, AccessibleSnapshot, AccessibleSnapshotInput } from './types.ts';
import { decodeAccessibleSnapshotWithPolicy } from './validate.ts';
export { nodePath } from './traversal.ts';

export function createAccessibleSnapshot(input: AccessibleSnapshotInput): AccessibleSnapshot {
  const result = decodeAccessibleSnapshotWithPolicy(input, true);
  if (result.status === 'success') return result.value;
  throw new TypeError(result.error.message);
}

export function findAccessibleNode(snapshot: AccessibleSnapshot, id: string): AccessibleNode | undefined {
  return findNode(snapshot.root, id);
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
