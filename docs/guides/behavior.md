# Behavior Helpers

Behavior helpers are pure functions for controlled components. They update
caller-controlled state; they do not render, subscribe to terminal input, mutate
hosts, start timers, or own application state.

Use behavior helpers when component interaction has reusable rules:

- scroll offsets and follow-tail state;
- table row, cell, sort, and resize behavior;
- tree expansion, filtering, selection, and lazy state;
- search-picker query, active-item navigation, preview, and grouping;
- command-input editing, history, and suggestion navigation;
- notification history, expiry, pause, resume, and dismissal;
- menu hierarchy, menu-trigger state, and tab navigation;
- checkbox-group, radio-group, combobox, and color-swatch-picker navigation;
- log-viewer search, folds, follow-tail, and scroll behavior;
- chart and heatmap active-datum navigation and committed selection;
- pointer interaction, focus, and visual-state reducers;
- split-pane divider selection, constrained resizing, and pointer drag anchors.

The pattern is:

1. Store the state in your application model.
2. Render components from that state.
3. Convert component event props to typed messages.
4. In `update()`, pass the message through the matching behavior helper.

## State, views, and layout

Reducer state is application data stored by the caller. Component inputs stay
as direct fields when a few values are independent. Declared framework
capabilities such as `disabled`, `busy`, `readOnly`, and `inert` are independent
top-level fields. Domain models may group values when several fields describe
one valid combination. A component's immediate controlled interaction data is
named `state`. When a behavior model also owns history, indexes, or other data
that the component does not render, a helper derives a smaller immutable
`view`. Computed rows, wrapping, carets, and rectangles are `layout`.
`readOnly` is an editable-value contract, not a generic way to suppress commands.
It remains available on text/document inputs and editable popup inputs, where
navigation, caret movement, selection, scrolling, and dismissal still work but
editing, value commitment, submission, and acceptance do not. Menus, tabs,
collections, trees, data grids, and visualizations instead expose their real
availability and interaction contracts; they do not pretend command suppression
is read-only data.

Retained resources use domain operations: `create...` for owned collections and
indexes, `compile...` for reusable queries, and `index...` for searchable
candidates. Staged work is named for the artifact it produces—for example, a
subscription `plan` that is activated only after a state commit.

Text input, text area, listbox, list view, data grid, tree, tabs, and
visualizations accept `state`. Command input and search picker accept a `view`
derived from their richer behavior state. A range slider accepts one grouped
state because its active handle and ordered endpoints form one valid
interaction value.

A single-line text input uses the same `TextEditBuffer` in the component and
reducer. Cursor and selection offsets are UTF-16 code-unit offsets aligned to
grapheme boundaries. `textInputReducer` retains literal tabs in source state,
including pasted tabs, so `textInput` can expand them at the active terminal
width profile and map display positions back to source offsets. Unsafe controls
are removed and inserted newlines become spaces. The general `editTextBuffer`
helper and popup-input reducers keep their canonical single-line text policy:

```ts
import { textInput } from '@ismail-elkorchi/terminal-ui/components';
import { textInputReducer } from '@ismail-elkorchi/terminal-ui/behavior';
import type { TextEditBuffer } from '@ismail-elkorchi/terminal-ui/text';

const state: TextEditBuffer = { text: '', cursor: 0 };
const element = textInput({
  id: 'name', meta: { accessibleName: 'Name' }, state,
  onTransition: (transition) => transition
});
const next = textInputReducer(state, { kind: 'edit', operation: { kind: 'insert', text: 'A' } });
void element;
void next;
```

```ts
import {
  commandInput
} from '@ismail-elkorchi/terminal-ui/components';
import {
  commandInputView,
  commandInputReducer,
  type CommandInputState
} from '@ismail-elkorchi/terminal-ui/behavior';
import type { CommandInputTransition } from '@ismail-elkorchi/terminal-ui/components';

type Message = { kind: 'command'; transition: CommandInputTransition };

interface State {
  readonly command: CommandInputState;
}

function update(state: State, message: Message): State {
  return { ...state, command: commandInputReducer(state.command, message.transition) };
}

function view(state: State) {
  return commandInput({
    id: 'command',
    view: commandInputView(state.command),
    onTransition: (transition): Message => ({ kind: 'command', transition })
  });
}
```

Collection-dependent reducers receive their current data as reducer options;
the routed action remains a compact user intent. A controlled search picker follows
the same pattern. This small-data example deliberately prepares synchronously
in initialization and update, then retains the result for rendering. Large live
queries should use [cooperative preparation](./tui.md#prepared-queries) instead:

```ts
import {
  searchPicker,
  type SearchPickerControlTransition,
  type SearchEntry
} from '@ismail-elkorchi/terminal-ui/components';
import {
  createSearchPickerState,
  searchPickerView,
  searchPickerReducer,
  createSearchPickerIndex,
  querySearchPickerIndex,
  type SearchPickerQueryResult,
  type UnscrolledSearchPickerState
} from '@ismail-elkorchi/terminal-ui/behavior';

const entries = [
  { id: 'open', label: 'Open', value: 'open' }
] satisfies readonly SearchEntry<string>[];
const searchPickerIndex = createSearchPickerIndex(entries);

type SearchPickerMessage = { kind: 'searchPicker'; transition: SearchPickerControlTransition };
interface PickerModel {
  readonly state: UnscrolledSearchPickerState;
  readonly queryResult: SearchPickerQueryResult<string>;
}
const initialResult = querySearchPickerIndex(searchPickerIndex, { text: '', mode: 'fuzzy' });
const initialPickerModel: PickerModel = {
  state: createSearchPickerState(
    { query: { text: '', mode: 'fuzzy' }, queryResult: initialResult },
    searchPickerIndex
  ),
  queryResult: initialResult
};

function updateSearchPicker(
  model: PickerModel,
  transition: SearchPickerControlTransition
): PickerModel {
  let state = searchPickerReducer(model.state, transition, {
    searchPickerIndex, queryResult: model.queryResult
  });
  const queryResult = querySearchPickerIndex(searchPickerIndex, {
    text: state.editor.input.text, mode: state.mode, caseSensitive: state.caseSensitive
  });
  // Choose an initial active item after the changed query has been prepared.
  if (state.editor.activeId === undefined) {
    state = searchPickerReducer(state, { kind: 'firstActive' }, { searchPickerIndex, queryResult });
  }
  return { state, queryResult };
}

function renderSearchPicker(model: PickerModel) {
  return searchPicker<string, SearchPickerMessage>({
    id: 'commands',
    searchPickerIndex,
    queryResult: model.queryResult,
    view: searchPickerView(model.state),
    onTransition: (transition: SearchPickerControlTransition): SearchPickerMessage => ({
      kind: 'searchPicker',
      transition
    })
  });
}
```

Query editing and active-item navigation produce `SearchPickerControlTransition`
messages. Acceptance is a separate application event,
and closing a surrounding dialog remains an
application decision because it changes application state outside the picker.

Comboboxes make the same event/state distinction. Route navigation through
`comboboxReducer()`, then handle `onCommit` with `commitCombobox()` to select the
accepted stable ID and close the popup while performing any application value
update alongside it. Create the enabled-option index once with
`createCollectionInteractionIndex()` and retain that index with the option
collection; both behavior operations consume the retained index. Configure the reducer `pageSize` and component
`maxVisibleOptions` from the same application constant.

Hierarchical data uses the same controlled shape without moving application
effects into the component. This example also prepares synchronously for a small,
fixed hierarchy; [large tree preparation](./tree-query-preparation.md) belongs in
cancellable application work:

```ts
import {
  tree,
  type TreeControlTransition,
  type TreeNode,
  type TreeView,
  type UnscrolledTreeState
} from '@ismail-elkorchi/terminal-ui/components';
import {
  treeReducer,
  createTreeSource,
  createTreeView
} from '@ismail-elkorchi/terminal-ui/behavior';

const nodes: readonly TreeNode[] = [
  { id: 'readme', label: 'README.md', kind: 'leaf' }
];
const treeSource = createTreeSource(nodes);
type Message = { kind: 'tree'; transition: TreeControlTransition };
interface TreeModel {
  readonly state: UnscrolledTreeState;
  readonly view: TreeView;
}
const initialTreeState: UnscrolledTreeState = { expandedIds: [], selection: { mode: 'none' } };
const initialTreeModel: TreeModel = {
  state: initialTreeState,
  view: createTreeView(treeSource, initialTreeState)
};

function updateTree(model: TreeModel, message: Message): TreeModel {
  const state = treeReducer(model.state, message.transition, {
    source: treeSource, view: model.view
  });
  return { state, view: createTreeView(treeSource, state) };
}

function treeView(model: TreeModel) {
  return tree({
    id: 'navigation',
    source: treeSource,
    state: model.state,
    view: model.view,
    onTransition: (transition: TreeControlTransition): Message => ({ kind: 'tree', transition })
  });
}
```

Loading children, opening a selected resource, and persistence remain
application effects. The reducer owns only deterministic hierarchy state.
The component and reducer require an explicit prepared view or `null` while
pending. Missing views are rejected; stale projections remain pending and never
trigger a synchronous fallback. Keep desired input and accepted results in the
application model, then publish each current completion through its existing
update lifecycle.

Behavior helpers may return the same state object for no-op transitions. That
lets applications avoid unnecessary rerenders while keeping update logic
explicit.

`numberInputReducer()` keeps numeric text lexical while the user edits it. A
successful `commit` records the parsed finite number without rewriting a valid
lexeme, so forms may preserve input such as `1.20E+03`. Numeric transitions
(`step`, `revert`, and initial state creation) format from the numeric value
using the configured notation and decimal separator. Scientific notation is a
number-input grammar, not a decimal-precision model; applications that require
lossless decimal scale must own that domain value separately.

## Large Collections

`listbox()` and `dataGrid()` accept ordinary arrays for small, local data. Trees
use a retained `TreeSource` because hierarchy, disclosure, and query
views share one structural index.
For large or remotely windowed data, create an immutable collection outside
`view()` and retain it until its source data changes:

```ts
import { createTableCollection } from '@ismail-elkorchi/terminal-ui/behavior';
import { table } from '@ismail-elkorchi/terminal-ui/components';

const visibleRows = [{ id: 'row-40000', value: 42 }];
const collection = createTableCollection(
  visibleRows,
  (row) => row.id,
  { startIndex: 40_000, totalCount: 100_000, scope: { kind: 'source' } }
);

table({
  id: 'results',
  collection,
  columns: [{ id: 'value', value: (row) => row.value }]
});
```

`createListboxCollection()`, `createTableCollection()`, and
`createTreeCollection()` create complete snapshots. The list and table
helpers accept `startIndex` and `totalCount` to create a windowed snapshot
whose records retain zero-based global `itemIndex` values. `totalCount` may be
zero. Every window declares whether those indexes
belong to the source or to an externally derived view. Filtered windows carry
the query that produced them.
`createTreeCollectionFromRows()` accepts already flattened tree rows and the same
window descriptor. Windowed list and tree data cannot be filtered locally
because the library cannot derive complete results from a partial window.

Collection snapshots own membership and identity. Replace the snapshot
when rows are inserted, deleted, reordered, or filtered. Reducers and
renderers reuse identity and index work while the same snapshot object
is retained; they do not retain mutable application arrays implicitly.

Variable-height sequential content uses `createMeasuredCollection()` instead
of a transient array scan. The retained collection owns stable IDs, row
counts, ordering, and its prefix index while retaining each application value
as an opaque reference. `appendMeasuredItems()`, `prependMeasuredItems()`,
`replaceMeasuredItem()`, and `removeMeasuredItems()` return persistent versions;
`measuredWindow()` performs an indexed visible-row query. Use
`measuredAnchorAt()` before changing row counts when an item should remain at a
stable viewport row. Active-item reveal is an explicit query option and takes
precedence over anchoring.

Initial construction is `O(n)`. Appending or prepending `m` items is expected
`O(m + log n)`, replacing one item is `O(log n)`, and removing `k` IDs is
expected `O(k log n)`. ID lookup is expected `O(1)`, total rows are `O(1)`, and
a window query is `O(log n + v)` for `v` intersecting items. Persistent versions
share unchanged index structure rather than copying the complete collection.

## Index And Range Conventions

Public collection positions are zero-based indexes. `itemIndex`, table
`rowIndex` and `columnIndex`, chart `pointIndex`, and heatmap `rowIndex` and
`columnIndex` refer to positions in caller-supplied data, not terminal
coordinates. Collection and pagination ranges use `startIndex` with an
exclusive `endIndexExclusive`; `totalCount` may be zero. Pagination
`pageNumber` is one-based, while `pageCount` is always at least one, including
for an empty collection.

Text selections and highlights use zero-based UTF-16 code-unit
`startOffset` values and exclusive `endOffsetExclusive` values. Indexed
search matches use zero-based grapheme indexes with an exclusive
`endGraphemeIndexExclusive`.

Terminal rectangles, frame cells, and routed pointer events use one-based
terminal `row` and `column` coordinates. Drawing operations explicitly
documented as local accept zero-based terminal-cell coordinates and convert
them before writing.

Append-heavy documents use the same retained-resource rule through a
dedicated contract. Build a `LogHistory` once with
`createLogHistory()`, store it in application state, and append log entries
with `appendLogHistory()`. The append helper preserves existing history
segments. Prepare and retain a `LogViewerView` with `prepareLogViewerView()` for
its history, query and folds, and for its width/profile when wrapping. Pass that
accepted view to the component and reducer, or `null` while pending. Deliberately
synchronous snapshots and small fixed inputs can use `createLogViewerView()`.

Scrollable controls use exact option variants. A passive `table()` has no
managed navigation, while `dataGrid()` has an explicit row or cell interaction
mode. Unscrolled transition callbacks cannot receive scroll transitions;
scrollable variants require caller-owned `ScrollState`. This prevents controls
from receiving transitions their state cannot represent.

Resizable panes use normalized shares so terminal resizing does not make the
application persist stale cell coordinates. `createSplitPaneState()` owns the
initial shares, `splitPaneReducer()` applies keyboard and captured-pointer
actions with optional per-pane share constraints, and
`splitPaneLayout()` produces the percentage tracks consumed by
`splitPane()`. The caller stores the state and decides where pane sizes are
persisted.

## Boundaries

Behavior helpers do not:

- inspect rendered frames;
- read terminal globals;
- write to the clipboard or terminal host;
- infer application commands;
- own file-system, network, or process state.

Renderer internals may still use lower-level key maps, input maps, hit targets,
and render-node callbacks. Those are constructed from component options and should
not become the public behavior model.

For component roles, see [Components](./components.md). For runtime routing,
see [TUI runtime](./tui.md).

## Reusable control keymaps

`listbox`, `tree`, `dataGrid`, `textInput`/`passwordInput`, `textArea`, and
`searchPicker` accept a resolved, immutable `keymap`. Their typed constructors
are exported from the root and their component-family entrypoints:
`createListboxKeymap`, `createTreeKeymap`, `createDataGridKeymap`,
`createTextInputKeymap`, `createTextAreaKeymap`, and `createSearchPickerKeymap`.
Create maps outside `view()` and reuse them across instances.

Overrides map semantic action names to arrays of `KeyboardBinding` values.
Omitted actions retain their defaults; an array replaces all bindings for that
action; `null` (or an empty array) disables it. Unknown actions and ambiguous
bindings fail at construction. Chords include exact modifiers and may explicitly
opt into key repeat. Release bindings are rejected. Potentially overlapping
primary, shifted, and physical key identities are rejected rather than resolved
by insertion order.

```ts
import {
  createDataGridKeymap,
  controlKeymapHelp,
  helpBar
} from '@ismail-elkorchi/terminal-ui';

const gridKeys = createDataGridKeymap({
  previousRow: [{ kind: 'key', key: 'k' }],
  nextRow: [{ kind: 'key', key: 'j' }],
  select: null
});

// Pass keymap: gridKeys with the grid's ordinary data, state, and callbacks.
helpBar({
  id: 'grid-help',
  groups: [{
    id: 'navigation',
    bindings: controlKeymapHelp(gridKeys, ['previousRow', 'nextRow', 'activate'])
  }]
});
```

`controlKeymapHelp()` uses the same resolved bindings and action labels as the
control. It omits repeat-only entries and accepts an action subset for concise
or state-dependent help. Pass the actions meaningful in the current mode; for
example, omit editing commands while a text area is read-only.

Bindings run only inside the focused control. They produce the same existing
transitions as its defaults and do not bypass disabled, inert, busy, read-only,
or action-eligibility checks. A grid's column movement is still limited to cell
mode, and sorting still requires a sortable column. Ordinary printable bindings
also work in legacy terminals that report text rather than extended key events;
those aliases do not apply to pasted text, modified chords, or another control.
Unbound characters remain ordinary text input. App-level priority shortcuts
continue to follow the `beforeFocus`/`afterFocus` routing policy.

For Emacs-like text input, remap `moveHome` to Ctrl+A and disable `selectAll` in
the same map to avoid a conflict. Selection actions (`selectLeft`, `selectHome`,
`selectWordLeft`, and their counterparts) are explicit, so a remapped chord does
not accidentally change selection behavior. Text-area line/page actions retain
visual wrapped-line navigation even when their physical keys change.

`createControlKeymap()` can resolve the same action-key data for a custom
component. This is a binding table, not a command dispatcher: the component
still owns its semantic actions and focused interaction handlers.
