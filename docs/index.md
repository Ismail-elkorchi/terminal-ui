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
- `examples/testing/harness.mjs` demonstrates the memory testing harness.
- `examples/tui/interactive-workspace.mjs` demonstrates a hand-written interactive TUI using core primitives and generic widgets.

## Guides

- [API overview](./api/index.md)
- [Runtime support](./guides/runtime-support.md)
- [Text measurement](./guides/text.md)
- [Prompts](./guides/prompts.md)
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

## Boundaries

`terminal-ui` owns terminal interaction. Command definitions, command lookup, option binding, execution planning, and command manifests belong to caller-owned application code or command libraries.
