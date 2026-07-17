# TUI Rendering

TUI apps use state, messages, update functions, subscriptions, element views,
layout, frames, render diffs, and accessible snapshots.

The core vertical path is:

1. Define an element tree with component factories.
2. Normalize it to the internal render-node tree.
3. Lay the tree out with `layoutElement()`.
4. Render a `Frame`.
5. Serialize a full frame or incremental `RenderDiff`.
6. Test the result with the memory harness.

For the renderer data model behind that path, see
[Rendering internals](./rendering-internals.md). For component authoring
guidance, see [UI authoring](./ui-authoring.md) and
[Building polished components](./building-polished-components.md).
Applications migrating across the current pre-alpha contract replacement should
also read [Breaking changes](./breaking-changes.md).

Full-screen TUI runs enter terminal protocols through the session manager and a
`SessionProtocolPolicy`. The default policy requires alternate screen and raw
input, requests bracketed paste, drag mouse reporting, focus reporting, and a
hidden cursor as optional protocol operations, and records diagnostics for
skipped or failed setup. Callers can explicitly disable protocols, require
them, or request other mouse reporting modes without changing component code.
Restoration still runs through the same session path and restores only state
that was actually changed.

Setup diagnostics are app-facing data. `runTui()` passes session setup
diagnostics into `TuiContext.diagnostics`, and `createTuiRuntime()` accepts the
same diagnostics explicitly for custom loops and tests. Apps that care about
optional terminal features, such as drag-capable mouse reporting, can render a
small warning from `context.diagnostics` instead of parsing terminal protocol
state. Subscriptions receive the same diagnostics through their subscription
context.

Input bytes are decoded through an input pipeline selected from the active
terminal capability profile and the session setup result. The current keyboard
profile is the stable legacy terminal profile; enhanced keyboard protocols are
reported as an unsupported input profile instead of being silently simulated.
Bracketed paste parsing follows the protocol operation that was actually
enabled for the session, so a skipped or disabled bracketed-paste setup cannot
accidentally turn ordinary input bytes into a paste event.

Non-TTY behavior is explicit on the TUI definition. The default is `reject`.
Apps may opt into `transcript_only`, `last_frame`, or `line_fallback`; these
paths do not enter full-screen terminal protocols or emit control sequences.

TUI transcript capture is opt-in with `transcript: { enabled: true }` on the
TUI definition. Enabled transcripts record normalized input events, frames,
render diffs, restore checkpoints, final diagnostics, and the final accessible
snapshot on the returned `TuiExit`.

When an update returns `exit: { reason }`, the completed `TuiExit` preserves
that reason after terminal-text sanitization.

`Frame.focusPath` is serializable. Pass a previously captured path to
`createTuiRuntime({ initialFocusPath })` to restore focus when the current
layout still contains that target; otherwise the runtime falls back to the first
focusable component.

`runTui(app, host, { theme })` and `createTuiRuntime({ theme })` accept either a
theme object or a `(state) => theme` function. Use the function form when a
full-screen app needs live theme changes driven by ordinary application state.

For lower-level tests and custom event loops, `createTuiRuntime()` exposes the
same reducer/render path directly. `runtime.start()` initializes the app and
returns the committed initial `Frame`; completion remains available through
`runtime.exit()` and `runTui()`.

`init()` and `update()` are synchronous state transitions. Asynchronous work
is returned as a typed effect; its result is dispatched later as an ordinary
application message. Effects have stable ids, receive an abort signal, report
failures as diagnostics, and may map failures back to a message through
`onError`. Promises therefore stay outside the serialized state-transition
critical section.

Subscriptions are async event sources, not one-shot effects. A source returns a
stable `id`, an explicit `delivery` policy, and an async
`messages(context)` iterable. `sequential` preserves every message in order.
`latest` bounds backlog by replacing a pending uncommitted message with the
newest value while a render commit is in progress. Source failures become
diagnostics and may produce a caller-owned lifecycle message through
`onLifecycle`. The runtime starts a source once for a stable id and
aborts/disposes it when it leaves the subscription set or when the TUI exits.

`runtime.dispatch(message)` is also the canonical external entry point for
custom event loops. Dispatches are serialized, so stream events, timers, input,
signals, and app-triggered messages cannot overlap render commits.

Anonymous layout nodes receive deterministic structural identities based on
their parent path, kind, and sibling ordinal. That identity survives viewport
resizes. Components whose focus or interaction state must survive sibling
reordering still need an explicit top-level `id`.

Scrollable components share the same `ScrollState`, `scrollReducer()`, and
`applyScrollEvent()` primitives. Use `scrollReducer()` for direct keyboard or
application actions such as line/page/top/bottom movement, item-into-view
behavior, horizontal offsets, and follow-tail log views. Use
`applyScrollEvent(currentScroll, event)` for routed wheel, scrollbar, or drag
messages produced by `onScroll` or a component's semantic `onAction`; the event carries the normalized
rendered content and viewport metrics, so controlled scroll state stays aligned
with the region the user actually sees. Use `scrollPolicy` on scrollable
components to tune discrete wheel behavior, such as denser line steps for an
editor-like text area or page-based wheel movement for a large viewport.
Existing visible-window helpers route through this reducer family so list,
table, tree, text-area, viewport, palette, menu, and scrollback components use
one scroll model instead of per-component arithmetic.

Scrollbar options are intentionally generic. Use `visible` and `axis` to control
geometry, and `visualState: 'active' | 'hover' | 'disabled' | 'inactive' |
'idle'` only when the application owns that state. Otherwise renderers derive
stable `idle` or `inactive` states from scrollability.

Tree components keep hierarchy state caller-owned. Send the component's single
`onAction` stream through `treeReducer()` and render passive state with
`treePresentation()` or controlled scroll state with
`treeScrollablePresentation()`. The action stream covers selection, navigation,
activation, disclosure, filtering, rename, lazy transitions, and scrolling.
`visibleTreeRows()` remains available when application effects need the exact
rendered row order. These helpers do not load files or infer application
activation policy; they only describe generic hierarchical records. Pointer
routing keeps disclosure and row-body regions separate while both produce the
same `TreeAction` vocabulary, so keyboard and pointer paths cannot drift.
Tree row rendering uses typed style parts for `indent`, `disclosure`, `icon`,
`label`, `metadata`, `match`, `placeholder`, `empty`, and `scrollbar` anatomy;
selected and disabled presentation use visual-state styles. Frame source metadata
marks disclosure, indent, icon, label, match, and selection-marker parts
separately for snapshots and debug projections.

Command surfaces are ordinary components. Apps decide which normalized key
names map to palette, accept, cancel, or history messages through component `keys`
values; `terminal-ui` does not reserve a global command-palette shortcut,
Escape key, or Ctrl-C key event. Host signals such as `SIGINT` and `SIGTERM`
still interrupt the full-screen run through the terminal host signal path.

Use app-level `keyBindings` for application policy that should not belong to a
particular focused component. Bindings run in two explicit phases:

1. `beforeFocus` bindings run before focused component input and should be used
   only for deliberate priority shortcuts.
2. Focused component `onInput/onPaste` and `keys` handle local control behavior.
3. `afterFocus` bindings, the default phase, run only when the focused component
   did not handle the input.
4. Built-in Tab focus traversal runs last.

This keeps text fields, command bars, forms, and editors in control of local
keys while still allowing apps to define global actions such as help, exit,
interrupt, or top-level navigation. Printable single-key bindings such as `q`
should usually stay mode-aware and default to `afterFocus`, so they do not steal
ordinary text input. Escape and Ctrl-C are not special runtime exits; map them
only when that behavior is correct for the app.

Focus targets, pointer hit targets, and accessibility live regions are separate
capabilities. A passive live region such as a notification stack does not need
keyboard focus, and a pointer hit target does not imply keyboard focus. When a
focus-contained overlay closes, the runtime restores the displaced focus path
when it still exists, including through nested contained overlays.

Mouse input is normalized through the TUI pointer router before component messages
are dispatched. Routed pointer events represent terminal mouse reports; they do
not claim touch or pen input unless a future host adapter can really emit those
sources. Hit targets are event-aware: each target can accept pointer event kinds
and compute a caller-owned message from the routed event. Ordinary targets
default to one left-click activation; release events, right-click context-menu
input, wheel scroll input, and drag/capture input do not reuse the same static
activation message. Routed pointer events preserve viewport coordinates,
target-local coordinates, press-origin coordinates for captured drags,
button/modifier state, vertical and horizontal scroll deltas, captured target
ids, and the raw terminal mouse event for tests and richer components.

Application text selection is caller-owned state. Editable components expose
grapheme-aware caret placement and selection start/extend/end through their
typed `onAction` union. Route those actions through `textInputReducer()`,
`textAreaReducer()`, or `commandInputReducer()` for standard controlled
behavior, or interpret them in application state directly. The renderer maps
press, drag, and release gestures to stable anchor/current text offsets. Use
`resolveSelectedText()` to turn explicit selectable text
sources and ranges into copyable text, or `copySelectedTextToClipboard()` to
run that selected text through the capability- and policy-gated OSC 52
clipboard protocol. Terminal-native selection remains a separate mode: the app
can delegate to it, but the runtime does not invent selected text from terminal
emulator state.

Layout regions are structural element data. Layout elements such as `grid()`
and `splitPane()`, and interactive components such as `tabs()` and `dialog()`,
produce regular layout nodes, frames, diffs, and accessible
snapshots. For application navigation, use the pure `screenStackReducer()` and
`activeScreen()` helpers; a screen stack is serializable state, not a hidden
runtime mode.

Use explicit track sizes for chrome/body compositions. `grid()` uses `rows` and
`columns`, while `splitPane()`, `column()`, and `row()` use `sizes`. The same
`LayoutSize` vocabulary applies across them: fixed cells for headers, footers,
and side rails; fill tracks for scrollable bodies; content tracks for measured
labels or compact controls. When `column()` or `row()` receives `sizes`, the
track count must match the child count.

```ts
import { helpBar, text, tree, type TreeNode } from '@ismail-elkorchi/terminal-ui/components';
import { column, surface } from '@ismail-elkorchi/terminal-ui/layout';

const nodes: readonly TreeNode[] = [
  {
    id: 'src',
    label: 'src',
    kind: 'branch',
    expanded: true,
    children: [{ id: 'index', label: 'index.ts', kind: 'leaf' }]
  }
];
const bindings = [{ key: 'Enter', label: 'Open' }];

surface(column([
  text('Explorer', { textRole: 'heading' }),
  tree({ id: 'explorer-tree', nodes }),
  helpBar({ groups: [{ id: 'explorer', bindings }] })
], {
  sizes: [
    { kind: 'fixed', cells: 1 },
    { kind: 'fill' },
    { kind: 'fixed', cells: 2 }
  ]
}));
```

Use `surface()` for visual grouping and elevation, not for app-frame policy.
`variant: 'chrome'` is the lightest app-bar treatment and is borderless by
default. `neutral` is an unframed content background. `raised`, `inset`,
`selected`, `warning`, `danger`, and `success` are framed panel/dialog states.
When a framed surface is too small to leave an interior, the border is skipped
for that frame so child content remains visible. A focusable borderless surface
uses the root focused state style, defaulting to `focus.background`, so active
panes can be visible without a global style cascade. Use
`visualState: 'selected' | 'active' | 'warning' | 'error' | 'success'` when the
application wants a surface to show caller-owned state while it is not focused;
runtime focus and `disabled` still take precedence.

Use `textArea({ lineNumbers: true })` or
`textArea({ lineNumbers: { start, minWidth }, activeLine: true })` when a
multi-line text region needs editor-like anatomy. The renderer emits the gutter,
line-number, active-line, value, placeholder, selection, caller-owned highlight,
cursor, and chrome parts with structured source metadata and ordinary style
slots. `highlights: [{ start, end, label, style }]` is for generic text ranges
such as search matches; selection remains visually stronger. `wrap: true` or
`wrap: { mode: 'soft' }` turns long logical lines into visual rows and composes
with the same scroll state, scrollbar, cursor, and accessibility contracts. The
cursor uses the generic `input.cursor` token in frame metadata. The component does
not own editing policy, syntax highlighting, file paths, or language semantics.
Pass `textAreaPresentation(state)` to `presentation` and map `onAction` to an
application message. The `TextAreaAction` union covers standard edits,
grapheme-aware pointer selection, and scrolling; `textAreaReducer()` provides
the default controlled behavior. Explicit local `keys` may override generated
bindings.

Executable example:

- `examples/testing/harness.mjs`
- `examples/tui/interactive-workspace.ts`
