# @ismail-elkorchi/terminal-ui

Runtime-agnostic TypeScript primitives for terminal hosts, input, text layout,
prompts, shell loops, widgets, TUI rendering, accessibility snapshots,
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

The root entrypoint also exposes the primary TUI test path:
`defineTui`, `layoutWidget`, `renderWidgetFrame`, `diffFrames`,
`renderFrame`, and `createTerminalHarness`.

Host adapters cover Node, Deno, Bun, memory-backed tests, and explicit
caller-managed PTY-style streams.

For Deno or source-first TypeScript consumers, the package is published through
JSR with equivalent source entrypoints:

```ts
import { runPrompt } from 'jsr:@ismail-elkorchi/terminal-ui';
```
