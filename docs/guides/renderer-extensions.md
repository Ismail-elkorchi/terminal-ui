# Renderer Extensions

Renderer extensions are the advanced escape hatch for visuals that cannot be
expressed with the built-in component set. They are not the default application
component model.

`terminal-ui` exposes two levels of extension:

- `canvas()` from the built-in component catalog for bounded drawing through
  `Canvas2D`;
- `custom()` and `customComposite()` from the component-library entrypoint for
  reusable renderer extensions.

## Canvas Component

Use `canvas()` when application code only needs to paint inside the rectangle
assigned by layout. A canvas painter receives a safe drawing surface, bounds,
theme, source metadata, and caller-controlled state. It cannot measure itself,
manage children, expose custom focus targets, or emit arbitrary host output.

Canvas output is clipped, sanitized, styled, diffed, and represented in
accessibility output through the canvas component's label or accessibility metadata.
Canvas points use local, zero-based terminal-cell coordinates. The drawing
surface converts them to the one-based row and column coordinates of its
assigned terminal rectangle. Coordinates and sizes must be finite integers;
sizes and radii must also be non-negative.

`brailleSubcell(columnSubcell, rowSubcell)` addresses a local Braille grid with
two subcell columns and four subcell rows per terminal cell. A canvas that is
`width` cells by `height` cells therefore has a `2 * width` by `4 * height`
subcell grid. The containing local terminal cell is
`floor(columnSubcell / 2), floor(rowSubcell / 4)`; the remainders select one of
the cell's eight Braille dots. Coordinates outside the canvas are clipped like
other drawing operations.

## Custom Renderer

Import `custom()` from `@ismail-elkorchi/terminal-ui/component`.

Use it only when a built-in component is the wrong shape and the renderer needs
to own one or more of:

- measurement;
- styled frame rendering;
- accessibility output;
- focus targets;
- pointer hit targets.

Custom renderers draw through a write-only `RenderTarget` backed by the same
frame-buffer and span pipeline as built-in renderers. The target exposes bounded
cell, line, block, and clear operations but not frame snapshotting or terminal
output. Custom renderers must not write raw ANSI, mutate terminal hosts, bypass
clipping, bypass text sanitization, or create hidden application state.

The custom render hook receives `focus: 'none' | 'self' | 'descendant'` for
visual treatment. Its accessibility hook receives the exact `focused`
boolean, so ancestor visuals do not become accessibility focus. When a custom
renderer has several focus targets, both hooks also receive
`focusedTargetId`, identifying the target that currently owns focus.

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

## Custom Composite Renderer

Use `customComposite()` when a new container needs an application-defined
measurement or child arrangement. Its measurement and layout hooks receive
opaque child measurements and the active text-width profile. Layout returns one
bounded rectangle per child. The framework renders those
children and preserves their accessibility, focus, pointer targets, clipping,
layers, source metadata, and message union. The optional render hook paints the
container before its children through the bounded `RenderTarget`.
The accessibility hook receives the visible child accessibility nodes and may
return them as part of its own semantic structure.

Composite extensions cannot inspect private render nodes, write to a terminal
host, retain hidden state, omit child bounds, or place child bounds outside the
container. Caller state remains an explicit input.

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
