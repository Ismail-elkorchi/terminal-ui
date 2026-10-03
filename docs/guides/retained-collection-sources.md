# Retained collection sources

Picker, table, tree, listbox and log data use immutable source receipts. Sources
own normalized descriptors, identity lookup and persistent order. Views are
separate query/expansion/sort projections. Rendering and navigation read accepted
receipts; they do not construct a source, flatten one or complete missing work.

## Reader costs

Editable sources use a path-shared AVL sequence and hashed identity index. It provides item count, ID lookup, rank, selection by rank,
enabled rank/selection and bounded in-order windows. A localized append, replace
or removal visits the changed IDs and logarithmic paths, not every retained item.
Initial construction uses a preparation-owned bulk builder that seals this same
representation, rather than replaying persistent path copies for every item.
Old receipts remain usable. Disabled items retain their visible rank while
keyboard navigation uses the independently aggregated enabled count.

Read-only picker/listbox results, visible tree rows and standalone interaction
orders use compact immutable projections: one ranked reference vector, identity
lookup and enabled-navigation metadata only when needed. They share the owned
reader contract without acquiring persistent update capability. Matched source
references travel through the same stable sort as their match records, so result
construction does not recover every item by rehashing its ID. Empty queries still
share their source order. Reader storage accounting estimates logical retained
metadata, excludes shared payloads, and is not an exact JavaScript heap limit.

Measured collections adapt the same sequence with row-height sums. Their row
windows, accepted measurements and anchors retain weighted behavior. Ordinary
collection sources do not pretend that measured rows are unit-height items.

Public domain readers are deliberately small:

- Picker query results: `count`, `entryAt(rank)` and `window(start, end)`
- Table sources: `count`, `itemAt`, `itemById`, `rank` and `window`
- Listbox sources: the same item reader; listbox views expose `count`, `entryAt`,
  `entryById` and `window`
- Tree sources: `treeSourceNodeById` and bounded `treeSourceChildren`; accepted
  `TreeView.collection` exposes `count`, `itemAt`, `itemById`, `rank` and `window`
- Log histories: `logHistoryEntryAt` and `logHistoryRecordById`

Windows use half-open rank bounds. There are no lazy array proxies or getters
that flatten a retained source. `searchPickerQueryEntries`, `logHistoryEntries`,
`visibleTreeRows` and explicit snapshot constructors are deliberate eager
materialization operations. A genuinely new query can still scan its full
source and build a complete ranked result; persistence is not a sublinear search
index. Tree visibility remains a separate projection from its stable hierarchy.

## Bounded source ownership

Cooperative source builders accept an iterable of arrays, with at most 256
entries per batch. Each batch is validated and owned before normalization first
yields; later batches are snapshots when consumed. Sparse/invalid descriptors
are rejected. Iterator cleanup runs on cancellation. The previous receipt is
never mutated or replaced by partial work.

- `prepareSearchPickerIndex` and `prepareSearchPickerIndexUpdate`: at most 1024
  keyword references per batch
- `prepareListboxCollection` and `prepareListboxCollectionUpdate`: at most 1024
  keyword references per batch; mapper callbacks are indivisible
- `prepareLogHistory` and `prepareAppendLogHistory`: at most 1024 metadata fields
  per batch
- `prepareTableCollection` and `prepareTableCollectionUpdate`: immutable row
  payloads; only membership and change descriptors are adopted
- `prepareTreeSource` and `prepareTreeSourceUpdate`: flat descriptors and immutable
  metadata payloads, with parents preceding appended children

For example, a tree source batch contains
`{ node: { id: 'child', kind: 'leaf', label: 'Child' }, parentId: 'root' }`.
Branches are flat `kind: 'branch'` descriptors. Hierarchical arrays are supported
by the explicitly eager `createTreeSource(nodes)` constructor, which traverses
iteratively rather than recursively adopting an entire hierarchy before a
checkpoint. `updateTreeSource` supports append, descriptor replacement and
subtree removal. Replacement preserves child order; remove children before
changing a populated branch into a leaf or lazy node.

Strings are immutable and may be long: sanitization, segmentation, matching and
wrapping charge work through one shared cooperative budget. Application payloads
(picker values, listbox values, table rows and tree metadata) must be immutable;
the library does not deep-clone them. User callbacks, getters, individual native
string calls and one grapheme operation remain indivisible. This is bounded
cooperative work, not hard preemption.

## Live components and eager helpers

A live listbox requires `collection`, accepted `view` (or `null` while pending),
and the corresponding query. Build or prepare its source outside rendering,
then use `createListboxView` for deliberate synchronous work or
`prepareListboxView` in the application's effect lifetime. Reducers consume that
same accepted view. An empty-query view shares source order without copying all
entries or constructing a second candidate/ID map.

Table and data-grid components require a retained `collection` plus explicit
`columns`. The raw `rows`/`getRowId` overload is removed. For simple scalar/array
rows, `inferTableColumns(rows)` is an explicit eager schema operation; do it once
alongside source construction. `createTableCollection` and
`createListboxCollection` remain deliberate eager constructors. Explicit window
snapshots remain available for externally windowed data.

Picker and tree fields are indexed once on source adoption. Unchanged fields
are shared across source versions. Tree/listbox primary-label highlights are
matched against that same field index even when a secondary field supplies the
winning score. Log contains and ranked matching share raw/folded field indexes
and the original source offsets. Log appends retain a persistent segment
directory and global ID lookup; they do not scan prior IDs or copy the directory.
