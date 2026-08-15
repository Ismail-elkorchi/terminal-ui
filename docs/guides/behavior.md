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

## State and renderer input

Reducer state is application data stored by the caller. Component inputs stay
as direct fields when a few values are independent. Declared framework
capabilities such as `disabled`, `busy`, `readOnly`, and `inert` are independent
top-level fields. Domain models may group values when several fields describe
one valid combination. `presentation` is reserved for normalized data already
shaped for rendering.
Computed wrapping, rows, carets, selection geometry, and similar coordinates
are layout. Retained search and collection indexes use `prepare...` names.

The component families apply that rule consistently:

- text input and text area use presentations because their helpers normalize
  caller-controlled editing state into renderer-ready text, caret, selection, and
  scroll data;
- combobox uses a presentation because normalization produces the closed/open
  popup union, including independent active and selected option identities;
- command input uses a presentation derived from its editing, history, and
  suggestion state;
- listbox, list view, data grid, tree, tabs, search picker, and visualizations
  use presentations that distinguish active position from committed selection;
- range slider accepts one grouped state object because the active handle and
  ordered range values form one valid interaction state.

```ts
import {
  commandInput
} from '@ismail-elkorchi/terminal-ui/components';
import {
  commandInputPresentation,
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
    presentation: commandInputPresentation(state.command),
    onTransition: (transition): Message => ({ kind: 'command', transition })
  });
}
```

Collection-dependent reducers receive their current data as reducer options;
the routed action remains a compact user intent. A controlled search picker follows
the same pattern:

```ts
import {
  searchPicker,
  type SearchPickerControlTransition,
  type UnscrolledSearchPickerPresentation,
  type SearchEntry
} from '@ismail-elkorchi/terminal-ui/components';
import {
  searchPickerReducer,
  prepareSearchPickerIndex
} from '@ismail-elkorchi/terminal-ui/behavior';

const entries = [
  { id: 'open', label: 'Open', value: 'open' }
] satisfies readonly SearchEntry<string>[];
const searchPickerIndex = prepareSearchPickerIndex(entries);

type SearchPickerMessage = { kind: 'searchPicker'; transition: SearchPickerControlTransition };
type SearchPickerState = UnscrolledSearchPickerPresentation;

function updateSearchPicker(
  state: SearchPickerState,
  transition: SearchPickerControlTransition
): SearchPickerState {
  return searchPickerReducer(state, transition, { searchPickerIndex });
}

function searchPickerView(state: SearchPickerState) {
  return searchPicker<string, SearchPickerMessage>({
    id: 'commands',
    searchPickerIndex,
    presentation: state,
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
update alongside it. Prepare the enabled option IDs once with
`prepareCollectionInteractionIndex()` and retain that index with the option
collection; both behavior operations consume the prepared index. Configure the reducer `pageSize` and component
`maxVisibleOptions` from the same application constant.

Hierarchical data uses the same controlled shape without moving application
effects into the component:

```ts
import {
  tree,
  type TreeControlTransition,
  type TreeNode,
  type UnscrolledTreePresentation
} from '@ismail-elkorchi/terminal-ui/components';
import {
  treeReducer
} from '@ismail-elkorchi/terminal-ui/behavior';

const nodes: readonly TreeNode[] = [
  { id: 'readme', label: 'README.md', kind: 'leaf' }
];
const selection = { mode: 'single', commitment: 'manual' } as const;
type Message = { kind: 'tree'; transition: TreeControlTransition };
type TreeState = UnscrolledTreePresentation;

function updateTree(state: TreeState, message: Message): TreeState {
  return treeReducer(state, message.transition, { nodes, selection });
}

function treeView(state: TreeState) {
  return tree({
    id: 'navigation',
    nodes,
    presentation: state,
    onTransition: (transition): Message => ({ kind: 'tree', transition })
  });
}
```

Loading children, opening a selected resource, and persistence remain
application effects. The reducer owns only deterministic hierarchy state.

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

`listbox()`, `dataGrid()`, and `tree()` accept ordinary arrays for small, local data.
For large or remotely windowed data, prepare an immutable collection outside
`view()` and retain it until its source data changes:

```ts
import { prepareTableCollection } from '@ismail-elkorchi/terminal-ui/behavior';
import { table } from '@ismail-elkorchi/terminal-ui/components';

const visibleRows = [{ id: 'row-40000', value: 42 }];
const collection = prepareTableCollection(
  visibleRows,
  (row) => row.id,
  { startIndex: 40_000, totalCount: 100_000, domain: { kind: 'source' } }
);

table({
  id: 'results',
  collection,
  columns: [{ id: 'value', value: (row) => row.value }]
});
```

`prepareListboxCollection()`, `prepareTableCollection()`, and
`prepareTreeCollection()` create complete projections. The list and table
helpers accept `startIndex` and `totalCount` to create a windowed projection
whose records retain zero-based global `itemIndex` values. `totalCount` may be
zero. Every window declares whether those indexes
belong to the source or to an external projection. Externally filtered or sorted
windows use a stable projection ID and carry their query/sort provenance.
`prepareTreeRows()` accepts an already flattened tree projection and the same
window descriptor. Windowed list and tree data cannot be filtered locally
because the library cannot derive complete results from a partial window.

Prepared collections snapshot membership and identity. Replace the collection
when rows are inserted, deleted, reordered, or reprojected. Reducers and
renderers reuse identity and projection work while the same collection object
is retained; they do not retain mutable application arrays implicitly.

Variable-height sequential content uses `prepareMeasuredCollection()` instead
of a transient array projection. The prepared collection owns stable IDs, row
counts, ordering, and its prefix index while retaining each application value
as an opaque reference. `appendMeasuredItems()`, `prependMeasuredItems()`,
`replaceMeasuredItem()`, and `removeMeasuredItems()` return persistent versions;
`measuredWindow()` performs an indexed visible-row query. Use
`measuredAnchorAt()` before changing row counts when an item should remain at a
stable viewport row. Active-item reveal is an explicit query option and takes
precedence over anchoring.

Initial preparation is `O(n)`. Appending or prepending `m` items is expected
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
`startOffset` values and exclusive `endOffsetExclusive` values. Prepared
search matches use zero-based grapheme indexes with an exclusive
`endGraphemeIndexExclusive`.

Terminal rectangles, frame cells, and routed pointer events use one-based
terminal `row` and `column` coordinates. Drawing operations explicitly
documented as local accept zero-based terminal-cell coordinates and convert
them before writing.

Append-heavy documents use the same retained prepared-data rule through a
dedicated contract. Build a `LogHistory` once with
`prepareLogHistory()`, store it in application state, and append log entries
with `appendLogHistory()`. The append helper preserves existing history
segments, while wrapping and search indexes are reused by the renderer.

Scrollable controls use exact option variants. A passive `table()` has no
managed navigation, while `dataGrid()` has an explicit row or cell interaction
mode. Unscrolled transition callbacks cannot receive scroll transitions;
scrollable variants require caller-owned `ScrollState`. This prevents controls
from receiving transitions their state cannot represent.

Resizable panes use normalized shares so terminal resizing does not make the
application persist stale cell coordinates. `createSplitPaneState()` owns the
initial shares, `splitPaneReducer()` applies keyboard and captured-pointer
actions with optional per-pane share constraints, and
`splitPanePresentation()` produces the percentage tracks consumed by
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
