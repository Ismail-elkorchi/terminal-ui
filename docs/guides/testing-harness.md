# Test a terminal app

Use the public testing entrypoint to run an app with a memory terminal. The
harness starts the runtime before the callback and disposes it afterward.
`input()` resolves after the corresponding app interaction commits.

```ts
import { defineTui, textInput } from '@ismail-elkorchi/terminal-ui';
import { textInputReducer } from '@ismail-elkorchi/terminal-ui/behavior';
import { createTerminalHarness, keyInput } from '@ismail-elkorchi/terminal-ui/testing';

const app = defineTui<
  { readonly text: string; readonly cursor: number },
  Parameters<typeof textInputReducer>[1]
>({
  id: 'name-form',
  init: () => ({ state: { text: '', cursor: 0 } }),
  update: (state, transition) => ({ state: textInputReducer(state, transition) }),
  view: (state) => textInput({
    id: 'name', meta: { accessibleName: 'Name' }, state,
    onTransition: (transition) => transition
  })
});

const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
await harness.runApp(app, async (runtime) => {
  await harness.input(keyInput('a'));
  if (runtime.state().text !== 'a') throw new Error('Input did not commit');
});
```

`keyInput()`, `pasteInput()`, `pointerInput()`, and `wheelInput()` create semantic
events. The harness encodes them for the host when needed. Unsupported legacy
key encodings fail before a misleading transcript event is recorded. Use
`harness.resize()` for terminal size changes. `harness.clock.advance(ms)`
drives controlled timers without sleeping. In an interaction script,
`waitForCommit` advances the clock and waits for the next app frame;
`wait` only advances the clock. The app must be running inside `runApp()`.

For a component snapshot without an app, render through the public element
pipeline:

```ts
import { button } from '@ismail-elkorchi/terminal-ui';
import { renderElementSnapshot } from '@ismail-elkorchi/terminal-ui/testing';

const rendered = renderElementSnapshot({
  element: button({ id: 'save', label: 'Save', onPress: () => ({ kind: 'save' }) }),
  terminalSize: { columns: 20, rows: 3 }
});
if (!rendered.accessibleText.includes('Save')) throw new Error('Missing label');
```

The harness exposes frames, diffs, accessibility snapshots, output, restores,
and an interaction transcript. `runInteractionScript()` runs input and
assertion steps; a failed step throws `InteractionScriptError` with its index,
cause, and captured result. `assertTerminalRestored()` requires a successful
restore for the requested phase.

Use `createPtyTerminalHarness()` to exercise a caller-managed PTY boundary.
Its available variant also provides `runApp()`, settled semantic input, and
`nextCommit()`; call `dispose()` after the test. It returns a typed unavailable
result when that boundary cannot be created.
For host contracts and raw input behavior, see [host adapters](./host-adapters.md)
and [transcript replay](./transcript-replay.md). A runnable example is
[examples/testing/harness.mjs](../../examples/testing/harness.mjs).
