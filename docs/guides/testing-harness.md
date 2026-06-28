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

Visual preview artifacts are generated from the same snapshot machinery used
by tests. Run `npm run fixtures:update` to refresh
`tests/fixtures/visual-preview`, which contains plain text, ANSI text,
structured frame JSON, accessibility JSON, diff JSON, hit/focus target JSON,
and an HTML preview. The fixture check recomputes those artifacts and fails
when they drift, so documentation previews stay tied to stable renderer output
instead of local terminal screenshots.

Executable example output is fixture-backed as well. The same update command
refreshes `tests/fixtures/example-output`, and `check:fixtures` reruns every
public example against those fixtures. That keeps examples as reviewable
visual/product regressions instead of smoke tests that only prove a process
printed something.

Renderer and widget regression tests should prove current public behavior:
styled cells, spans, blocks, frame JSON, diffs, ANSI, focus targets, hit
targets, accessibility, and bounded viewport cost. See
[Rendering internals](./rendering-internals.md) and
[Building polished widgets](./building-polished-widgets.md).

Executable example:

- `examples/testing/harness.mjs`
- `examples/testing/visual-snapshots.mjs`
