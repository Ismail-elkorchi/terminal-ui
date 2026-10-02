# Building Terminal Apps

`terminal-ui` applications are pure state machines that return opaque UI
elements from `view()`. The renderer performs layout, frame construction, focus
targets, hit targets, accessibility snapshots, and terminal output.

Install the npm package with `npm install @ismail-elkorchi/terminal-ui` (or
`bun add @ismail-elkorchi/terminal-ui`). Deno projects can use
`deno add jsr:@ismail-elkorchi/terminal-ui`. The root entrypoint contains the
ordinary application path; focused entrypoints are for lower-level or
specialized work.

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
    button({ id: 'save', label: 'Save', onPress: (): Message => ({ kind: 'save' }) }),
    button({ id: 'quit', label: 'Quit', onPress: (): Message => ({ kind: 'quit' }) })
  ])
});

const exit = await runTui(app);
if (exit.status === 'interrupted') {
  console.error('The terminal session was interrupted.');
}
```

Save the example as `app.ts` and run it with `node app.ts`,
`deno run app.ts`, or `bun app.ts`. Tab and Shift+Tab move focus; Enter
activates the focused button.

## Run Outcomes

`runTui()` resolves with a discriminated `TuiRunResult` for application completion,
cancellation, or host interruption. Operational failures reject with
`TuiRunError`; its `exit` retains diagnostics and the final accessible
snapshot. Full-screen applications reject non-TTY execution by default. Set an
explicit `nonTty` policy on the TUI definition only when transcript or
last-frame output is meaningful for that application.

The runtime owns a host it creates. When `runTui()` receives a caller-supplied
host, it releases terminal protocols and input ownership but leaves disposal
to the caller.

## Component Options

Component options put domain state first and system metadata second.

```ts
import { button } from '@ismail-elkorchi/terminal-ui';

type Message = { readonly kind: 'save' };

button({
  id: 'save',
  label: 'Save',
  onPress: (): Message => ({ kind: 'save' }),
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
- map controlled state requests through `onTransition` and completed occurrences
  through the component's semantic event callback, such as `onPress`, `onSubmit`,
  `onActivate`, or `onDismiss`;
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

For ordinary fields, `createTuiControls<State>()(reducers)` removes the repeated
transition-message wrapper, reducer routing and parent-state graft. Each key is
an existing state field and each value is its ordinary reducer; an optional third
argument supplies the current parent state. There is no control registry or
additional store.

```ts
import { createTuiControls, type TuiControlMessage } from '@ismail-elkorchi/terminal-ui';
import { commandInputReducer, type CommandInputState } from '@ismail-elkorchi/terminal-ui/behavior';

interface State { readonly command: CommandInputState; }
const controls = createTuiControls<State>()({ command: commandInputReducer });
type Message = TuiControlMessage<typeof controls> | { readonly kind: 'submit'; readonly value: string };

// In update(state, message):
// if (message.kind === 'control') return controls.update(state, message);
// In commandInput({...}):
// onTransition: controls.onTransition('command')
```

For components accepting `state`, spread `controls.bind('field', state)` to pass
both state and `onTransition`. For view-based controls, keep the view conversion
explicit and use `controls.onTransition('field')`. Messages contain the field and
transition, not a captured state or update closure. Transition payloads remain
caller-owned; the helper does not serialize or sanitize them. The reducer always reads the
current parent state, including across a queued input batch. Returning the same
field value preserves parent identity. The helper snapshots the reducer map when
created; it does not make state or domain values immutable for you.

Keep policies in the application: the IDE's buffer byte limit, dirty-close guard,
saved-document identity and file operations remain explicit. A tree transition
that also switches another panel stays in the app reducer. The [IDE example](../../examples/tui/ide-editor.ts) uses ordinary bindings for menu,
command, chooser and tab fields. Its explorer and editor panels are reusable
[child modules](../../examples/tui/features/) with explicit lifetime identities.
The workbench uses the same pattern for its prepared search picker. Parent reducers
handle domain outputs such as opening a file or accepting a command, rather than
forwarding every internal transition. Use ordinary element-returning functions
for visual reuse; a new `defineComponent()` is needed only for a rendering or
interaction primitive.

See [Components](./components.md) for component roles and
[Behavior helpers](./behavior.md) for reducer state boundaries.

## Asynchronous Work

Keep `init()` and `update()` synchronous. Return effects for one-shot work such
as saving a file or making a request. Return subscriptions for continuing
sources such as process output, file-system events, timers, and metrics. Both
receive abort signals and deliver ordinary typed messages back through the
serialized update path.

Use the built-in `timeoutSource()`, `intervalSource()`, and
`animationSource()` helpers before building a custom event source. See
[TUI runtime](./tui.md) for concurrency, cancellation, cadence, and terminal
suspension contracts.

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

Executable examples: [interactive workspace](../../examples/tui/interactive-workspace.ts),
[IDE editor](../../examples/tui/ide-editor.ts), and
[btop-style monitor](../../examples/tui/btop-monitor.ts).

## Lifting nested updates and defining commands

`liftTuiResult(parent, 'field', result)` grafts a child or prepared-query result
into one existing state field. It preserves effects, typed cancellation, focus
and domain outputs. If the field is unchanged, the parent object is unchanged.
Consume child `outputs` explicitly before returning the application update. This
is stateless composition, not a path registry or mutable binding.

`createTuiCommands(definitions, toMessage)` owns one static command catalog. Its
`inputBindings`, `menuItems(state)` and `pickerEntries(state)` project into existing
controls. `tuiBindingHelp(app)` derives help from those same bindings. In update,
call `resolve(currentState, id)` before executing the resulting domain message:
menu/picker availability from an earlier frame is not execution authorization.
The IDE derives its menu and shortcuts from one catalog. Application-specific
argument parsing and resource operations stay in application code.

The workbench picker starts `prepareSearchPickerIndex()` from a child effect when
opened. A separate prepared query owns the search, because typing changes search
dependencies without invalidating the source index. While construction is pending,
the input renders against one empty index and keeps accepting text; construction
completion queries the latest controlled text. The accepted index stays in child
state and is reused on reopening. Source replacement and removal cancel both
operations and reject stale completions. Copying raw entry descriptors before
yielding remains an explicit indivisible adoption cost.
