# Architecture

The source tree is organized by responsibility, not by a minimum file count.
A directory remains useful when it establishes a stable dependency boundary:

- `geometry` contains terminal rectangles, sizes, layout tracks, and inset
  contracts shared without depending on rendering.
- `ui-model` contains component-domain data and prepared views shared by
  components, behavior, and rendering.
- `authoring` contains the private boundary that validates and normalizes
  authored values before constructing renderer data.
- `renderer/model` contains the private typed representation consumed by the
  renderer implementation.

Single-purpose contracts that do not establish such a boundary stay beside
their consumers. In particular, the TUI message-source vocabulary lives with
neutral interaction message semantics rather than in a one-file
`runtime-model` category. Shared protocol types have one declaration and are
re-exported where a focused entrypoint needs them.

## Dependency Flow

The principal dependency flow is:

```text
geometry, interaction, text, visual, and UI model
  -> authoring and private renderer model
  -> component, layout, and renderer-extension factories
  -> renderer implementation
  -> TUI runtime
  -> public testing harness
```

Components and layouts do not import renderer implementation modules.
Renderers do not import component or layout factories. Architecture checks
enforce these directions, prohibit dependency cycles across layers, keep
render-node dispatch in the renderer registry, and prevent the testing
entrypoint from re-exporting package-private modules.

## Authoring And Rendering

Public factories are the runtime boundary for JavaScript consumers and dynamic
application data. They reject invalid discriminants and structures, normalize
bounded numeric configuration, and sanitize authored terminal text before
creating a private render node. The renderer can then rely on the private
node's TypeScript contract instead of silently dropping or replacing invalid
authored values.

Runtime checks remain where TypeScript cannot establish truth: custom-renderer
outputs, terminal host results, input and protocol decoding, serialized data,
and state-dependent accessibility descriptions.

## TUI Runtime

`createTuiRuntime()` is a facade over collaborators with separate ownership:

- the lifecycle owns phase transitions, lifetime cancellation, startup, and
  idempotent disposal;
- the store owns initialized state, state versions, and message reduction;
- the commit coordinator owns the committed render, terminal size, focus
  restoration, frame writes, and commit ids;
- the diagnostics service owns occurrences and diagnostic-triggered refresh;
- the change channel owns frame/exit publication and cancelled waiters.

Input batching, subscriptions, and effects remain independent coordinators.
This separation keeps transaction order explicit without creating a second
runtime dispatch path.

## Schemas And Versions

Schema versions belong to persisted or exchanged formats: accessible
snapshots, terminal capabilities, diagnostics, prompt results, frames, render
diffs, and interaction transcripts. Internal inspection records, rendering
results, and visual-snapshot helper objects are ordinary in-memory values and
do not carry format versions.

The interaction transcript schema refers to the canonical frame, diff, and
accessibility schemas. Consumers validate transcripts by registering the
published schema artifacts as one linked schema set. This keeps each
serialized contract authoritative without copying its definitions into other
schema files.
