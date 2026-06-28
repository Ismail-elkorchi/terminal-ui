# TUI Rendering

TUI apps use state, messages, update functions, subscriptions, widget views,
layout, frames, render diffs, and accessible snapshots.

The core vertical path is:

1. Define a widget tree with `widgets`.
2. Lay the tree out with `layoutWidget()`.
3. Render a `Frame`.
4. Serialize a full frame or incremental `RenderDiff`.
5. Test the result with the memory harness.

For the renderer data model behind that path, see
[Rendering internals](./rendering-internals.md). For widget authoring
guidance, see [Building polished widgets](./building-polished-widgets.md).

Full-screen TUI runs enter terminal protocols through the session manager:
alternate screen, bracketed paste, raw input, click mouse reporting, focus
reporting, and cursor visibility. Unsupported optional protocols are reported
as diagnostics; restoration still runs through the same session path.

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
focusable widget.

For lower-level tests and custom event loops, `createTuiRuntime()` exposes the
same reducer/render path directly. `runtime.start()` initializes the app and
returns the committed initial `Frame`; completion remains available through
`runtime.exit()` and `runTui()`.

Subscriptions are async event sources, not one-shot dispatch commands. A
subscription returns stable `id` values plus async `messages(context)` iterables.
The runtime starts a source once for a stable id, serializes every emitted
message through `runtime.dispatch()`, and aborts/disposes sources when they
leave the subscription set or when the TUI exits.

`runtime.dispatch(message)` is also the canonical external entry point for
custom event loops. Dispatches are serialized, so stream events, timers, input,
signals, and app-triggered messages cannot overlap render commits.

Scrollable widgets share the same `ScrollState` and `scrollReducer()` primitive.
Use it for line/page/top/bottom movement, item-into-view behavior, horizontal
offsets, and follow-tail log views. Existing visible-window helpers route
through this reducer so list, table, viewport, and scrollback widgets use one
scroll model instead of per-widget arithmetic.

Command surfaces are ordinary widgets. Apps decide which normalized key names
map to palette, accept, cancel, or history messages through widget `keyMap`
values; `terminal-ui` does not reserve a global command-palette shortcut,
Escape key, or Ctrl-C key event. Host signals such as `SIGINT` and `SIGTERM`
still interrupt the full-screen run through the terminal host signal path.

Layout regions are structural widget data. `grid()`, `splitPane()`, `tabs()`,
and `modal()` produce regular layout nodes, frames, diffs, and accessible
snapshots. For application navigation, use the pure `screenStackReducer()` and
`activeScreen()` helpers; a screen stack is serializable state, not a hidden
runtime mode.

Executable example:

- `examples/tui/render-frame.mjs`
- `examples/tui/installer-wizard.mjs`
- `examples/tui/chat-interface.mjs`
- `examples/tui/game-board.mjs`
- `examples/testing/visual-snapshots.mjs`
