# Breaking Changes

`terminal-ui` is pre-alpha. Contracts are replaced in place when a stronger
model removes invalid states or clarifies ownership. There are no compatibility
aliases, legacy readers, or migration shims.

This guide describes the current breaking architecture pass. Update an
application by adopting the new owner for each concern rather than translating
old field names mechanically.

## Input Identity

Keyboard input uses normalized key events and structural triggers. Bind a
printable key as `key: 'c'` with `modifiers: { ctrl: true }`; do not use encoded
names such as `ctrlC`. Plain and modified triggers are distinct, and enhanced
keyboard press, repeat, and release phases are accepted only when the active
terminal profile negotiated them.

Pressed-key tracking keeps protocol identity separate from binding and text
semantics. `PressedKeyIdentity` uses the Kitty primary key code and location
when available, or the normalized logical key and location for legacy input.
Modifiers are the latest event snapshot, not part of identity. Shifted and
base-layout alternates remain shortcut-matching data, while `committedText`
remains text input. Unknown Kitty functional keys retain their distinct raw key
code instead of collapsing into one pressed key.

Callbacks that may decline an event return `MessageResolution<TMessage>`. Use
`ignoreMessage()` for the declined case. `undefined`, `null`, primitives,
arrays, tuples, and objects remain valid application messages.

## Controlled Components

Components emit semantic interaction actions through `onAction`. Reducer-only
commands remain in `@ismail-elkorchi/terminal-ui/behavior`; they are not
presented as events a component can emit. Keep controlled state in the
application, pass actions to the matching reducer, and derive component input
with the matching presentation function.

Number input now presents its editable text, cursor, selection, parsed value,
and discriminated validity together. Parsing and formatting use the same
grammar. Progress is a discriminated `determinate` or `indeterminate` mode, so
an authored value cannot conflict with an indeterminate frame.

Menu records are structural variants: `action`, `check`, or non-empty
`submenu`. Component callbacks emit menu interaction actions; application
commands and side effects remain caller-controlled.

## Collections And Windows

Large list, table, and tree inputs use immutable complete or windowed
collection projections. A window records its stable global start and total;
records retain stable IDs and indices. Replace a prepared projection whenever
membership, ordering, or projected values change. Do not mutate the source
array and expect retained indexes to update.

Passive and scrollable state/presentation variants are separate. Use the
scrollable variant only when the application stores `ScrollState` and handles
the component's scroll action. Filtering a partial remote window remains an
application responsibility.

## Renderer Boundary

Normal applications author opaque `Element<TMessage>` values through
components and layout factories. The renderer package exposes supported frame,
span, canvas, measurement, layout, and custom-renderer contracts; projection
diagnostics and routing algorithms are private or testing-owned.

Use `custom()` for a leaf renderer and `customComposite()` when a renderer must
measure, place, and render authored children. Composite children stay opaque to
the extension and retain their normal focus, pointer, and accessibility
semantics.

`RenderDiff` schema version 2 is a terminal-independent operation algebra:

- `write` places styled spans at an absolute row and column;
- `clearRect` clears a rectangle;
- final cursor state is structural metadata.

Cursor movement, erase-line selection, synchronized output, and ANSI encoding
are output-planning decisions and are not persisted as render operations. Old
render-diff variants and version-1 readers were removed.

Terminal row movement follows the same boundary. When `scrollRegion` support is
established, the TTY frame planner may move a matching row region and serialize
an ordinary canonical repair diff. Unknown or unsupported terminals serialize
the original absolute diff. Row movement is never persisted in transcripts and
does not change backend-neutral diff replay.

## Effects And Event Sources

Effects have finite active and queue limits. Configure `TuiEffectPolicy` when
the defaults do not fit the workload. `parallel`, `enqueue`, `keep-first`, and
`replace` have bounded execution semantics; a replacement receives a finite
handoff grace period. A multi-message effect result is applied as one ordered
state transaction with at most one resulting frame commit.

Event sources have a stable `id`, explicit `generation`, and `sequential` or
`latest` delivery. Increment the generation to replace or restart one logical
source. Duplicate IDs are rejected. Completed and failed generations do not
restart until their generation changes or they leave and re-enter the
subscription set.

Effects and sources receive abort signals. Implementations must observe them,
but the run lifecycle also applies a finite cleanup grace period so a
non-cooperative task cannot indefinitely delay terminal restoration.

## Run And Cleanup

Runtime startup is transactional: state and the first frame become observable
only after the first host commit succeeds. Capability, session, setup, runtime,
input, cleanup, and restoration failures return typed `TuiExit` errors.

`runTui(..., { lifecycle: { defaultTimeoutMs } })` controls bounded startup,
cleanup, restoration, flush, and host-disposal phases. Cleanup requests
cancellation first, then restores terminal
protocols after the bound. Runtime disposal, `onExit`, or restoration failures
make the overall exit an error while preserving the last available state and
accessible snapshot.

## Schemas

Diagnostic content uses `fingerprint` for canonical content identity.
Interaction transcripts store `DiagnosticOccurrence` records with a distinct
owner-local `id` and `sequence`; equal diagnostic content is no longer erased
by content-based deduplication.

Frame-cell provenance now uses `elementId`, `elementKind`, `rendererFamily`,
`cellRole`, `partName`, `partType`, `itemId`, `itemIndex`,
`interactionState`, and `description`. The previous owner, generic role, part,
state, and label fields are not accepted.

The frame schema is `terminal-ui.tui-frame.v2`, the render-diff schema is
`terminal-ui.render-diff.v3`, and the interaction transcript schema is
`terminal-ui.interaction-transcript.v4`. Transcript commits embed the current
frame and diff versions. This release intentionally has no readers for the
superseded versions. Other schema version `1` identifiers continue to denote
their current, unrelated contracts; they are not compatibility promises.
