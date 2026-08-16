import type { CollectionInteractionAction, CollectionInteractionState } from '../interaction/collection.ts';
import type { ScrollEvent, ScrollState } from '../interaction/scroll.ts';
import type { CollectionInteractionIndex } from '../interaction/collection.ts';
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

declare const preparedTreeSourceBrand: unique symbol;

export interface PreparedTreeSource<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  readonly [preparedTreeSourceBrand]: TMetadata;
  readonly kind: 'prepared-tree-source';
  readonly nodeCount: number;
}

export type TreeLoadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending'; readonly message?: string }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'empty'; readonly message?: string };

interface TreePresentationBase extends CollectionInteractionState {
  readonly expandedIds: readonly string[];
  readonly query?: import('../text/query.ts').CollectionQuery;
  readonly loadStates?: Readonly<Record<string, TreeLoadState>>;
}

export interface UnscrolledTreePresentation extends TreePresentationBase {
  readonly scroll?: never;
}

export interface ScrollableTreePresentation extends TreePresentationBase {
  readonly scroll: ScrollState;
}

export type TreePresentation = UnscrolledTreePresentation | ScrollableTreePresentation;

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

export interface PreparedTreeView<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  readonly kind: 'prepared-tree-view';
  readonly source: PreparedTreeSource<TMetadata>;
  readonly collection: CompleteTreeCollection<TMetadata>;
  readonly interactionIndex: CollectionInteractionIndex;
}

export type TreeDisclosureTransition =
  | { readonly kind: 'toggle'; readonly id: string }
  | { readonly kind: 'expand'; readonly id: string }
  | { readonly kind: 'collapse'; readonly id: string }
  | { readonly kind: 'expandAll' }
  | { readonly kind: 'collapseAll' };

export type TreeTransition =
  | CollectionInteractionAction
  | TreeDisclosureTransition
  | { readonly kind: 'setQuery'; readonly query: import('../text/query.ts').CollectionQuery }
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
