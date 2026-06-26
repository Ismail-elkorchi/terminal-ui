# TUI Rendering

TUI apps use state, messages, update functions, subscriptions, widget views,
layout, frames, render diffs, and accessible snapshots.

The core vertical path is:

1. Define a widget tree with `widgets`.
2. Lay the tree out with `layoutWidget()`.
3. Render a `Frame`.
4. Serialize a full frame or incremental `RenderDiff`.
5. Test the result with the memory harness.

Full-screen TUI runs enter terminal protocols through the session manager:
alternate screen, bracketed paste, raw input, click mouse reporting, focus
reporting, and cursor visibility. Unsupported optional protocols are reported
as diagnostics; restoration still runs through the same session path.

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

Executable example:

- `examples/tui/render-frame.mjs`
