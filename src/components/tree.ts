import type { ScrollEvent } from '../behavior/scroll.ts';
import type { TreeItemBase } from './contracts.ts';

export interface TreeNode<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>
> extends TreeItemBase<TreeNode<TMetadata>> {
  readonly lazy?: boolean;
  readonly lazyStatus?: 'pending' | 'error' | 'empty';
  readonly lazyMessage?: string;
  readonly icon?: string;
  readonly metadata?: TMetadata;
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
