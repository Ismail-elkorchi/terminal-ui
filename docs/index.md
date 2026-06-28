# @ismail-elkorchi/terminal-ui

`terminal-ui` provides general-purpose TypeScript primitives for terminal user interfaces: runtime hosts, input, layout, rendering, widgets, prompts, accessibility, transcripts, and deterministic testing.

The package is ESM-only and targets Node, Deno, Bun, and memory-backed tests. Public examples live under `examples/` and are executed by the package test suite against the built package exports.

## Installation

Node and Bun consumers install the npm package:

```bash
npm install @ismail-elkorchi/terminal-ui
```

Deno and source-first TypeScript consumers can import the equivalent JSR source
entrypoints:

```ts
import { createMemoryTerminalHost, runPrompt } from 'jsr:@ismail-elkorchi/terminal-ui';
```

## Examples

- `examples/prompts/non-tty-input.mjs` demonstrates deterministic non-TTY prompt input.
- `examples/shell/cli-core-shell.mjs` demonstrates a shell backed by a real `cli-core` program.
- `examples/tui/render-frame.mjs` demonstrates widget tree to frame rendering.
- `examples/tui/forms-settings.mjs` demonstrates form controls for settings screens.
- `examples/tui/file-browser.mjs` demonstrates tree-based browsing.
- `examples/tui/data-table.mjs` demonstrates bounded tabular data.
- `examples/tui/log-viewer.mjs` demonstrates scrollback for event streams.
- `examples/tui/command-palette.mjs` demonstrates a generic palette.
- `examples/tui/installer-wizard.mjs` demonstrates modal wizard composition.
- `examples/tui/text-editor.mjs` demonstrates a bounded text editor surface.
- `examples/tui/game-board.mjs` demonstrates canvas-like drawing.
- `examples/tui/chat-interface.mjs` demonstrates history plus input composition.
- `examples/tui/monitoring-console.mjs` demonstrates status and chart widgets.
- `examples/tui/custom-widget.mjs` demonstrates a custom renderer.
- `examples/testing/visual-snapshots.mjs` demonstrates deterministic visual snapshot artifacts.
- `examples/testing/harness.mjs` demonstrates the memory testing harness.

## Guides

- [API overview](./api/index.md)
- [Runtime support](./guides/runtime-support.md)
- [Text measurement](./guides/text.md)
- [Prompts](./guides/prompts.md)
- [Shells with cli-core](./guides/shell.md)
- [TUI rendering](./guides/tui.md)
- [Widgets](./guides/widgets.md)
- [Rendering internals](./guides/rendering-internals.md)
- [Building polished widgets](./guides/building-polished-widgets.md)
- [Themes](./guides/themes.md)
- [Custom widgets](./guides/custom-widgets.md)
- [Layout](./guides/layout.md)
- [Host adapters](./guides/host-adapters.md)
- [Accessibility](./accessibility.md)
- [Transcripts and replay](./guides/transcript-replay.md)
- [Non-TTY behavior](./guides/non-tty.md)
- [Security and redaction](./security.md)
- [Testing harness](./guides/testing-harness.md)
- [Migration notes](./guides/migration.md)

## Boundaries

`terminal-ui` owns terminal interaction. Command definitions, command lookup, option binding, execution planning, and command manifests belong to `@ismail-elkorchi/cli-core`; low-level flag parsing belongs to `argv-flags`.
