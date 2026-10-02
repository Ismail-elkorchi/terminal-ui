# TUI runtime

Start with the [runnable counter](../../README.md#build-a-tui), then use
[building terminal apps](./building-terminal-apps.md) for state, messages, and
controlled components. This guide covers runtime behavior once an app is running.

## Start and finish a session

`runTui(app)` creates a host for the current runtime, enters a terminal session,
and restores it on exit. Pass `{ host }` to borrow a host you manage. Use
`createTuiRuntime({ app, host })` when another event loop owns input delivery;
call `start()` before dispatching and `dispose()` when finished.

An app ends by returning `exit` from `init()` or `update()`. Application
completion, cancellation, and host interruption resolve to typed results.
Operational failure rejects `runTui()` with `TuiRunError`; its `exit` retains
diagnostics and the last accessible snapshot. The default non-TTY policy
rejects full-screen execution. Choose an explicit `nonTty` mode when output is
redirected; see [non-TTY behavior](./non-tty.md).

The session policy requires alternate screen and raw input by default. It
requests paste, drag mouse reporting, focus reporting, cursor hiding, and
Unicode grapheme mode where available. The runtime restores the terminal
state it changed. A borrowed host remains yours to dispose after restoration.
For adapters and capability details, see [host adapters](./host-adapters.md).

## State and commit order

`init()` and `update()` run synchronously. Return a new state identity for a
change; never mutate the committed state. Returning the same state identity
skips a state-driven render, while effects, cancellation, exit, and message
recording still proceed. Call `redraw()` for an explicit refresh independent
of state identity.

Input, programmatic dispatch, resize, effects, subscriptions, and diagnostic
redraws enter one serialized transaction queue. Each transaction reduces
messages, resolves focus and interaction targets, builds a candidate frame,
waits for output receipt, then publishes state and frame together. A failed
write does not publish the candidate. If a write may have reached the
terminal, the next commit rebuilds the output baseline. `dispatch()` and
`dispatchMany()` resolve after their accepted commit.

`resizeMessage(state, context)` can turn a size change into an ordinary app
message before the resized frame is built. Its context contains both
`previousTerminalSize` and the new `terminalSize`; return `ignoreMessage()`
when no state adjustment is needed. A plain resize still redraws the frame.

## Input, focus, and pointer routing

The managed input loop decodes terminal bytes with the negotiated keyboard,
paste, mouse, and focus profile. `handleInputChunk()` accepts raw host chunks;
`handleInput()` accepts a decoded event. Call `flushInput()` after the last raw
chunk when using a custom loop. Key releases do not activate normal bindings.
Text routing preserves binding behavior across arbitrary chunk boundaries.
The [input guide](./host-adapters.md) describes adapter responsibilities.

App-level `inputBindings` have two phases:

1. `beforeFocus` runs first for deliberate priority shortcuts.
2. Focused component text, paste, and key handlers run next.
3. `afterFocus` runs if the component did not handle the event.
4. Built-in Tab traversal runs last.

Keep printable single-key app shortcuts in `afterFocus` unless they must
override text entry. Escape and Ctrl+C are ordinary key events unless the app
binds them; host SIGINT, SIGTERM, and SIGHUP still use the restoration path.

`Frame.focusPath` identifies the accepted target. Supply it as
`initialFocus: { kind: 'path', path }` to restore focus when that target still
exists, or return a `focus` selector from `update()`. Contained overlays restore
the displaced focus path when they close. A clipped target inside a controlled
viewport can request a focus-reveal scroll. The app remains owner of scroll
state; see [layout](./layout.md) and [behavior helpers](./behavior.md).

Pointer and wheel events route through the hit targets of the committed frame.
The router preserves target-local and press-origin coordinates, modifiers,
scroll deltas, and captured drag identity. Right-click context menus can pass
through an ignored child to an ancestor. Passive hover requires all-motion
mouse reporting; the default drag mode covers click, wheel, and captured drag.

## Effects and subscriptions

Return effects from `init()` or `update()` for async work. An effect has a
stable ID, receives an abort signal, and dispatches its result as a later
message. `onError` can turn failure into an app message; otherwise failure
becomes a diagnostic. Cancellation revokes producer admission before queued
results can change state. `replace`, `parallel`, `keep-first`, and `enqueue`
control concurrent effects.

Subscriptions are push sources for ongoing events. A source has a stable ID
and `run(context, sink)` producer. Await `sink.emit()` to honor capacity and
ordering. Reliable messages keep order; replaceable messages coalesce only
by their explicit key. When a source leaves the subscription set, its signal,
channel, and disposer are retired before a replacement takes ownership.

Use `context.withTerminalSuspended()` for an effect that must hand the terminal
to an interactive child process. The runtime restores its session, runs the
operation, then establishes a fresh session and repaints. Ordinary background
work does not need suspension.

## Prepared queries

`createTuiPreparedQuery({ id, prepare, toMessage })` packages the whole one-shot
query lifecycle in ordinary reducer/effect results. Store `query.init()` in app
or child state. `query.request(state, input)` returns pending state and a
replacement effect; `query.update(state, completion)` accepts only the current
pending revision; `query.cancel(state)` returns `cancel` and invalidates
old completions. Forward the entire returned result, including effects and
cancellation, through the parent update. No separate scheduler, registry or
mutable query store is created. Use distinct IDs for independent queries in one
parent, or let child composition scope their local IDs.

The input should contain all preparation dependencies, including the source
identity. Request again when either source or query changes. Equal inputs can be
requested repeatedly; each request replaces the earlier one. The preparation
callback receives the normal effect context and must use its abort signal and
cooperative yielding for expensive work. Failure becomes a typed completion and
is stored in `error`; a new request clears it. Duplicate or stale success/failure
messages leave state unchanged.

The helper owns `revision`, `pending`, `result` and `error`, and preserves other
caller-owned fields. It retains the last complete result across request, failure
and cancellation. The app explicitly chooses whether to display it: the
[100,000-incident workbench](../../examples/tui/incident-workbench.ts) passes
`{ ...state, result: null }` in its picker child when starting a query, so old results
are hidden while typing. The workbench also explicitly chooses the first enabled
result and applies accepted commands. These are application policies, not query
lifecycle behavior.

Keep query state when closing and reopening a retained feature. For removal and
remounting, put it inside an ordinary `createTuiChild` and use a fresh parent-owned
child generation. Child removal cancels the scoped query effect and its envelope
rejects old-lifetime messages, even if the newly mounted query starts at revision
zero. Merely hiding the view does not cancel work. Disposing the parent runtime
cancels preparation through the same existing effect lifecycle.

## Diagnostics, security, and testing

`TuiContext.diagnostics` contains setup and runtime occurrences. Capability
entries distinguish terminal support from host availability, so apps can
explain skipped features. Diagnostic history retains the newest 256
occurrences and reports omitted counts through `metrics()`.

Transcript capture is opt-in with `transcript: true` on the TUI definition.
Sensitive input redacts payloads and messages before transcript callbacks,
while the reducer still receives clear values. See [security](../security.md)
and [transcripts](./transcript-replay.md) for retention and replay.

For application tests, use `createTerminalHarness().runApp()` and await each
helper input or resize call. Inspect frames, diffs, accessibility, focus, and
restoration through the [testing harness](./testing-harness.md). For renderer
data structures and output costs, see [rendering internals](./rendering-internals.md)
and [performance evidence](./performance.md).

## Composing child applications

`createTuiChild(definition, toParentMessage)` reuses the ordinary `init`,
`update`, `view`, and optional `subscriptions` contract. Store the returned
`TuiChildState` in the parent's state. It contains the local state, a stable ID,
and its mount generation; there is no additional runtime or
mutable state registry. Active and queued work belongs to the runtime. Completed
operations leave no historical IDs in application state.

Initialize with `child.init({ id: 'notes', generation }, context)`. Use a fresh
parent-owned generation each time that child is mounted after removal. Forward
one `TuiChildMessage` envelope to `child.update`, render with `child.view`, and
include `child.subscriptions` while the child exists. The adapter scopes local
effect IDs, typed cancellation requests, source IDs, element IDs, and element-based focus
requests. It fences old-generation messages and preserves local error/source
lifecycle identities. Child focus requests use `element` or `elementTarget`;
explicit paths in view metadata are absolute parent paths.

When removing or replacing a child, return `child.remove(instance)` in the
parent's `cancel` array as `[child.remove(instance)]`, remove its state, and omit its subscriptions in that
same update. Merely hiding its view does not remove it or cancel its work.
`outputs` from child initialization/update are explicit domain decisions for
the parent to handle, such as closing a panel; they do not silently dispatch
parent messages or exit the application. `liftTuiResult(parent, field, childResult)`
forwards every contribution and preserves parent identity for a child no-op.
`TuiUpdateContribution` defines the shared state/effects/cancel/focus contract;
application exit and child outputs remain distinct.

## Accepted layout notifications

`textArea({ onLayout: snapshot => message, ... })` reports the accepted frame's
`TextAreaLayoutSnapshot`: source document identity, layout revision, allocated
and content bounds, source row-offset map, and resolved scroll. Bounds use
terminal coordinates, including the actual gutter and scrollbar allocation.
The source map reuses the editor's rendered layout. Unchanged geometry does not
notify again; document, decoration, allocation, and scrolling changes do.

Callbacks run only after frame publication. Standalone rendering and failed
writes never notify. Handle the message in the normal reducer and compare the
document identity with the current document before using a retained snapshot.
This removes the need to repeat text-area configuration and guess its width in
an application reducer.

Custom semantic components can implement `onLayout(input)` to return a local
action after publication. Its input includes `commitId`, absolute
`allocatedBounds`, and the previous committed component input when present.
Return `ignoreMessage()` when the relevant geometry/model has not changed to
avoid a feedback loop. Layout hooks must not dispatch or mutate application
state while measuring or painting.
