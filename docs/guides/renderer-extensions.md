# Renderer Extensions

Renderer extensions are the advanced escape hatch for visuals that cannot be
expressed with the built-in component set. They are not the default application
authoring model.

`terminal-ui` exposes two extension paths:

- `canvas()` from the component layer for bounded drawing through `Canvas2D`;
- `custom()` from the renderer entrypoint for a full renderer protocol.

## Canvas Component

Use `canvas()` when application code only needs to paint inside the rectangle
assigned by layout. A canvas painter receives a safe drawing surface, bounds,
theme, source metadata, and caller-owned state. It cannot measure itself,
manage children, expose custom focus targets, or emit arbitrary host output.

Canvas output is clipped, sanitized, styled, diffed, and projected into
accessibility through the canvas component's label or accessibility metadata.

## Custom Renderer

Import `custom()` from `@ismail-elkorchi/terminal-ui/renderer`.

Use it only when a built-in component is the wrong shape and the renderer needs
to own one or more of:

- measurement;
- styled frame rendering;
- accessibility projection;
- focus targets;
- pointer hit targets.

Custom renderers draw through a write-only `RenderTarget` backed by the same
frame-buffer and span pipeline as built-in renderers. The target exposes bounded
cell, line, block, and clear operations but not frame snapshotting or terminal
output. Custom renderers must not write raw ANSI, mutate terminal hosts, bypass
clipping, bypass text sanitization, or create hidden application state.

The custom render hook receives `focus: 'none' | 'self' | 'descendant'` for
visual treatment. Its accessibility hook receives the exact `focused`
boolean, so ancestor visuals do not become accessibility focus.

Interactive custom renderers must expose accessibility. Pure decoration may
opt into `meta: { accessibility: { decorative: true } }`, but decorative output
must not expose keyboard, text input, focus, or pointer interaction.

## Hit Targets

Pointer interaction is expressed through hit targets emitted during rendering.
A hit target declares stable bounds, accepted pointer event kinds, z-index, an
optional focus intent, and a message function that receives the normalized
pointer event. A custom renderer that wants pointer presses to transfer
keyboard focus must refer explicitly to one of its own focus-target ids. The
renderer resolves that id to the committed focus path; the runtime never
infers focus from matching strings. The runtime routes input to the topmost
matching target after each committed render.

Hit targets are renderer metadata. Normal application code should use
component event props such as `onPress`, `onAction`, and `onScroll`. Editable
controls expose pointer caret and selection gestures through their typed
`onAction` union rather than a renderer-level pointer callback.

## Evidence To Test

A renderer extension should have tests for:

- frame cells and styled spans;
- tiny bounds and clipping;
- Unicode width and control-sequence sanitization;
- focus targets;
- hit targets;
- accessibility;
- high-contrast and no-color output where applicable.

For the frame and diff pipeline, see
[Rendering internals](./rendering-internals.md). For visual-state expectations,
see [Building polished components](./building-polished-components.md).

Executable example:

- `examples/testing/harness.mjs`
