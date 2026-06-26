# Testing Harness

The testing harness provides a memory terminal host, deterministic clock,
transcript recorder, input injection, resize events, frames, render diffs,
accessible snapshots, restore checkpoints, and output capture.

Use it to test prompts, shells, and TUI apps without private imports.

`harness.clock` is a controlled terminal clock. Use `advance(ms)` to drive
timeouts, debounced prompt data sources, validation delays, and scripted waits
without relying on real timers.

`runInteractionScript()` returns typed diagnostics for script assertion
failures instead of throwing ordinary assertion errors through the harness.
The returned `InteractionResult` includes the final output, snapshot,
transcript, and diagnostics so downstream tests can decide how to report or
store the failure.

`createPtyTerminalHarness()` exercises the caller-managed PTY host boundary.
It captures output, frames, diffs, restore checkpoints, resize events, and raw
mode state while still avoiding a mandatory native PTY dependency. When a PTY
adapter is unavailable, it returns a typed diagnostic instead of skipping with
ambient process state.

Executable example:

- `examples/testing/harness.mjs`
