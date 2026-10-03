import { createTuiCooperativeWorkContext } from '@ismail-elkorchi/terminal-ui/tui';
import { createTuiControls, createTuiPreparedQuery, liftTuiResult, tree } from '@ismail-elkorchi/terminal-ui';
import type { TuiChildDefinition, TuiPreparedQueryMessage, TuiPreparedQueryState, ScrollableTreeState, TreeSource, TreeView, TreeTransition } from '@ismail-elkorchi/terminal-ui';
import { createScrollState, matchingTreeView, prepareTreeView, treeReducer } from '@ismail-elkorchi/terminal-ui/behavior';

export interface ExplorerState<T extends Readonly<Record<string, unknown>>> {
  readonly source: TreeSource<T>;
  readonly tree: ScrollableTreeState;
  readonly projection: TuiPreparedQueryState<TreeView<T>>;
}
export type ExplorerMessage<T extends Readonly<Record<string, unknown>>> =
  | { readonly kind: 'control'; readonly control: 'tree'; readonly transition: TreeTransition }
  | { readonly kind: 'projection'; readonly message: TuiPreparedQueryMessage<TreeView<T>> }
  | { readonly kind: 'replace'; readonly source: TreeSource<T>; readonly tree: ScrollableTreeState }
  | { readonly kind: 'activate'; readonly id: string };

/** An ordinary reusable child; opening a resource belongs to its parent. */
export function explorerDefinition<T extends Readonly<Record<string, unknown>>>(source: TreeSource<T>): TuiChildDefinition<ExplorerState<T>, ExplorerMessage<T>, string> {
  const controls = createTuiControls<ExplorerState<T>>()({
    tree: (value, transition: TreeTransition, state) => treeReducer(value, transition, { source: state.source, view: state.projection.result }),
  });
  const query = createTuiPreparedQuery({
    id: 'projection',
    prepare: ({ source, tree }: { readonly source: TreeSource<T>; readonly tree: ScrollableTreeState }, context) =>
      prepareTreeView(source, tree, createTuiCooperativeWorkContext(context)),
    toMessage: (message): ExplorerMessage<T> => ({ kind: 'projection', message }),
  });
  const request = (state: ExplorerState<T>) => liftTuiResult(state, 'projection', query.request(state.projection, state));
  return {
    init: () => request({ source, tree: { expandedIds: [], selection: { mode: 'single', selectionFollowsActive: true }, scroll: createScrollState() }, projection: query.init() }),
    update(state, message) {
      switch (message.kind) {
        case 'projection': return liftTuiResult(state, 'projection', query.update(state.projection, message.message));
        case 'replace': return request({ ...state, source: message.source, tree: message.tree });
        case 'activate': return { state, outputs: [message.id] };
        case 'control': {
          const updated = controls.update(state, message);
          return updated.state !== state && matchingTreeView(state.source, updated.state.tree, state.projection.result) === undefined
            ? request(updated.state) : updated;
        }
      }
    },
    view: state => tree({
      id: 'tree', meta: { accessibleName: 'File explorer' }, source: state.source,
      view: state.projection.result, busy: state.projection.pending, ...controls.bind('tree', state),
      emptyText: 'Use /folder <path>', onActivate: event => ({ kind: 'activate' as const, id: event.id }),
    }),
  };
}
