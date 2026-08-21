# @ismail-elkorchi/terminal-ui Documentation

`terminal-ui` provides typed prompts, full-screen application runtime,
components, layout, controlled behavior, terminal hosts, accessibility,
transcripts, graphics, and deterministic tests.

The package is ESM-only and supports Node `>=24`, current Deno and Bun, and
memory-backed tests. Examples under [`examples/`](../examples) execute against
the built public package.

## Start Here

Choose the path that matches the work:

| Goal | Start with |
| --- | --- |
| Ask one typed interactive question | [Prompts](./guides/prompts.md) |
| Build a full-screen application | [Building terminal apps](./guides/building-terminal-apps.md) |
| Find the right built-in control | [Components](./guides/components.md) |
| Arrange and clip content | [Layout](./guides/layout.md) |
| Customize colors, symbols, and component appearance | [Themes](./guides/themes.md) |
| Test without a physical terminal | [Testing harness](./guides/testing-harness.md) |
| Choose an import path or inspect a signature | [API overview](./api/index.md) and [API reference](./api/reference.md) |

Node and Bun consumers install from npm:

```bash
npm install @ismail-elkorchi/terminal-ui
```

Deno consumers install from JSR:

```bash
deno add jsr:@ismail-elkorchi/terminal-ui
```

## Application Guides

- [Building terminal apps](./guides/building-terminal-apps.md) explains state,
  messages, updates, views, effects, and subscriptions.
- [Prompts](./guides/prompts.md) covers prompt results, validation, async choice
  sources, progress, editors, and non-TTY input.
- [Components](./guides/components.md) is the semantic component catalog and
  controlled-state contract.
- [Behavior helpers](./guides/behavior.md) covers reducers, prepared
  collections, editing, navigation, selection, and scrolling.
- [Layout](./guides/layout.md) covers tracks, surfaces, viewports, overlays,
  responsive composition, and measured windows.
- [Themes](./guides/themes.md) covers semantic color tokens, symbol modes,
  palette packs, and local component styles.
- [Text measurement](./guides/text.md) covers graphemes, terminal cell width,
  documents, carets, and selection.
- [Accessibility](./accessibility.md) covers semantic snapshots, relationships,
  focus, live regions, and integration sinks.
- [Non-TTY behavior](./guides/non-tty.md) explains explicit fallback and denial
  policies.

## Runtime and Integration

- [TUI runtime](./guides/tui.md) documents lifecycle, input, effects,
  subscriptions, terminal suspension, transactions, and scrolling.
- [Runtime support](./guides/runtime-support.md) lists supported JavaScript
  runtimes and host boundaries.
- [Host adapters](./guides/host-adapters.md) is for custom terminal and
  caller-managed PTY integrations.
- [Terminal graphics](./guides/graphics.md) covers raster ownership, Kitty,
  SIXEL, budgets, fallback, and application responsibilities.
- [Graphics compatibility](./guides/graphics-compatibility.md) records current
  protocol evidence.
- [Transcripts and replay](./guides/transcript-replay.md) covers deterministic
  interaction evidence, validation, redaction, and retention.
- [Security and redaction](./security.md) describes trust boundaries and safe
  handling of terminal text and transcript data.

## Extending terminal-ui

- [Component definitions](./guides/component-definitions.md) is the public
  authoring contract for reusable leaf, composite, and composed components.
- [Building polished components](./guides/building-polished-components.md)
  covers interaction, tiny bounds, styling anatomy, accessibility, and
  conformance.
- [Element and component model](./guides/element-and-component-model.md)
  explains opaque elements, public inspection, and the construction boundary.

## Reference and Internals

- [API overview](./api/index.md) maps every package entrypoint.
- [Generated API reference](./api/reference.md) lists every public declaration,
  signature, stability level, and component styling anatomy.
- [API stability](./guides/api-stability.md) defines compatibility intent for
  stable, beta, and experimental declarations.
- [Architecture](./guides/architecture.md) describes package layers and
  authority boundaries.
- [Rendering internals](./guides/rendering-internals.md) documents frames,
  diffs, serialization, and renderer budgets.
- [Performance evidence](./guides/performance.md) defines reproducible
  benchmarks and regression thresholds.

## Executable Examples

- [Non-TTY prompt](../examples/prompts/non-tty-input.mjs)
- [Testing harness](../examples/testing/harness.mjs)
- [Interactive workspace](../examples/tui/interactive-workspace.ts)
- [IDE-style editor](../examples/tui/ide-editor.ts)
- [System monitor](../examples/tui/btop-monitor.ts)
- [Terminal graphics](../examples/tui/graphics.ts)

The examples are intentionally complete consumers. Start from the smallest
relevant example and keep application-specific commands, persistence,
networking, and resource policy outside the package.
