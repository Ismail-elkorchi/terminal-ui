# Behavior Helpers

Behavior helpers are pure functions for controlled components. They update
caller-controlled state; they do not render, subscribe to terminal input, mutate
hosts, start timers, or own application state.

Use behavior helpers when component interaction has reusable rules:

- scroll offsets and follow-tail state;
- table row, cell, sort, and resize behavior;
- tree expansion, filtering, selection, and lazy state;
- search-picker query, selection, preview, and grouping;
- command-input editing, history, and suggestion navigation;
- notification history, expiry, pause, resume, and dismissal;
- menu hierarchy, dropdown-menu highlighting, and tab navigation;
- checkbox-group, radio-group, select, and color-swatch-picker navigation;
- log-viewer search, folds, follow-tail, and scroll behavior;
- chart and heatmap keyboard and pointer selection;
- pointer interaction, focus, and visual-state reducers;
- split-pane divider selection, constrained resizing, and pointer drag anchors.

The pattern is:

1. Store the state in your application model.
2. Render components from that state.
3. Convert component event props to typed messages.
4. In `update()`, pass the message through the matching behavior helper.

## State and renderer input

Reducer state is application data stored by the caller. Component options stay
as direct fields when a few values are independent. A component uses a grouped
`state` object when several fields must describe one valid combination.
`presentation` is reserved for normalized data already shaped for rendering.
Computed wrapping, rows, carets, selection geometry, and similar coordinates
are layout. Retained search and collection indexes use `prepare...` names.

The component families apply that rule independently:

- text input and text area use presentations because their helpers normalize
  caller-controlled editing state into renderer-ready text, caret, selection, and
  scroll data;
- select uses a presentation because normalization produces the closed/open
  renderer union, including the highlighted option and popup scroll data;
- command input uses a presentation derived from its editing, history, and
  suggestion state;
- table uses a presentation because the selected cell is derived from valid
  row and column state, while list, tree, tabs, search picker, and the log viewer expose
  their independent component fields directly;
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
import type { CommandInputAction } from '@ismail-elkorchi/terminal-ui/components';

type Message =
  | { kind: 'command'; action: CommandInputAction }
  | { kind: 'submit' };

interface State {
  readonly command: CommandInputState;
}

function update(state: State, message: Message): State {
  if (message.kind === 'submit') return state;
  return { ...state, command: commandInputReducer(state.command, message.action) };
}

function view(state: State) {
  return commandInput({
    id: 'command',
    presentation: commandInputPresentation(state.command),
    onAction: (action): Message => ({ kind: 'command', action }),
    onSubmit: (): Message => ({ kind: 'submit' })
  });
}
```

Collection-dependent reducers receive their current data as reducer options;
the routed action remains a compact user intent. A controlled search picker follows
the same pattern:

```ts
import {
  searchPicker,
  type SearchPickerAction,
  type SearchEntry
} from '@ismail-elkorchi/terminal-ui/components';
import {
  searchPickerReducer,
  prepareSearchPickerIndex,
  type SearchPickerState
} from '@ismail-elkorchi/terminal-ui/behavior';

const entries = [
  { id: 'open', label: 'Open', value: 'open' }
] satisfies readonly SearchEntry<string>[];
const searchPickerIndex = prepareSearchPickerIndex(entries);

type SearchPickerMessage =
  | { kind: 'searchPicker'; action: SearchPickerAction }
  | { kind: 'acceptSearchPicker' }
  | { kind: 'closeSearchPicker' };

function updateSearchPicker(state: SearchPickerState, action: SearchPickerAction): SearchPickerState {
  return searchPickerReducer(state, action, { searchPickerIndex });
}

function searchPickerView(state: SearchPickerState) {
  return searchPicker({
    id: 'commands',
    searchPickerIndex,
    query: state.query,
    ...(state.selectedId === undefined ? {} : { selectedId: state.selectedId }),
    onAction: (action): SearchPickerMessage => ({ kind: 'searchPicker', action }),
    keys: {
      enter: (): SearchPickerMessage => ({ kind: 'acceptSearchPicker' }),
      escape: (): SearchPickerMessage => ({ kind: 'closeSearchPicker' })
    }
  });
}
```

Text editing and selection movement produce `SearchPickerAction` messages. Accept
and close remain application decisions because they change application state,
not search-picker state.

Hierarchical data uses the same controlled shape without moving application
effects into the component:

```ts
import { tree, type TreeControlAction, type TreeNode } from '@ismail-elkorchi/terminal-ui/components';
import {
  treeReducer,
  type PassiveTreeState
} from '@ismail-elkorchi/terminal-ui/behavior';

type Message = { kind: 'tree'; action: TreeControlAction };

function updateTree(state: PassiveTreeState, message: Message): PassiveTreeState {
  return treeReducer(state, message.action);
}

function treeView(state: PassiveTreeState) {
  return tree({
    id: 'navigation',
    ...state,
    onAction: (action: TreeControlAction): Message => ({ kind: 'tree', action })
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

`list()`, `table()`, and `tree()` accept ordinary arrays for small, local data.
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

`prepareListCollection()`, `prepareTableCollection()`, and
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

Scrollable controls use exact state and presentation variants. For example,
`PassiveTableState` is prepared with `tablePresentation()`, while
`ScrollableTableState` is prepared with `tableScrollablePresentation()` and
accepts the complete `TableAction` stream. Lists, trees, and the log viewer follow
the same naming and action split. This prevents passive controls from receiving
scroll actions that cannot change their state and prevents scrollable controls
from losing required scroll metrics in their renderer-facing data.

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
