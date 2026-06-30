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
`renderFramePlain`, `renderFrameAnsi`, `renderFrameDebug`, `renderDiffAnsi`,
widgets, themes, and `createTerminalHarness`.

The showcase gallery under `docs/gallery/` is generated from the executable
showcase app and checked by the fixture suite.

Focused product examples under `examples/products/` demonstrate file manager,
system monitor, note workspace, data dashboard, form wizard, and chart explorer
workflows with the same visual primitives used by the showcase.

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
import { renderFramePlain, renderWidgetFrame } from '@ismail-elkorchi/terminal-ui/tui';
import { row, richText, stack, statusBar } from '@ismail-elkorchi/terminal-ui/widgets';

const frame = renderWidgetFrame(stack([
  statusBar({ id: 'status', text: 'Ready' }),
  row([
    richText({ segments: [{ text: 'Primary', style: { fg: { kind: 'theme', token: 'accent.primary' } } }] }),
    richText({ segments: [{ text: 'Secondary', style: { fg: { kind: 'theme', token: 'accent.secondary' } } }] })
  ])
]), { columns: 40, rows: 4 });

console.log(renderFramePlain(frame));
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

- `examples/showcase/app.mjs`
- `examples/showcase/scripted.mjs`
- `examples/showcase/preview.mjs`
- `examples/gallery/animation-sequences.mjs`
- `examples/files/file-dialog.mjs`
- `examples/products/file-manager.mjs`
- `examples/products/system-monitor.mjs`
- `examples/products/notes-workspace.mjs`
- `examples/products/data-dashboard.mjs`
- `examples/products/form-wizard.mjs`
- `examples/products/chart-explorer.mjs`
- `examples/prompts/non-tty-input.mjs`
- `examples/shell/cli-core-shell.mjs`
- `examples/testing/visual-snapshots.mjs`
- `examples/testing/harness.mjs`
