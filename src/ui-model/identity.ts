export interface RecursiveIdentityNode<TNode> {
  readonly id: string;
  readonly children: readonly TNode[];
}

export function resolveStableIds<TValue>(
  values: readonly TValue[],
  getId: (value: TValue, index: number) => string,
  context: string
): readonly string[] {
  const ids = values.map((value, index) => getId(value, index));
  const seen = new Set<string>();
  for (const id of ids) {
    if (id.length === 0) throw new TypeError(`${context} item ids must not be empty.`);
    if (seen.has(id)) throw new TypeError(`${context} item ids must be unique; duplicate id: ${id}`);
    seen.add(id);
  }
  return ids;
}

export function assertUniqueRecursiveIds<TNode>(
  nodes: readonly TNode[],
  identity: (node: TNode) => RecursiveIdentityNode<TNode>,
  context: string
): void {
  const seen = new Set<string>();
  const pending = [...nodes].reverse();
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) continue;
    const node = identity(item);
    if (node.id.length === 0) throw new TypeError(`${context} item ids must not be empty.`);
    if (seen.has(node.id)) throw new TypeError(`${context} item ids must be unique; duplicate id: ${node.id}`);
    seen.add(node.id);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child !== undefined) pending.push(child);
    }
  }
}
