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
