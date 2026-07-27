# @ismail-elkorchi/terminal-ui

Typed prompts, components, layout, rendering, and deterministic testing for
terminal applications.

The package is ESM-only and supports Node `>=24`, current Deno and Bun, and
memory-backed tests.

## Install

```bash
npm install @ismail-elkorchi/terminal-ui
```

Deno and source-first TypeScript projects can import the equivalent
`jsr:@ismail-elkorchi/terminal-ui` entrypoints.

## Run a Prompt

```ts
import { input, runPrompt } from '@ismail-elkorchi/terminal-ui/prompts';

const result = await runPrompt(input({
  label: 'Project name',
  required: true
}));

if (result.status === 'submitted') {
  console.log(result.value);
} else {
  console.error(`Prompt ${result.reason}`);
}
```

Cancellation, validation failure, timeout, non-TTY denial, and host failure are
typed results.

## Build a TUI

Applications own their state. Components render it and emit messages.

```ts
import {
  button,
  column,
  defineTui,
  runTui,
  text
} from '@ismail-elkorchi/terminal-ui';

type Message = 'increment' | 'quit';

const app = defineTui<{ readonly count: number }, Message>({
  id: 'counter',
  init: () => ({ count: 0 }),
  update: (state, message) => message === 'quit'
    ? { state, exit: { reason: 'quit' } }
    : { state: { count: state.count + 1 } },
  view: (state) => column([
    text(`Count: ${String(state.count)}`),
    button({
      id: 'increment',
      label: 'Increment',
      onPress: () => 'increment'
    }),
    button({
      id: 'quit',
      label: 'Quit',
      onPress: () => 'quit'
    })
  ])
});

await runTui(app);
```

The root entrypoint contains the normal application path. Its `behavior`
namespace provides reducers for editing, selection, navigation, and scrolling.

## Publish a Component

Component packages use `@ismail-elkorchi/terminal-ui/component`. They return the
same opaque `Element` type as built-in components.

```ts
import {
  custom,
  type Element
} from '@ismail-elkorchi/terminal-ui/component';

export function badge(label: string): Element {
  return custom({
    id: 'badge',
    state: label,
    renderer: {
      render({ state, bounds, target }) {
        target.write(bounds.row, bounds.column, [{ text: state }]);
      },
      accessibility: ({ id, state }) => ({
        id,
        role: 'status',
        label: state
      })
    }
  });
}
```

Use `customComposite()` when the component must also measure or arrange child
elements.

## Test Deterministically

```ts
import {
  createTerminalHarness,
  runInteractionScript
} from '@ismail-elkorchi/terminal-ui/testing';

const harness = createTerminalHarness();
const result = await runInteractionScript(harness, {
  id: 'empty-harness',
  steps: [{
    kind: 'assertSnapshot',
    assertion: { role: 'group', label: 'Terminal harness' }
  }]
});

if (result.diagnostics.length > 0) {
  throw new Error(result.diagnostics[0]?.message ?? 'Interaction failed');
}
```

The testing entrypoint also provides element snapshots, input and resize
scripts, controlled clocks, frames, diffs, transcripts, and PTY-style
harnesses.

## Next Steps

- [Prompts](./docs/guides/prompts.md)
- [Building terminal apps](./docs/guides/building-terminal-apps.md)
- [Reusable renderer extensions](./docs/guides/renderer-extensions.md)
- [Testing harness](./docs/guides/testing-harness.md)
- [API entrypoints and all guides](./docs/index.md)

Runnable examples are in [`examples`](./examples).

`terminal-ui` owns terminal interaction. Argument parsing, command trees,
configuration, and plug-in semantics remain application concerns.
