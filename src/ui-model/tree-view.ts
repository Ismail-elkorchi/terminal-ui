import { sanitizeTerminalText } from '../text/index.ts';
import type { PreparedTreeView, TreeCollection } from './tree.ts';

const views = new WeakMap<object, Map<string, PreparedTreeView>>();

export function prepareTreeView<
  TMetadata extends Readonly<Record<string, unknown>>
>(
  collection: TreeCollection<TMetadata>,
  filterQuery?: string
): PreparedTreeView<TMetadata> {
  const query = collection.kind === 'window' && collection.domain.kind === 'projection'
    ? cleanQuery(collection.domain.filterQuery)
    : cleanQuery(filterQuery);
  let byQuery = views.get(collection);
  if (byQuery === undefined) {
    byQuery = new Map();
    views.set(collection, byQuery);
  }
  const cached = byQuery.get(query) as PreparedTreeView<TMetadata> | undefined;
  if (cached !== undefined) return cached;
  const view = Object.freeze({ kind: 'tree-view' as const, collection, query });
  byQuery.set(query, view);
  return view;
}

function cleanQuery(query: string | undefined): string {
  return sanitizeTerminalText(query ?? '').text.trim().toLocaleLowerCase();
}
