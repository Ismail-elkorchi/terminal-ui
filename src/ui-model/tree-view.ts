import { sanitizeTerminalText } from '../text/index.ts';
import type { TreeCollection, TreeViewProjection } from './tree.ts';

const projections = new WeakMap<object, Map<string, TreeViewProjection>>();

export function prepareTreeView<
  TMetadata extends Readonly<Record<string, unknown>>
>(
  collection: TreeCollection<TMetadata>,
  filterQuery?: string
): TreeViewProjection<TMetadata> {
  const query = collection.kind === 'window' && collection.domain.kind === 'projection'
    ? cleanQuery(collection.domain.filterQuery)
    : cleanQuery(filterQuery);
  let byQuery = projections.get(collection);
  if (byQuery === undefined) {
    byQuery = new Map();
    projections.set(collection, byQuery);
  }
  const cached = byQuery.get(query) as TreeViewProjection<TMetadata> | undefined;
  if (cached !== undefined) return cached;
  const projection = Object.freeze({ kind: 'tree-view' as const, collection, query });
  byQuery.set(query, projection);
  return projection;
}

function cleanQuery(query: string | undefined): string {
  return sanitizeTerminalText(query ?? '').text.trim().toLocaleLowerCase();
}
