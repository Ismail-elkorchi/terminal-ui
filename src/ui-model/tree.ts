import type { ScrollEvent } from '../interaction/scroll.ts';
import type { ItemBase } from './contracts.ts';

interface TreeNodeBase<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>
> extends ItemBase {
  readonly icon?: string;
  readonly metadata?: TMetadata;
}

export type TreeLazyState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending'; readonly message?: string }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'empty'; readonly message?: string };

export type TreeNode<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>
> =
  | TreeNodeBase<TMetadata> & { readonly kind: 'leaf' }
  | TreeNodeBase<TMetadata> & {
      readonly kind: 'branch';
      readonly expanded: boolean;
      readonly children: readonly TreeNode<TMetadata>[];
    }
  | TreeNodeBase<TMetadata> & {
      readonly kind: 'lazy';
      readonly expanded: boolean;
      readonly loading: TreeLazyState;
    };

export function treeNodeChildren<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>
): readonly TreeNode<TMetadata>[] {
  return node.kind === 'branch' ? node.children : [];
}

export function treeNodeExpanded(node: TreeNode): boolean {
  return node.kind !== 'leaf' && node.expanded;
}

export type TreeDisclosureAction =
  | { readonly kind: 'toggle'; readonly id: string }
  | { readonly kind: 'expand'; readonly id: string }
  | { readonly kind: 'collapse'; readonly id: string };

export type TreeAction<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>
> =
  | TreeDisclosureAction
  | { readonly kind: 'select'; readonly id?: string }
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'activate'; readonly id: string }
  | { readonly kind: 'filter'; readonly query: string }
  | { readonly kind: 'expandAll' }
  | { readonly kind: 'collapseAll' }
  | { readonly kind: 'lazyPending'; readonly id: string; readonly message?: string }
  | { readonly kind: 'lazySuccess'; readonly id: string; readonly children: readonly TreeNode<TMetadata>[] }
  | { readonly kind: 'lazyError'; readonly id: string; readonly message: string }
  | { readonly kind: 'startRename'; readonly id: string; readonly value: string }
  | { readonly kind: 'updateRename'; readonly value: string }
  | { readonly kind: 'commitRename' }
  | { readonly kind: 'cancelRename' }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };
