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

- `examples/showcase/app.mjs` demonstrates the full-screen Northstar Control app.
- `examples/showcase/scripted.mjs` drives the same app through deterministic runtime state changes.
- `examples/showcase/preview.mjs` emits frame, diff, hit-target, focus, and accessibility evidence from the showcase.
- `examples/prompts/non-tty-input.mjs` demonstrates deterministic non-TTY prompt input.
- `examples/shell/cli-core-shell.mjs` demonstrates a shell backed by a real `cli-core` program.
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
