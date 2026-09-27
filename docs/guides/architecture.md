# Architecture

The source tree is organized by responsibility, not by a minimum file count.
A directory remains useful when it establishes a stable dependency boundary:

- `foundation` contains package-wide identity, validation, and bounded JSON
  operations that depend on no UI subsystem.
- `geometry` contains terminal rectangles, sizes, layout tracks, and inset
  contracts shared without depending on rendering.
- `text` owns terminal-aware documents, edits, selections, grapheme indexes,
  wrapping, search, and width measurement.
- `visual` owns renderer-neutral terminal styles, styled render content, borders,
  surface appearance, and cell-source identity.
- `collection` owns reusable collection identity, snapshots, measured
  collections, and visible-window queries.
- `interaction` owns renderer-neutral input, focus, navigation, selection, and
  scrolling contracts.
- `behavior` owns controlled component state, transitions, reducers, and
  derived views.
- `element` contains opaque public element and metadata contracts.
- `component` owns `defineComponent()`, the component-authoring contracts, and
  bounded helpers shared by built-in and package components.
- `components` is the built-in catalog and component-domain contracts. It is an
  ordinary consumer of `component`.
- `layout` owns public element composition and geometry factories.
- `renderer` exposes frame, measurement, drawing, and serialization contracts;
  its `internal` subtree contains the private render tree and render pipeline.
- `protocol`, `input`, and `host` own terminal protocol encoding, input
  decoding, and terminal endpoint authority respectively.
- `tui` coordinates application state, input, rendering, effects, sources, and
  terminal publication. `prompts` builds short-lived prompt sessions on the
  lower-level host and input contracts.
- `transcript` and `testing` own persisted interaction evidence and deterministic
  consumer-facing test tools.

Single-purpose contracts that do not establish such a boundary stay beside
their consumers. In particular, the TUI message-source vocabulary lives with
neutral interaction message semantics rather than in a one-file
`runtime-model` category. Shared protocol types have one declaration and are
re-exported where a focused entrypoint needs them.

## Dependency Flow

The principal dependency flow is:

```text
geometry, collection, interaction, text, visual, and behavior
  -> public component, renderer, and layout contracts
  -> component definitions and layout factories
  -> one private node construction boundary and private render tree
  -> renderer implementation
  -> TUI runtime
  -> public testing harness
```

Components and layouts do not import renderer implementation modules.
Renderers do not import component or layout factories. Architecture checks
enforce these directions, prohibit dependency cycles across layers, keep
structural renderer dispatch centralized, and prevent the testing
entrypoint from re-exporting package-private modules.

Built-in and package-defined components are authored at the same public
boundary and enter the same generic component lifecycle. `defineComponent()` accepts safe
measurement, layout, drawing, accessibility, focus, and pointer strategies
without exposing private nodes. Shipping inside the package grants no extra
component or layout capability.

Frames, measurements, layout results, render targets, focus targets, hit
targets, canvas drawing, and render instrumentation are owned by the public
renderer contracts. Component options and the private render tree both
consume those contracts; neither defines public renderer facade types.
The renderer entrypoint is the facade. It names each public symbol it promotes
from renderer internals, so information hiding is enforced at the declaration
boundary. Architecture checks inspect the emitted package declarations, resolve
the actual exports of every entrypoint declared in `package.json`, and follow
the referenced declaration graph. Any public declaration path reaching
`renderer/internal/render-tree` fails regardless of source filenames, type syntax, or
re-export depth.

## Element Factories And Rendering

Public factories are the runtime boundary for JavaScript consumers and dynamic
application data. They reject invalid discriminants and structures, normalize
bounded numeric configuration, and sanitize caller-supplied terminal text before
creating a private render node. The renderer can then rely on the private
node's TypeScript contract instead of silently dropping or replacing invalid
caller-supplied values.

Factories return frozen, opaque `Element<TMessage>` handles. Applications
compose them; the renderer resolves private nodes when it measures and paints.
Use `inspectElement()` for a read-only view of an element's identity, role,
declared state, and child structure before rendering. It does not expose
callbacks, private props, or sensitive component models.

Runtime checks remain where TypeScript cannot establish truth: component hook
output, terminal host results, input and protocol decoding, serialized data,
and state-dependent accessibility descriptions.

## TUI Runtime

`createTuiRuntime()` is a facade over collaborators with separate ownership:

- the lifecycle owns phase transitions, lifetime cancellation, startup, and
  idempotent disposal;
- the transition queue serializes input, reduction, candidate construction,
  output receipt, and publication;
- the reducer plans state and effects; the commit coordinator owns one
  committed record with state, frame, focus, terminal size, and commit id;
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
Terminal capabilities form one runtime snapshot used by application context,
layout, input decoding, and output planning. A terminal suspension may replace
that snapshot atomically after re-observing a changed host or PTY.

## Static And Runtime Contracts

TypeScript definitions are the canonical contracts for values created inside
an application. Runtime validation remains only at trust boundaries where
types cannot establish truth, such as deserialized transcripts, component hook
output, terminal adapters, and JavaScript callers.

Interaction transcripts are the persisted format. They carry one top-level
`formatVersion`; nested frames, diffs, snapshots, diagnostics, and prompt
results are ordinary typed values and do not coordinate independent versions.
`validateTranscript()` checks both structure and replay semantics before a
transcript is used.

## Feature And Tool Ownership

Complex built-in components keep their options and implementation together.
For example, `components/data-table` separates the model, width planning,
painting, hit targets, and accessibility; `components/text-area` also owns
projection, decorations, and document layout. The `components/shared` directory
contains helpers used by several features. Pure state transitions remain in
`behavior`. Public category entrypoints such as `components/forms.ts` curate
exports from those owners.

Public component authoring contracts live in `component/contracts.ts`.
`component/internal` owns compilation, instance admission, slot composition, and
the private renderer adapter. Internal imports name the implementation or
contract they need directly. Public entrypoints serve package consumers; using
a re-export-only public entrypoint as an internal runtime dependency fails the
architecture check. Both runtime and type dependency cycles are rejected.

Under `tui`, `input` owns arrival ordering, decoding, ambiguity deadlines, and
pending character bindings. `commit` owns reduction and publication, including
startup and post-commit effects. `lifecycle` owns cancellation and bounded
cleanup. Runtime composition connects these collaborators through the same
serialized dispatch queue.

Emulator scenarios and pinned installers live in `scripts/emulator`, with
shared subprocess, image, environment, and archive handling in its `support`
directory. Performance and package tooling have their own directories. CI and
release verification call the same emulator workflow, passing the checkout ref,
Node version, artifact name prefix, and retention duration explicitly.

Unit tests live under `tests/unit/<subsystem>`. Colocated `src/**/*.test.ts`
tests cover private implementation contracts; shared test utilities belong in
`tests/support`, while `tests/package/support` is specific to package checks.
Source tests compile into `.artifacts/test-build` and import production code
from `dist`. Packed consumer checks reject tests, fixtures, and workspace
artifacts in the package manifest.

## Preparation And Paint Retention

Every component definition may provide `prepare({ model, id, signal, yield })`.
The TUI runtime awaits preparation before measurement and painting. Long work
must check `signal` and call `yield()` to cooperate with the host scheduler.
Cancellation prevents publication of an unfinished candidate; failures carry
the component identity and the `prepare` execution phase. Direct synchronous
rendering does not run preparation, so rendering must support an unprepared
model as well. Prepared resources are caches owned by the component.

Leaf definitions may opt into `retainPaint: true` when painting is a pure
function of the immutable render inputs. The renderer owns cache storage and
invalidation for model, geometry, theme, width profile, styles, focus, and
pointer state. Preparation must not change the visible result for otherwise
equal render inputs. Definitions without this opt-in paint on every render.
The explicit `styles` input lets a component include caller styles in a local
cache key without hidden registration. Built-in and externally installed
components use these same contracts.
