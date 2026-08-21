# Building Terminal Apps

`terminal-ui` applications are pure state machines that return opaque UI
elements from `view()`. The renderer performs layout, frame construction, focus
targets, hit targets, accessibility snapshots, and terminal output.

Normal application code should think in layers:

- app runtime: `defineTui()`, `runTui()`, subscriptions, and effects;
- layout: `column()`, `row()`, `grid()`, `splitPane()`, and `overlay()`;
- components: `dialog()`, `tabs()`, controls, data views, text surfaces, feedback, and visualization;
- behavior: pure reducers and state helpers for controlled components;
- component definitions: reusable leaf and composite factories through
  `defineComponent()`;
- renderer APIs: frame construction, diffing, and serialization.

The caller-supplied value is `Element<TMessage>`. It is intentionally opaque:
application code composes it and returns it, but does not inspect `kind`,
`props`, renderer callbacks, hit targets, or frame internals.

## Basic Shape

```ts
import { button, column, defineTui, runTui, text } from '@ismail-elkorchi/terminal-ui';

type Message = { kind: 'save' } | { kind: 'quit' };
interface State { readonly saved: boolean; }

const app = defineTui<State, Message>({
  id: 'terminal-app-example',
  init: () => ({ state: { saved: false } }),
  update: (state, message) => {
    if (message.kind === 'save') return { state: { saved: true } };
    return { state, exit: { reason: 'quit' } };
  },
  view: (state) => column([
    text({ content: state.saved ? 'Saved' : 'Unsaved' }),
    button({ id: 'save', label: 'Save', onAction: (): Message => ({ kind: 'save' }) }),
    button({ id: 'quit', label: 'Quit', onAction: (): Message => ({ kind: 'quit' }) })
  ])
});

await runTui(app);
```

## Component Options

Component options put domain state first and system metadata second.

```ts
import { button } from '@ismail-elkorchi/terminal-ui';

type Message = { readonly kind: 'save' };

button({
  id: 'save',
  label: 'Save',
  onAction: (): Message => ({ kind: 'save' }),
  styles: {
    states: { focused: { root: { bold: true } } }
  },
  meta: {
    focus: { order: 10 },
    layer: { overflowPriority: 'important' }
  }
});
```

Rules:

- keep `id` top-level; it is caller-supplied identity for focus, tests,
  accessibility, state association, routing, and examples;
- keep declared capabilities such as `disabled`, `busy`, `readOnly`, and
  `inert`, plus domain values, on the component itself;
- put cross-cutting system metadata under `meta`;
- route every component's semantic events through its typed `onAction` channel;
- keep state caller-controlled.

## Controlled Components

Components do not retain durable application state. A component renders caller
state and emits caller messages. Behavior helpers can update that state, but
the application decides when to call them.

Use this pattern:

1. Store values, selection, scroll offsets, open state, and validation in app
   state.
2. Render components from that state.
3. Route component messages through `update()`.
4. Use reducers from `@ismail-elkorchi/terminal-ui/behavior` when a component
   has non-trivial navigation or editing behavior.

See [Components](./components.md) for component roles and
[Behavior helpers](./behavior.md) for reducer state boundaries.

## Rendering Boundary

The renderer resolves opaque elements through one private construction
boundary. Its runtime node shape is not part of the public element contract.

Use the testing façade for element snapshots:

- `renderElementSnapshot()`;
- `createTerminalHarness()`;
- `runInteractionScript()`.

Use `defineComponent()` from the component entrypoint when a reusable leaf or
composite needs bounded drawing, measurement, accessibility, focus, or pointer
targets. Define it once outside `view()` and pass current data through its
declared options.
Use the renderer entrypoint for direct frame construction, diffing, and
serialization.

See [Component definitions](./component-definitions.md) and
[Rendering internals](./rendering-internals.md).

Executable examples:

- `examples/tui/interactive-workspace.ts`
- `examples/tui/ide-editor.ts`
- `examples/tui/btop-monitor.ts`
