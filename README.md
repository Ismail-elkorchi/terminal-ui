# @ismail-elkorchi/terminal-ui

General-purpose TypeScript primitives for building terminal user interfaces:
runtime hosts, input, layout, rendering, typed components, controlled behavior
helpers, prompts, accessibility, transcripts, and deterministic testing.

This repository implements the canonical product contract for the package.

The package owns terminal interaction concerns. It does not own low-level argv
parsing, command-tree semantics, config resolution, or plugin semantics.

## Install

```bash
npm install @ismail-elkorchi/terminal-ui
```

```ts
import { runPrompt } from '@ismail-elkorchi/terminal-ui/prompts';
```

The root entrypoint exposes the primary runtime path: `createTerminalHost`,
`defineTui`, `runTui`, results, and diagnostics. Components, layout, behavior,
prompts, themes, hosts, rendering, and testing use explicit package subpaths.

Host adapters cover Node, Deno, Bun, memory-backed tests, and explicit
caller-managed PTY-style streams.

For Deno or source-first TypeScript consumers, the package is published through
JSR with equivalent source entrypoints:

```ts
import { runPrompt } from 'jsr:@ismail-elkorchi/terminal-ui/prompts';
```

## Short Examples

Basic prompt:

```ts
import { input, runPrompt } from '@ismail-elkorchi/terminal-ui/prompts';

const result = await runPrompt(input({ label: 'Name' }));
```

Basic full-screen app:

```ts
import { defineTui, runTui } from '@ismail-elkorchi/terminal-ui';
import { textInput } from '@ismail-elkorchi/terminal-ui/components';

const app = defineTui({
  id: 'example',
  init: () => ({ value: 'ready' }),
  update: (state) => ({ state, exit: {} }),
  view: (state) => textInput({ id: 'field', value: state.value })
});

await runTui(app);
```

Layout and styled components:

```ts
import { renderFramePlain, renderElementFrame } from '@ismail-elkorchi/terminal-ui/renderer';
import { richText, statusBar } from '@ismail-elkorchi/terminal-ui/components';
import { column, row } from '@ismail-elkorchi/terminal-ui/layout';

const frame = renderElementFrame(column([
  statusBar({ id: 'status', leading: [{ id: 'ready', kind: 'status', text: 'Ready', status: 'success' }] }),
  row([
    richText({ segments: [{ text: 'Primary', style: { fg: { kind: 'theme', token: 'accent.primary' } } }] }),
    richText({ segments: [{ text: 'Secondary', style: { fg: { kind: 'theme', token: 'accent.secondary' } } }] })
  ])
]), { columns: 40, rows: 4 });

console.log(renderFramePlain(frame));
```

Custom renderer:

```ts
import { custom, renderElementFrame } from '@ismail-elkorchi/terminal-ui/renderer';

const meter = custom({
  id: 'meter',
  renderer: {
    render({ buffer, bounds }) {
      buffer.write(bounds.row, bounds.column, [{ text: 'CPU ███░ 75%' }]);
    },
    accessibility() {
      return { id: 'meter', role: 'status', label: 'CPU', value: '75%' };
    }
  }
});

renderElementFrame(meter, { columns: 20, rows: 2 });
```

Testing and accessibility:

```ts
import { createTerminalHarness, runInteractionScript } from '@ismail-elkorchi/terminal-ui/testing';

const harness = createTerminalHarness();
const result = await runInteractionScript(harness, {
  id: 'smoke',
  steps: [{ kind: 'assertSnapshot', assertion: { role: 'application' } }]
});

console.log(result.snapshot.root.role);
```

Executable examples:

- `examples/prompts/non-tty-input.mjs`
- `examples/testing/harness.mjs`
- `examples/tui/interactive-workspace.mjs`
- `examples/tui/ide-editor.mjs`
- `examples/tui/btop-monitor.mjs`
