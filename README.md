# @ismail-elkorchi/terminal-ui

General-purpose TypeScript primitives for building terminal user interfaces:
runtime hosts, input, layout, rendering, widgets, prompts, accessibility,
transcripts, and deterministic testing.

This repository implements the canonical product contract for the package.

The package owns terminal interaction concerns. It does not own low-level argv
parsing, command-tree semantics, config resolution, or plugin semantics.

## Install

```bash
npm install @ismail-elkorchi/terminal-ui
```

```ts
import { runPrompt } from '@ismail-elkorchi/terminal-ui';
```

The root entrypoint also exposes the primary TUI path:
`defineTui`, `layoutWidget`, `renderWidgetFrame`, `diffFrames`,
`renderFrame`, widgets, themes, and `createTerminalHarness`.

Host adapters cover Node, Deno, Bun, memory-backed tests, and explicit
caller-managed PTY-style streams.

For Deno or source-first TypeScript consumers, the package is published through
JSR with equivalent source entrypoints:

```ts
import { runPrompt } from 'jsr:@ismail-elkorchi/terminal-ui';
```

## Short Examples

Basic prompt:

```ts
import { input, runPrompt } from '@ismail-elkorchi/terminal-ui';

const result = await runPrompt(input({ label: 'Name' }));
```

Basic full-screen app:

```ts
import { defineTui, runTui } from '@ismail-elkorchi/terminal-ui';
import { inputField } from '@ismail-elkorchi/terminal-ui/widgets';

const app = defineTui({
  id: 'example',
  init: () => ({ value: 'ready' }),
  update: (state) => ({ state, exit: {} }),
  view: (state) => inputField({ id: 'field', value: state.value })
});

await runTui(app);
```

Layout and styled widgets:

```ts
import { renderFrame, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { row, richText, stack, statusBar } from '@ismail-elkorchi/terminal-ui/widgets';

const frame = renderWidgetFrame(stack([
  statusBar({ id: 'status', text: 'Ready' }),
  row([
    richText({ segments: [{ text: 'Primary', style: { fg: { kind: 'theme', token: 'accent.primary' } } }] }),
    richText({ segments: [{ text: 'Secondary', style: { fg: { kind: 'theme', token: 'accent.secondary' } } }] })
  ])
]), { columns: 40, rows: 4 });

console.log(renderFrame(frame));
```

Custom widget:

```ts
import { renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { custom } from '@ismail-elkorchi/terminal-ui/widgets';

const meter = custom({
  id: 'meter',
  renderer: {
    render({ buffer, node }) {
      buffer.write(node.bounds.row, node.bounds.column, [{ text: 'CPU ███░ 75%' }]);
    },
    accessibility() {
      return { id: 'meter', role: 'status', label: 'CPU', value: '75%' };
    }
  }
});

renderWidgetFrame(meter, { columns: 20, rows: 2 });
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

- `examples/tui/forms-settings.mjs`
- `examples/tui/file-browser.mjs`
- `examples/tui/data-table.mjs`
- `examples/tui/log-viewer.mjs`
- `examples/tui/command-palette.mjs`
- `examples/tui/installer-wizard.mjs`
- `examples/tui/text-editor.mjs`
- `examples/tui/game-board.mjs`
- `examples/tui/chat-interface.mjs`
- `examples/tui/monitoring-console.mjs`
- `examples/tui/custom-widget.mjs`
- `examples/testing/visual-snapshots.mjs`
