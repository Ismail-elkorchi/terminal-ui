# @ismail-elkorchi/terminal-ui

Build typed prompts and full-screen terminal applications from the same
component, layout, input, accessibility, and testing foundations.

`terminal-ui` is ESM-only, has no runtime dependencies, and supports Node
`>=24`, current Deno and Bun, and memory-backed tests.

The `0.2.x` line is a development release. Public declarations are marked
`stable`, `beta`, or `experimental` in the generated
[API reference](./docs/api/reference.md). Terminal graphics remain
experimental pending physical-terminal compatibility evidence.

## Install

Node:

```bash
npm install @ismail-elkorchi/terminal-ui
```

Bun:

```bash
bun add @ismail-elkorchi/terminal-ui
```

Deno:

```bash
deno add jsr:@ismail-elkorchi/terminal-ui
```

Use the root entrypoint for ordinary applications. Focused entrypoints such as
`/prompts`, `/testing`, `/theme`, and `/component` keep specialized APIs
discoverable without requiring private imports.

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
typed results rather than ordinary control-flow exceptions.

## Build a TUI

Applications own state. Components render that state and emit typed messages;
`update()` is the only place that changes it.

```ts
import {
  button,
  column,
  defineTui,
  runTui,
  text
} from '@ismail-elkorchi/terminal-ui';

interface State {
  readonly count: number;
}

type Message =
  | { readonly kind: 'increment' }
  | { readonly kind: 'quit' };

const app = defineTui<State, Message>({
  id: 'counter',
  init: () => ({ state: { count: 0 } }),
  update: (state, message) => {
    if (message.kind === 'quit') {
      return { state, exit: { reason: 'quit' } };
    }
    return { state: { count: state.count + 1 } };
  },
  view: (state) => column([
    text({ content: `Count: ${String(state.count)}` }),
    button({
      id: 'increment',
      label: 'Increment',
      onPress: (): Message => ({ kind: 'increment' })
    }),
    button({
      id: 'quit',
      label: 'Quit',
      onPress: (): Message => ({ kind: 'quit' })
    })
  ])
});

const exit = await runTui(app);
if (exit.status === 'interrupted') {
  console.error('The terminal session was interrupted.');
}
```

Save this as `counter.ts` and run it with `node counter.ts`,
`deno run counter.ts`, or `bun counter.ts`. Use Tab and Shift+Tab to move
focus and Enter to activate a button.

`runTui()` resolves for application completion, cancellation, and host
interruption. Operational failures reject with `TuiRunError`, whose `exit`
contains diagnostics and the final accessible snapshot.

## Compose the Interface

- Layout factories such as `column()`, `row()`, `grid()`, `surface()`,
  and `viewport()` own geometry.
- Components own interaction and accessibility while application state remains
  controlled by the caller.
- The `behavior` namespace provides pure reducers, retained collections, and indexes
  for editing, keyboard and pointer text selection, paste, navigation,
  scrolling, and large data.
- Semantic themes adapt to terminal color capabilities; top-level component
  `styles` provide typed local anatomy and state overrides.
- Effects and subscriptions perform asynchronous work outside the serialized
  state transition.

Start with [Building terminal apps](./docs/guides/building-terminal-apps.md),
then use the [component catalog](./docs/guides/components.md),
[layout guide](./docs/guides/layout.md), and
[theme guide](./docs/guides/themes.md) as the application grows.

## Test Without a Terminal

```ts
import { text } from '@ismail-elkorchi/terminal-ui';
import { renderElementSnapshot } from '@ismail-elkorchi/terminal-ui/testing';

const snapshot = renderElementSnapshot({
  element: text({ content: 'Ready' }),
  terminalSize: { columns: 20, rows: 2 }
});

if (!snapshot.plainTextFrame.includes('Ready')) {
  throw new Error('Expected rendered text.');
}
```

The testing entrypoint also provides controlled clocks, input and resize
scripts, frames, diffs, accessibility snapshots, transcripts, and PTY-style
harnesses.

## Documentation

- [Documentation map](./docs/index.md)
- [Prompts](./docs/guides/prompts.md)
- [Building terminal apps](./docs/guides/building-terminal-apps.md)
- [Components](./docs/guides/components.md)
- [Layout](./docs/guides/layout.md)
- [Themes](./docs/guides/themes.md)
- [Testing harness](./docs/guides/testing-harness.md)
- [Runtime support](./docs/guides/runtime-support.md)
- [API stability](./docs/guides/api-stability.md)
- [API overview and entrypoints](./docs/api/index.md)
- [Generated API reference](./docs/api/reference.md)

Runnable applications are in [examples](./examples). Reusable component
authors can continue with
[Component definitions](./docs/guides/component-definitions.md).

`terminal-ui` owns terminal interaction. Argument parsing, command trees,
configuration, application persistence, networking, and plug-in semantics
remain application concerns.
