import type { CollectionInteractionTransition, CollectionInteractionState } from '../interaction/collection-interaction.ts';
import type { ScrollRequest, ScrollState } from '../interaction/scroll.ts';
import type { CollectionInteractionIndex } from '../interaction/collection-interaction.ts';
import type { LabeledItem } from '../collection/item.ts';
import type {
  CollectionSnapshot,
  CollectionItem,
  CompleteCollectionSnapshot,
  WindowedCollectionSnapshot,
} from '../collection/snapshot.ts';

interface TreeNodeBase<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> extends LabeledItem {
  readonly icon?: string;
  readonly metadata?: TMetadata;
}

/** Immutable application data. Expansion and loading status live in TreeState. */
export type TreeNode<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> =
  | TreeNodeBase<TMetadata> & { readonly kind: 'leaf' }
  | TreeNodeBase<TMetadata> & {
      readonly kind: 'branch';
      readonly children: readonly TreeNode<TMetadata>[];
    }
  | TreeNodeBase<TMetadata> & { readonly kind: 'lazy' };

declare const treeSourceBrand: unique symbol;

export interface TreeSource<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  readonly [treeSourceBrand]: TMetadata;
  readonly kind: 'tree-source';
  readonly nodeCount: number;
}

export type TreeLoadStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending'; readonly message?: string }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'empty'; readonly message?: string };

interface TreeStateBase extends CollectionInteractionState {
  readonly expandedIds: readonly string[];
  readonly query?: import('../text/query.ts').CollectionQuery;
  readonly loadStatusById?: Readonly<Record<string, TreeLoadStatus>>;
}

export interface UnscrolledTreeState extends TreeStateBase {
  readonly scroll?: never;
}

export interface ScrollableTreeState extends TreeStateBase {
  readonly scroll: ScrollState;
}

export type TreeState = UnscrolledTreeState | ScrollableTreeState;

export interface TreeVisibleRow<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  readonly node: TreeNode<TMetadata>;
  readonly depth: number;
  readonly path: readonly string[];
  readonly expanded: boolean;
  readonly loadStatus?: TreeLoadStatus;
  readonly lazyPlaceholder?: boolean;
}

export interface TreeCollectionRow<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> extends CollectionItem {
  readonly row: TreeVisibleRow<TMetadata>;
}

export type TreeCollection<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> = CollectionSnapshot<TreeCollectionRow<TMetadata>>;
export type CompleteTreeCollection<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> = CompleteCollectionSnapshot<TreeCollectionRow<TMetadata>>;
export type WindowedTreeCollection<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> = WindowedCollectionSnapshot<TreeCollectionRow<TMetadata>>;

export interface TreeView<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  readonly kind: 'tree-view';
  readonly source: TreeSource<TMetadata>;
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
  | CollectionInteractionTransition
  | TreeDisclosureTransition
  | { readonly kind: 'setQuery'; readonly query: import('../text/query.ts').CollectionQuery }
  | { readonly kind: 'scroll'; readonly request: ScrollRequest };

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
