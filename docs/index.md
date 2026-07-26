# @ismail-elkorchi/terminal-ui

`terminal-ui` provides a typed element authoring model for terminal user
interfaces, with runtime hosts, input, components, layout, controlled behavior,
rendering, prompts, accessibility, transcripts, and deterministic testing.

The package is ESM-only and targets Node, Deno, Bun, and memory-backed tests. Public examples live under `examples/` and are executed by the package test suite against the built package exports.

## Installation

Node and Bun consumers install the npm package:

```bash
npm install @ismail-elkorchi/terminal-ui
```

Deno and source-first TypeScript consumers can import the equivalent JSR source
entrypoints:

```ts
import { createMemoryTerminalHost } from 'jsr:@ismail-elkorchi/terminal-ui/host';
import { runPrompt } from 'jsr:@ismail-elkorchi/terminal-ui/prompts';
```

## Examples

- `examples/prompts/non-tty-input.mjs` demonstrates deterministic non-TTY prompt input.
- `examples/testing/harness.mjs` demonstrates the memory testing harness.
- `examples/tui/interactive-workspace.ts` demonstrates a hand-written interactive TUI using layout, components, behavior helpers, and runtime APIs.
- `examples/tui/ide-editor.ts` demonstrates a full-screen editor whose filesystem work runs through typed effects.
- `examples/tui/btop-monitor.ts` demonstrates a full-screen monitor using tables, charts, progress, surfaces, and subscriptions.

## Guides

- [API overview](./api/index.md)
- [Runtime support](./guides/runtime-support.md)
- [Text measurement](./guides/text.md)
- [Prompts](./guides/prompts.md)
- [TUI rendering](./guides/tui.md)
- [UI authoring](./guides/ui-authoring.md)
- [Components](./guides/components.md)
- [Behavior helpers](./guides/behavior.md)
- [Public UI authoring model](./guides/public-ui-authoring-model.md)
- [Architecture](./guides/architecture.md)
- [Rendering internals](./guides/rendering-internals.md)
- [Building polished components](./guides/building-polished-components.md)
- [Themes](./guides/themes.md)
- [Renderer extensions](./guides/renderer-extensions.md)
- [Layout](./guides/layout.md)
- [Host adapters](./guides/host-adapters.md)
- [Accessibility](./accessibility.md)
- [Transcripts and replay](./guides/transcript-replay.md)
- [Non-TTY behavior](./guides/non-tty.md)
- [Security and redaction](./security.md)
- [Testing harness](./guides/testing-harness.md)

## Boundaries

`terminal-ui` owns terminal interaction. Command definitions, command lookup, option binding, execution planning, and command manifests belong to caller-controlled application code or command libraries.

Performance work follows the reproducible evidence policy in
[Performance evidence](./guides/performance.md).
