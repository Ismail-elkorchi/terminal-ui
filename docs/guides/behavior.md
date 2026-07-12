# Behavior Helpers

Behavior helpers are pure functions for controlled components. They update
caller-owned state; they do not render, subscribe to terminal input, mutate
hosts, start timers, or own application state.

Use behavior helpers when component interaction has reusable rules:

- scroll offsets and follow-tail state;
- table row, cell, sort, and resize behavior;
- tree expansion, filtering, selection, and lazy state;
- palette query, selection, preview, and grouping;
- command-bar editing, history, and suggestion navigation;
- notification history, expiry, pause, resume, and dismissal;
- activity-feed expansion and selection;
- menu hierarchy, dropdown highlighting, and tab navigation;
- checkbox-list, radio-group, select-box, and color-picker navigation;
- scrollback search, folds, follow-tail, and scroll projection;
- chart and heatmap keyboard and pointer selection;
- hover, focus, and visual-state reducers.

The pattern is:

1. Store the state in your application model.
2. Render components from that state.
3. Convert component event props to typed messages.
4. In `update()`, pass the message through the matching behavior helper.

```ts
import {
  commandBar
} from '@ismail-elkorchi/terminal-ui/components';
import {
  commandBarPresentation,
  commandBarReducer,
  type CommandBarState
} from '@ismail-elkorchi/terminal-ui/behavior';
import type { CommandBarAction } from '@ismail-elkorchi/terminal-ui/components';

type Message =
  | { kind: 'command'; action: CommandBarAction }
  | { kind: 'submit' };

interface State {
  readonly command: CommandBarState;
}

function update(state: State, message: Message): State {
  if (message.kind === 'submit') return state;
  return { ...state, command: commandBarReducer(state.command, message.action) };
}

function view(state: State) {
  return commandBar({
    id: 'command',
    ...commandBarPresentation(state.command),
    onAction: (action) => ({ kind: 'command', action }),
    onSubmit: { kind: 'submit' }
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
  type PaletteState
} from '@ismail-elkorchi/terminal-ui/behavior';

const entries = [
  { id: 'open', label: 'Open', value: 'open' }
] satisfies readonly SearchEntry<string>[];

type PaletteMessage =
  | { kind: 'palette'; action: PaletteAction }
  | { kind: 'acceptPalette' }
  | { kind: 'closePalette' };

function updatePalette(state: PaletteState, action: PaletteAction): PaletteState {
  return paletteReducer(state, action, { entries });
}

function paletteView(state: PaletteState) {
  return palette({
    id: 'commands',
    entries,
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
import { tree, type TreeAction, type TreeNode } from '@ismail-elkorchi/terminal-ui/components';
import {
  treePresentation,
  treeReducer,
  type TreeState
} from '@ismail-elkorchi/terminal-ui/behavior';

type Message = { kind: 'tree'; action: TreeAction };

function updateTree(state: TreeState, message: Message): TreeState {
  return treeReducer(state, message.action);
}

function treeView(state: TreeState) {
  return tree({
    id: 'navigation',
    ...treePresentation(state),
    onAction: (action) => ({ kind: 'tree', action })
  });
}
```

Loading children, opening a selected resource, and persistence remain
application effects. The reducer owns only deterministic hierarchy state.

Behavior helpers may return the same state object for no-op transitions. That
lets applications avoid unnecessary rerenders while keeping update logic
explicit.

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
