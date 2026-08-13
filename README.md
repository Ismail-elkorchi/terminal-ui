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
    text({ content: `Count: ${String(state.count)}` }),
    button({
      id: 'increment',
      label: 'Increment',
      onAction: () => 'increment'
    }),
    button({
      id: 'quit',
      label: 'Quit',
      onAction: () => 'quit'
    })
  ])
});

await runTui(app);
```

The root entrypoint contains the normal application path. Its `behavior`
namespace provides reducers for editing, selection, navigation, and scrolling.

## Define a Component

Application and package components use the narrow `component` entrypoint. A
definition is immutable and can create any number of elements.

```ts
import {
  defineComponent,
  type Element
} from '@ismail-elkorchi/terminal-ui/component';
import { measureTextCells } from '@ismail-elkorchi/terminal-ui/text';

interface BadgeOptions {
  readonly label: string;
}

const badgeComponent = defineComponent<BadgeOptions, BadgeOptions>({
  name: 'example-app/components/badge',
  identity: 'required',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'status',
  prepare(value) {
    if (typeof value.label !== 'string') throw new TypeError('badge requires a string label');
    return { label: value.label };
  },
  measure: ({ model, widthProfile }) => {
    const width = Math.max(1, measureTextCells(model.label, { widthProfile }).cells);
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth: width,
      preferredHeight: 1
    };
  },
  render({ model, target }) {
    target.write(0, 0, [{ text: model.label }]);
  },
  accessibility: ({ id, model }) => ({
    id,
    role: 'status',
    label: model.label
  })
});

export function badge(options: BadgeOptions & { readonly id: string }): Element {
  return badgeComponent(options);
}
```

Use `structure: 'composite'` when a component must measure and arrange child
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
  throw new Error(result.diagnostics[0]?.diagnostic.message ?? 'Interaction failed');
}
```

The testing entrypoint also provides element snapshots, input and resize
scripts, controlled clocks, frames, diffs, transcripts, and PTY-style
harnesses.

## Next Steps

- [Prompts](./docs/guides/prompts.md)
- [Building terminal apps](./docs/guides/building-terminal-apps.md)
- [Reusable component definitions](./docs/guides/component-definitions.md)
- [Testing harness](./docs/guides/testing-harness.md)
- [API entrypoints and all guides](./docs/index.md)

Runnable examples are in [`examples`](./examples).

`terminal-ui` owns terminal interaction. Argument parsing, command trees,
configuration, and plug-in semantics remain application concerns.
