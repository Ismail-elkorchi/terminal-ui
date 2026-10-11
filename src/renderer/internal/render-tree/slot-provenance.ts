import type { RenderNode } from './types.ts';

interface SlotRoot { readonly slot: number }

interface ProvenanceToken { readonly parent?: ProvenanceToken }

// Tokens retain only tokens: never old render nodes, models, or callbacks.
// A clone gets its own identity so independently mapped siblings stay distinct.
// Its parent token supports cached wrappers derived from the actual supplied
// binding, but never a sibling clone merely sharing that binding's ancestor.
const provenance = new WeakMap<object, ProvenanceToken>();

function nodeToken(node: object): ProvenanceToken {
  let token = provenance.get(node);
  if (token === undefined) {
    token = Object.freeze({});
    provenance.set(node, token);
  }
  return token;
}

export function copySlotProvenance(source: object, target: object): void {
  provenance.set(target, Object.freeze({ parent: nodeToken(source) }));
}

export function beginSlotComposition(slotRoots: readonly (readonly RenderNode[])[]) {
  const bindings = new Map<ProvenanceToken, SlotRoot>();
  const resolved = new Map<ProvenanceToken, SlotRoot | undefined>();
  for (const [slot, nodes] of slotRoots.entries()) {
    for (const node of nodes) {
      const token = nodeToken(node);
      if (bindings.has(token)) throw new TypeError('A composed caller slot root must be supplied only once.');
      bindings.set(token, { slot });
    }
  }
  const rootFor = (node: object): SlotRoot | undefined => {
    let token = provenance.get(node);
    if (token === undefined) return undefined;
    if (resolved.has(token)) return resolved.get(token);
    const pending: ProvenanceToken[] = [];
    while (token !== undefined && !resolved.has(token)) {
      pending.push(token);
      token = token.parent;
    }
    let root = token === undefined ? undefined : resolved.get(token);
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) break;
      const binding = bindings.get(current);
      if (binding !== undefined && root !== undefined && binding !== root) {
        throw new TypeError('A composed caller slot root has ambiguous supplied provenance.');
      }
      root = binding ?? root;
      resolved.set(current, root);
    }
    return root;
  };
  return {
    has: (node: object): boolean => rootFor(node) !== undefined,
    paths: (nodes: readonly RenderNode[]): readonly (readonly (readonly number[])[])[] =>
      collectSlotPaths(nodes, rootFor, slotRoots.length),
    close: (): void => { bindings.clear(); resolved.clear(); },
  };
}

// One structural traversal and one resolution per visited provenance token:
// O(nodes + visited provenance tokens + total emitted path length). Token
// ancestry is resolved iteratively and cached only for this composition.
function collectSlotPaths(
  nodes: readonly RenderNode[],
  rootFor: (node: object) => SlotRoot | undefined,
  slotCount: number,
): readonly (readonly (readonly number[])[])[] {
  const paths: (readonly number[])[][] = Array.from({ length: slotCount }, () => []);
  const seen = new Set<SlotRoot>();
  const path: number[] = [];
  const stack = [{ nodes, index: 0 }];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame === undefined) break;
    if (frame.index === frame.nodes.length) {
      stack.pop();
      path.pop();
      continue;
    }
    const index = frame.index++;
    const node = frame.nodes[index];
    if (node === undefined) continue;
    path[stack.length - 1] = index;
    const root = rootFor(node);
    if (root !== undefined) {
      if (seen.has(root)) throw new TypeError('A composed caller slot root must be rendered at most once.');
      seen.add(root);
      paths[root.slot]?.push(Object.freeze(path.slice()));
    }
    const children = node.children;
    if (children !== undefined && children.length > 0) stack.push({ nodes: children, index: 0 });
  }
  return Object.freeze(paths.map((slot) => Object.freeze(slot)));
}
