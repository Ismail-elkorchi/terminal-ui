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

Component construction, measurement, layout, painting and semantics are
synchronous. Rendering consumes accepted immutable results, an explicitly
retained previous result, or a pending representation; it never starts or awaits
application preparation. Accepted-layout notifications report committed geometry.

`createTuiPreparedQuery()` coordinates expensive derived work through ordinary
effects and completion messages. Requests carry their source, query and geometry
dependencies, and completions are admitted against the current request and child
lifetime. Application state owns accepted results; runtime work managers own
execution and cancellation. Cooperative preparation checks its abort signal and
yields through the supplied work context. Synchronous preparation APIs drive the
same computation for deliberate small-data or direct-rendering use.

Definitions opt into reuse independently with `reuse.measurement`,
`reuse.layout`, `reuse.paint`, and `reuse.accessibility`. Each selector receives
its readonly model and returns an immutable dependency tuple (or `undefined` to
disable that phase for the instance). The renderer snapshots at most 128 dense
slots and compares them with `Object.is`; opaque resources must be immutable and
replaced when their contents change. This bounds renderer comparison work, not
arbitrary selector execution. Selectors should do bounded, side-effect-free work.
Omitted phases are never reused, including measurements of the same element in a
later frame. Models are not recursively inspected and callbacks are not compared.

```ts
import { defineComponent } from '@ismail-elkorchi/terminal-ui/component';

const badge = defineComponent<{ readonly label: string }>()({
  name: 'example/badge', identity: 'required', structure: 'leaf', semantics: 'semantic',
  accessibleRole: 'status',
  reuse: {
    measurement: model => [model.label],
    layout: () => [],
    paint: model => [model.label],
    accessibility: model => [model.label],
  },
  measure: ({ model }) => ({ minWidth: 0, minHeight: 1, preferredWidth: model.label.length, preferredHeight: 1 }),
  render: ({ model, target }) => { target.write(0, 0, [{ text: model.label }]); },
  accessibility: ({ id, model }) => ({ id, role: 'status', label: model.label }),
});
```

Layout reuse requires matching measurement and layout tuples for the node and all
its descendants. Include focus-target and cursor geometry inputs in `layout`.
Named-slot membership, ordering and semantic paths are renderer dependencies;
parent tuples never conceal changed child measurement/layout. Accessibility
additionally depends on current child outputs and focus-target contracts, and
whole-tree ID, relationship, focus and budget validation still runs. Theme, state,
width policy, allocation, viewport, identity, focus and pointer dependencies are
tracked by the renderer for the phases that receive them.

Paint reuse is limited to leaves: composite before/after-child painting cannot be
captured as an independent reusable patch. Current event callbacks, hit targets,
interaction mappings and accepted-layout notifications always use current inputs.
The renderer owns storage and invalidation; there is no equality escape hatch or
built-in-only model privilege. Built-ins and installed components use this same
contract. A hook reading mutable external state must omit reuse unless every
change is represented in its selected dependencies. The former `retainPaint`
flag is rejected rather than silently mapped to a second retention path.
