# Testing Harness

The testing harness provides a memory terminal host, deterministic clock,
transcript recorder, input injection, resize events, frames, render diffs,
accessible snapshots, restore checkpoints, and output capture.

For a component or composed element, start with a direct deterministic
snapshot:

```ts
import { button } from '@ismail-elkorchi/terminal-ui';
import { renderElementSnapshot } from '@ismail-elkorchi/terminal-ui/testing';

const rendered = renderElementSnapshot({
  element: button({
    id: 'save',
    label: 'Save',
    onAction: () => ({ kind: 'save' })
  }),
  terminalSize: { columns: 20, rows: 3 }
});

if (!rendered.accessibleText.includes('Save')) {
  throw new Error('The button is missing from accessible output.');
}
```

Use `createTerminalHarness()` when a test needs runtime state, input, resize,
clock, or transcript control. Use `createPtyTerminalHarness()` only when the
host boundary itself is under test.

Use it to test prompts and TUI apps without private imports.
Pass `terminalSize` to `createTerminalHarness()` or
`createPtyTerminalHarness()` to set the initial row and column dimensions.
Resize input events and interaction-transcript commits use the same
`terminalSize` field.

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

Executable examples are tested directly by the package suite. The tests run
each public example and assert successful process output. This keeps examples
reviewable without maintaining generated stdout snapshots.

Renderer and component regression tests should prove current public behavior:
styled cells, spans, blocks, frame JSON, diffs, ANSI, focus targets, hit
targets, accessibility, and cost bounded by terminal size. See
[Rendering internals](./rendering-internals.md) and
[Building polished components](./building-polished-components.md).

The testing entrypoint deliberately contains harnesses, interaction scripts,
visual snapshots, and public assertions only. Dirty-region planners, render
regions, diff interpreters, notification placement, prepared search indexes,
and scrollbar implementation details are package-private and are not testing
contracts.

Reusable component packages can call `renderElementSnapshot()` with an opaque
element and terminal size. It renders through the production element pipeline
and returns the frame, diff, plain text, ANSI, accessibility, focus, and
hit-target artifacts without requiring low-level renderer imports.

Executable example:

- `examples/testing/harness.mjs`
