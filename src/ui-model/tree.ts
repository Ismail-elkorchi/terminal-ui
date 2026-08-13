import type { CollectionInteractionAction, CollectionInteractionState } from '../interaction/collection.ts';
import type { ScrollEvent, ScrollState } from '../interaction/scroll.ts';
import type { ItemBase } from './contracts.ts';
import type {
  CollectionProjection,
  CollectionRecord,
  CompleteCollectionProjection,
  WindowedCollectionProjection,
} from './collection.ts';

interface TreeNodeBase<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> extends ItemBase {
  readonly icon?: string;
  readonly metadata?: TMetadata;
}

/** Immutable application data. Expansion and loading status live in TreePresentation. */
export type TreeNode<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> =
  | TreeNodeBase<TMetadata> & { readonly kind: 'leaf' }
  | TreeNodeBase<TMetadata> & {
      readonly kind: 'branch';
      readonly children: readonly TreeNode<TMetadata>[];
    }
  | TreeNodeBase<TMetadata> & { readonly kind: 'lazy' };

export type TreeLoadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending'; readonly message?: string }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'empty'; readonly message?: string };

export interface TreePresentation extends CollectionInteractionState {
  readonly expandedIds: readonly string[];
  readonly query?: import('./query.ts').CollectionQuery;
  readonly loadStates?: Readonly<Record<string, TreeLoadState>>;
  readonly scroll?: ScrollState;
}

export interface TreeVisibleRow<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  readonly node: TreeNode<TMetadata>;
  readonly depth: number;
  readonly path: readonly string[];
  readonly expanded: boolean;
  readonly loadState?: TreeLoadState;
  readonly lazyPlaceholder?: boolean;
}

export interface TreeCollectionRecord<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> extends CollectionRecord {
  readonly row: TreeVisibleRow<TMetadata>;
}

export type TreeCollection<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> = CollectionProjection<TreeCollectionRecord<TMetadata>>;
export type CompleteTreeCollection<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> = CompleteCollectionProjection<TreeCollectionRecord<TMetadata>>;
export type WindowedTreeCollection<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> = WindowedCollectionProjection<TreeCollectionRecord<TMetadata>>;

export type TreeDisclosureTransition =
  | { readonly kind: 'toggle'; readonly id: string }
  | { readonly kind: 'expand'; readonly id: string }
  | { readonly kind: 'collapse'; readonly id: string }
  | { readonly kind: 'expandAll' }
  | { readonly kind: 'collapseAll' };

export type TreeTransition =
  | CollectionInteractionAction
  | TreeDisclosureTransition
  | { readonly kind: 'setQuery'; readonly query: import('./query.ts').CollectionQuery }
  | { readonly kind: 'scroll'; readonly event: ScrollEvent };

export type TreeControlTransition = Exclude<TreeTransition, { readonly kind: 'scroll' }>;

export interface TreeActivateEvent {
  readonly kind: 'activate';
  readonly id: string;
}

export function treeNodeChildren<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
): readonly TreeNode<TMetadata>[] {
  return node.kind === 'branch' ? node.children : [];
}
