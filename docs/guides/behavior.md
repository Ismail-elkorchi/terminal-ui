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
- hover, focus, and visual-state reducers.

The pattern is:

1. Store the state in your application model.
2. Render components from that state.
3. Convert component event props to typed messages.
4. In `update()`, pass the message through the matching behavior helper.

```ts
import {
  commandBar,
  type CommandBarState
} from '@ismail-elkorchi/terminal-ui/components';
import { commandBarReducer } from '@ismail-elkorchi/terminal-ui/behavior';

type Message =
  | { kind: 'command'; action: Parameters<typeof commandBarReducer>[1] };

interface State {
  readonly command: CommandBarState;
}

function view(state: State) {
  return commandBar({
    id: 'command',
    state: state.command,
    onInput: (text) => ({ kind: 'command', action: { kind: 'input', text } }),
    onSubmit: () => ({ kind: 'command', action: { kind: 'submit' } })
  });
}
```

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
