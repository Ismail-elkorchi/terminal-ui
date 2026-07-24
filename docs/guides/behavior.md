# Behavior Helpers

Behavior helpers are pure functions for controlled components. They update
caller-controlled state; they do not render, subscribe to terminal input, mutate
hosts, start timers, or own application state.

Use behavior helpers when component interaction has reusable rules:

- scroll offsets and follow-tail state;
- table row, cell, sort, and resize behavior;
- tree expansion, filtering, selection, and lazy state;
- palette query, selection, preview, and grouping;
- command-input editing, history, and suggestion navigation;
- notification history, expiry, pause, resume, and dismissal;
- activity-feed expansion and selection;
- menu hierarchy, dropdown-menu highlighting, and tab navigation;
- checkbox-group, radio-group, select, and color-swatch-picker navigation;
- scrollback search, folds, follow-tail, and scroll projection;
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
  row and column state, while list, tree, tabs, palette, and scrollback expose
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
the routed action remains a compact user intent. A controlled palette follows
the same pattern:

```ts
import {
  palette,
  type PaletteAction,
  type SearchEntry
} from '@ismail-elkorchi/terminal-ui/components';
import {
  palettePresentation,
  paletteReducer,
  preparePaletteIndex,
  type PaletteState
} from '@ismail-elkorchi/terminal-ui/behavior';

const entries = [
  { id: 'open', label: 'Open', value: 'open' }
] satisfies readonly SearchEntry<string>[];
const index = preparePaletteIndex(entries);

type PaletteMessage =
  | { kind: 'palette'; action: PaletteAction }
  | { kind: 'acceptPalette' }
  | { kind: 'closePalette' };

function updatePalette(state: PaletteState, action: PaletteAction): PaletteState {
  return paletteReducer(state, action, { index });
}

function paletteView(state: PaletteState) {
  return palette({
    id: 'commands',
    index,
    ...palettePresentation(state),
    onAction: (action): PaletteMessage => ({ kind: 'palette', action }),
    keys: {
      enter: (): PaletteMessage => ({ kind: 'acceptPalette' }),
      escape: (): PaletteMessage => ({ kind: 'closePalette' })
    }
  });
}
```

Text editing and selection movement produce `PaletteAction` messages. Accept
and close remain application decisions because they change application state,
not palette state.

Hierarchical data uses the same controlled shape without moving application
effects into the component:

```ts
import { tree, type TreeControlAction, type TreeNode } from '@ismail-elkorchi/terminal-ui/components';
import {
  treePresentation,
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
    ...treePresentation(state),
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
  { start: 40_000, total: 100_000, domain: { kind: 'source' } }
);

table({
  id: 'results',
  collection,
  columns: [{ id: 'value', value: (row) => row.value }]
});
```

`prepareListCollection()`, `prepareTableCollection()`, and
`prepareTreeCollection()` create complete projections. The list and table
helpers accept `start` and `total` to create a windowed projection whose
records retain global indices. Every window declares whether those indexes
belong to the source or to an external projection. Externally filtered or sorted
windows use a stable projection ID and carry their query/sort provenance.
`prepareTreeRows()` accepts an already flattened tree projection and the same
window descriptor. Windowed list and tree data cannot be filtered locally
because the library cannot derive complete results from a partial window.

Prepared collections snapshot membership and identity. Replace the collection
when rows are inserted, deleted, reordered, or reprojected. Reducers and
renderers reuse identity and projection work while the same collection object
is retained; they do not retain mutable application arrays implicitly.

Append-heavy documents use the same retained-projection rule through a
dedicated contract. Build a `ScrollbackHistory` once with
`prepareScrollbackHistory()`, store it in application state, and append records
with `appendScrollbackHistory()`. The append helper preserves existing history
segments, while wrapping and search indexes are reused by the renderer.

Scrollable controls use exact state and projection variants. For example,
`PassiveTableState` is projected with `tablePresentation()`, while
`ScrollableTableState` is projected with `tableScrollablePresentation()` and
accepts the complete `TableAction` stream. Lists, trees, and scrollback follow
the same naming and action split. This prevents passive controls from receiving
scroll actions that cannot change their state and prevents scrollable controls
from losing required scroll metrics during projection.

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
and render-node callbacks. Those are compiled from component options and should
not become the public behavior model.

For component roles, see [Components](./components.md). For runtime routing,
see [TUI runtime](./tui.md).
