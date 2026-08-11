# TUI Rendering

TUI apps use state, messages, update functions, subscriptions, element views,
layout, frames, render diffs, and accessible snapshots.

The core vertical path is:

1. Define an element tree with component factories.
2. Resolve the opaque elements to the internal render-node tree.
3. Lay the tree out with `layoutElement()`.
4. Render a `Frame`.
5. Serialize a full frame or incremental `RenderDiff`.
6. Test the result with the memory harness.

For the renderer data model behind that path, see
[Rendering internals](./rendering-internals.md). For component construction
guidance, see [Building terminal apps](./building-terminal-apps.md) and
[Building polished components](./building-polished-components.md).

Full-screen TUI runs enter terminal protocols through the session manager and a
`SessionProtocolPolicy`. The default policy requires alternate screen and raw
input, requests bracketed paste, drag mouse reporting, focus reporting, and a
hidden cursor and Unicode grapheme mode as optional protocol operations, and records diagnostics for
skipped or failed setup. Callers can explicitly disable protocols, require
them, or request other mouse reporting modes without changing component code.
Restoration still runs through the same session path and restores only state
that was actually changed.

`runTui(app)` creates and disposes a runtime host for the current platform.
Passing a host is useful for adapters and tests; the caller retains ownership
of that host after the runtime releases its input lease and restores the
terminal session. The caller must dispose the host when it is no longer needed.
Use `createTuiRuntime()` when a custom event loop needs a longer-lived,
externally coordinated host.

`defineTui()` validates consumed hooks, IDs, binding relationships, phases,
predicates, and triggers, then retains owned binding snapshots.
It does not maintain a second field registry for unused JavaScript properties.

If restoring a session times out or fails, the runtime makes one bounded
host-level recovery attempt through an emergency authority that does not wait
behind the failed restoration queue. This applies to both borrowed and
runtime-owned hosts; an owned host proceeds to normal disposal after recovery.
The original failure diagnostics are preserved. If recovery of a borrowed host
also fails, the caller must explicitly recover or dispose it before reuse.

Setup diagnostics are app-facing data. `runTui()` passes session setup
diagnostics into `TuiContext.diagnostics`; `TuiContext.terminalSize` contains
the current terminal row and column dimensions. `createTuiRuntime()` accepts
the same diagnostics explicitly for custom loops and tests. Apps that care about
optional terminal features, such as drag-capable mouse reporting, can render a
small warning from `context.diagnostics` instead of parsing terminal protocol
state. Each occurrence keeps reporting identity separate from its `diagnostic`
content. Subscriptions receive the same occurrences through their subscription
context.

Input bytes are decoded through an input pipeline selected from the active
terminal capability profile and session setup result. The keyboard profile is
either legacy input or an exact Kitty flag set. Kitty setup, decoding, and
restoration use the same verified flags. Base CSI-u code-point packets are
recognized without enabling optional Kitty fields; event types, alternate keys,
and associated text require their negotiated flags. Associated text is accepted only with the
report-all-keys flag required by the protocol. Report-all-keys is also valid
without associated text; that profile deliberately reports key identity without
committed text. Even when associated text is enabled, shortcuts such as Ctrl+A
need not carry text. Optional fields that were not negotiated remain one
unknown event rather than being downgraded into a press or a partial key event.
Ambiguous Escape, CSI, mouse, Kitty, and control-string prefixes remain pending
for the configured ambiguity delay. Once the bracketed-paste opener is complete,
the token is framed rather than ambiguous and remains open until its closing
marker or payload bound. OSC, DCS, SOS, PM, APC, SS3, and CSI framing is
recognized even when the token has no semantic decoder, so unsupported payloads
remain one unknown event and never become typed text. Bracketed paste, focus,
mouse, and keyboard decoding follow the resulting session state, including
protocols inherited from an outer terminal owner. An active mouse encoding that
the decoder cannot consume makes setup fail instead of silently producing
unusable input.

`InputPipeline` is one stream with one immutable profile. `decode()` retains
incomplete UTF-8 and terminal tokens; it has no per-call override.
`decodeOnce()` is the separate stateless operation. A custom event loop may use
`replaceTerminalProfile()` only between complete tokens after it has changed the
host protocol state. Low-level pipelines default to legacy keyboard decoding
with paste, focus, and mouse protocols disabled. Their explicit protocol
options are authority supplied by the host adapter, not capability guesses.

`decodeInputEvent()` strictly decodes imported or dynamic events, while
`snapshotInputEvent()` owns typed events without traversing decoder output again.

Decoded work has independent bounds for host chunks, framed tokens, text
events, event batches, paste payloads, Kitty associated text, and mouse numeric
fields. Key releases never activate ordinary component bindings or move focus.
Named bindings are press-only; editing movement and deletion opt into repeat
where repetition is meaningful. Character bindings match individual graphemes
across host chunk boundaries while adjacent unbound graphemes remain one
insertion event. The same event budget is enforced after this routing step,
before any message is dispatched.

Capability entries distinguish terminal protocol `support` from host-adapter
`availability`. An unknown protocol is not treated as supported, and a
supported protocol is not operable when the host lacks the required input,
output, resize, or session hook. Each entry retains its source facts and
diagnostics so applications can explain why an optional operation was skipped.
Mode observation records the prior terminal state before the application lease.
When a suspended runtime resumes against a changed host or PTY, input decoding,
application context, and output planning receive one replacement capability
snapshot before the full redraw.

The default drag mouse mode covers click, wheel, and captured drag input. Passive
hover, enter, and leave require `mouseReporting: { mode: 'all', ... }`, which is
opt-in because all-motion reporting can be high volume. Legacy numpad location
is opportunistic and depends on an outer application-keypad mode; negotiated
Kitty input is the reliable source of keypad identity.

Non-TTY behavior is explicit on the TUI definition. The default is `reject`.
Apps may opt into `transcript_only` or `last_frame`; these paths do not enter
full-screen terminal protocols or emit control sequences. Prompt line input is
owned by the prompt runtime and is not a TUI execution mode.

TUI transcript capture is opt-in with `transcript: true` on the
TUI definition. Enabled transcripts record normalized input events, frames,
render diffs, restore checkpoints, final diagnostics, and the final accessible
snapshot on the returned `TuiExit`.

When an update returns `exit: { reason }`, the completed `TuiExit` preserves
that reason after terminal-text sanitization.

`Frame.focusPath` is serializable. Pass a previously captured path to
`createTuiRuntime({ initialFocus: { kind: 'path', path } })` to restore focus when the current
layout still contains that target; otherwise the runtime falls back to the first
focusable component.

An update may return `focus` with the same selector shape to move focus after
an application transition. The requested target is resolved against the frame
produced by that transition; if it is absent, normal focus fallback applies.

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

Reducers borrow the committed state and must not mutate it or any nested
collection. Return the same state identity for a no-op and a new top-level
identity for every change. The generic API preserves the application's exact
state type rather than applying a shallow `Readonly<TState>` that cannot express
this invariant for arrays, maps, or nested objects. Applications that want
compile-time mutation checks should declare their own state fields and
collections readonly.

An identity no-op does not advance `stateVersion`, render, publish a frame
change, or restart subscriptions. Its effects, cancellation, exit request, and
transcript message are still processed. Use `runtime.redraw()` for an explicit
state-independent refresh.

An effect that must temporarily hand the terminal to a child process can run
that operation through `context.withTerminalSuspended()`. `runTui()` pauses
input ownership, restores the active terminal session, runs the operation,
then starts a fresh session and performs a full repaint. This is intended for
interactive programs such as an external editor, not ordinary background
work. While suspended, input acquired by the external operation remains owned
by that operation if the TUI exits. If the effect is cancelled, a late
operation completion cannot open a replacement terminal session. The terminal
host remains private to the runtime.
Failure to restore terminal ownership or establish the replacement session is
fatal to the run; input is not resumed against suspended output. Unix job-control
signals are not synthesized into this portable mechanism. Applications that
launch a stopping child should use the suspension boundary around that process.

Raw input does not turn Ctrl+C into `SIGINT`. The full-screen runtime deliberately
does not reserve Ctrl+C or Escape: applications declare those bindings when they
want interruption, while host-delivered SIGINT, SIGTERM, and SIGHUP retain the
runtime-wide restoration path from before setup through final cleanup.

Effects and subscriptions receive an abort signal and app-facing context, but
not the terminal host. Cancellation revokes producer authority before queued
messages are admitted, so retired work cannot mutate a newer application
generation. `replace` effects keep a bounded handoff deadline for
non-cooperative work; `parallel`, `keep-first`, and `enqueue` retain their
explicit queue contracts.

Subscriptions are async event sources, not one-shot effects. A source returns a
stable `id`, an explicit `delivery` policy, and an async
`messages(context)` iterable. `sequential` preserves every message in order.
`latest` bounds backlog by replacing a pending uncommitted message with the
newest value while a render commit is in progress. Source failures become
diagnostics and may produce a caller-controlled lifecycle message through
`onLifecycle`. The runtime starts a source once for a stable id and
aborts/disposes it when it leaves the subscription set or when the TUI exits.

`runtime.dispatch(message)` is also the canonical external entry point for
custom event loops. Dispatches are serialized, so stream events, timers, input,
signals, and app-triggered messages cannot overlap render commits.

Anonymous layout nodes receive deterministic structural identities based on
their parent path, kind, and sibling ordinal. That identity survives terminal
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
table, tree, text-area, viewport, search-picker, menu, and log-viewer components use
one scroll model instead of per-component arithmetic.

Scrollbar options are intentionally generic. Use `visible` and `axis` to control
geometry, and `visualState: 'active' | 'hover' | 'disabled' | 'inactive' |
'idle'` only when the application owns that state. Otherwise renderers derive
stable `idle` or `inactive` states from scrollability.

Tree components keep hierarchy state caller-controlled. Send the component's
interaction `onAction` stream through `treeReducer()` and render passive state with
the tree state fields directly. Component interaction emits selection,
navigation, activation, disclosure, and scrolling. Filtering, rename workflow,
and lazy-loading transitions are application or effect commands accepted by the
same reducer; the renderer does not invent them.
`visibleTreeRows()` remains available when application effects need the exact
rendered row order. These helpers do not load files or infer application
activation policy; they only describe generic hierarchical records. Pointer
routing keeps disclosure and row-body regions separate while both produce the
same `TreeAction` vocabulary, so keyboard and pointer paths cannot drift.
Tree row rendering uses typed style parts for `indent`, `disclosure`, `icon`,
`label`, `metadata`, `match`, `placeholder`, `empty`, and `scrollbar` anatomy;
selected and disabled presentation use visual-state styles. Frame source metadata
marks disclosure, indent, icon, label, match, and selection-marker parts
separately for snapshots and debugging.

Command surfaces are ordinary components. Apps decide which normalized key
names map to search-picker, accept, cancel, or history messages through component `keys`
values; `terminal-ui` does not reserve a global command-palette shortcut,
Escape key, or Ctrl-C key event. Host signals such as `SIGINT` and `SIGTERM`
still interrupt the full-screen run through the terminal host signal path.

Use app-level `inputBindings` for application policy that should not belong to a
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
and compute a caller-controlled message from the routed event. Ordinary targets
default to one left-click activation; release events, right-click context-menu
input, wheel scroll input, and drag/capture input do not reuse the same static
activation message. Routed pointer events preserve terminal coordinates,
target-local coordinates, press-origin coordinates for captured drags,
button/modifier state, vertical and horizontal scroll deltas, captured target
ids, and the raw terminal mouse event for tests and richer components.

Application text selection is caller-controlled state. Editable components expose
grapheme-aware caret placement and selection start/extend/end through their
typed `onAction` union. Route those actions through `textInputReducer()`,
`textAreaReducer()`, or `commandInputReducer()` for standard controlled
behavior, or interpret them in application state directly. The renderer maps
press, drag, and release gestures to stable anchor/current text offsets. Use
`resolveSelectedText()` to turn explicit selectable text
sources and ranges into copyable text, or `copySelectedTextToClipboard()` to
run that selected text through the capability- and policy-gated OSC 52
clipboard protocol. Explicit authorization permits a bounded write attempt when
terminal support is unknown; the successful result says `sent` and does not
claim that the clipboard contents were observed. Clipboard reading is not
exposed by terminal-ui. Terminal-native selection remains a separate mode: the app
can delegate to it, but the runtime does not invent selected text from terminal
emulator state.

Layout regions are structural element data. Layout elements such as `grid()`
and `splitPane()`, and interactive components such as `tabs()` and `dialog()`,
produce regular layout nodes, frames, diffs, and accessible
snapshots. For application navigation, use the pure `navigationStackReducer()`
and `activeNavigationEntry()` helpers. A navigation stack is serializable
application state, not a hidden runtime mode or a terminal screen.

Use explicit track sizes for header/body compositions. `grid()` uses `rows` and
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
  text({ content: 'Explorer', textRole: 'heading' }),
  tree({ id: 'explorer-tree', nodes }),
  helpBar({ id: 'explorer-help', groups: [{ id: 'explorer', bindings }] })
], {
  sizes: [
    { kind: 'fixed', cells: 1 },
    { kind: 'fill' },
    { kind: 'fixed', cells: 2 }
  ]
}));
```

Use `surface()` for visual grouping and elevation, not for app-frame policy.
`appearance: 'bar'` is the lightest app-bar treatment and is borderless by
default. `neutral`, `raised`, and `inset` select fills and elevation; add
`border` when the grouping also needs a visible frame. A title implies a
single border unless `border` is set explicitly.
When a framed surface is too small to leave an interior, the border is skipped
for that frame so child content remains visible. A surface does not carry
selection, result, disabled, or focus-within state. Put those meanings on the
component that owns the behavior, then wrap it in a surface when it also needs
visual containment.

Use `textArea({ lineNumbers: true })` or
`textArea({ lineNumbers: { startNumber, minWidth }, activeLine: true })` when a
multi-line text region needs editor-like anatomy. The renderer emits the gutter,
line-number, active-line, value, placeholder, selection, caller-controlled highlight,
cursor, and frame parts with structured source metadata and ordinary style
slots. `highlights: [{ startOffset, endOffsetExclusive, label, style }]` uses
zero-based UTF-16 code-unit offsets for generic text ranges such as search
matches; selection remains visually stronger. `wrap: true` or
`wrap: { mode: 'soft' }` turns long logical lines into visual rows and composes
with the same scroll state, scrollbar, cursor, and accessibility contracts. The
cursor uses the generic `input.cursor` token in frame metadata. The component does
not own editing policy, syntax highlighting, file paths, or language semantics.
Pass the text-area state as `presentation` and map `onAction` to an
application message. The `TextAreaAction` union covers standard edits,
grapheme-aware pointer selection, and scrolling; `textAreaReducer()` provides
the default controlled behavior. Initialize that state with
`createTextAreaState()` and retain it in application state. Its prepared text
document keeps line, grapheme, wrapping, cursor, and pointer projections stable
across selection and scroll updates; replacing it inside `view()` discards that
work. Explicit local `keys` may override generated bindings.

Executable example:

- `examples/testing/harness.mjs`
- `examples/tui/interactive-workspace.ts`
