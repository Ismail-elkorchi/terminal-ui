# Architecture

The source tree is organized by responsibility, not by a minimum file count.
A directory remains useful when it establishes a stable dependency boundary:

- `geometry` contains terminal rectangles, sizes, layout tracks, and inset
  contracts shared without depending on rendering.
- `ui-model` contains component-domain data and prepared views shared by
  components, behavior, and rendering.
- `element` contains opaque public element and metadata contracts.
- `component` adapts safe third-party renderer strategies to private renderer
  data without exposing render nodes.
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
  -> public renderer contracts
  -> private renderer model
  -> built-in component, layout, and component-extension factories
  -> renderer implementation
  -> TUI runtime
  -> public testing harness
```

Components and layouts do not import renderer implementation modules.
Renderers do not import component or layout factories. Architecture checks
enforce these directions, prohibit dependency cycles across layers, keep
render-node dispatch in the renderer registry, and prevent the testing
entrypoint from re-exporting package-private modules.

Built-in and third-party components meet at the same opaque `Element` boundary
and enter the same render dispatch. Built-ins use package-private node
constructors because they ship with the renderer; the public `component`
facade adapts third-party measure, layout, render, accessibility, focus, and
pointer strategies without exposing those nodes. This is one extension seam,
not a parallel component model or a second dispatcher.

Frames, measurements, layout results, render targets, focus targets, hit
targets, canvas drawing, and render instrumentation are owned by the public
renderer-contract module. Component options and the private renderer model both
consume those contracts; neither defines public renderer facade types.
The renderer entrypoint is the facade. It names each public symbol it promotes
from renderer internals, so information hiding is enforced at the declaration
boundary. Architecture checks emit the package declarations in memory, resolve
the actual exports of every entrypoint declared in `package.json`, and follow
the referenced declaration graph. Any public declaration path reaching
`renderer/model` fails regardless of source filenames, type syntax, or
re-export depth.

## Element Factories And Rendering

Public factories are the runtime boundary for JavaScript consumers and dynamic
application data. They reject invalid discriminants and structures, normalize
bounded numeric configuration, and sanitize caller-supplied terminal text before
creating a private render node. The renderer can then rely on the private
node's TypeScript contract instead of silently dropping or replacing invalid
caller-supplied values.

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
runtime dispatch path. A reducer result with a different state identity advances
the state version and produces a render candidate. Returning the current state
identity skips rendering unless the transition also requests focus, terminal
geometry changed, or the caller explicitly requests `redraw()`. Effects,
cancellation, exit, and message recording still run for an identity no-op.
Reducers borrow the committed state and must not mutate it; a changed transition
returns a new state identity. This semantic reducer contract keeps generic state
types intact while letting the runtime publish state and frame atomically.
Terminal capabilities are resolved once per runtime and the same snapshot is
used by application context, layout, and output planning.

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
