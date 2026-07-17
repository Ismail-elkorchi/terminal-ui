export interface RecursiveIdentityNode<TNode> {
  readonly id: string;
  readonly children: readonly TNode[];
}

export function resolveStableIds<TValue>(
  values: readonly TValue[],
  getId: (value: TValue, index: number) => string,
  owner: string
): readonly string[] {
  const ids = values.map((value, index) => getId(value, index));
  const seen = new Set<string>();
  for (const id of ids) {
    if (id.length === 0) throw new TypeError(`${owner} item ids must not be empty.`);
    if (seen.has(id)) throw new TypeError(`${owner} item ids must be unique; duplicate id: ${id}`);
    seen.add(id);
  }
  return ids;
}

export function assertUniqueRecursiveIds<TNode>(
  nodes: readonly TNode[],
  identity: (node: TNode) => RecursiveIdentityNode<TNode>,
  owner: string
): void {
  const seen = new Set<string>();
  const visit = (items: readonly TNode[]): void => {
    for (const item of items) {
      const node = identity(item);
      if (node.id.length === 0) throw new TypeError(`${owner} item ids must not be empty.`);
      if (seen.has(node.id)) throw new TypeError(`${owner} item ids must be unique; duplicate id: ${node.id}`);
      seen.add(node.id);
      visit(node.children);
    }
  };
  visit(nodes);
}
