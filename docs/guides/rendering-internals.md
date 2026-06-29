# Rendering Internals

`terminal-ui` renders through data structures, not terminal side effects.
Widgets describe intent, layout assigns rectangles, renderers write styled
cells into frame buffers, and serializers turn frames or diffs into terminal
output only at the boundary.

The rendering path is:

1. A widget tree is measured and laid out into layout nodes.
2. Widget renderers write `RenderSpan` data into a `FrameBuffer`.
3. The buffer produces a `Frame` with styled cells, source metadata, focus
   targets, hit targets, and an accessible snapshot.
4. `diffFrames()` compares cells and emits changed runs.
5. `renderFramePlain()`, `renderFrameAnsi()`, `renderFrameDebug()`, and
   `renderDiffAnsi()` serialize the chosen frame representation.

## Styled Cells

A frame cell carries visible text, display width, continuation metadata for
wide glyphs, terminal style, optional hyperlink data, and optional source
metadata. The renderer compares these fields structurally, so style-only,
link-only, source-only, and wide-glyph changes are visible to the diff engine.

Renderers should write styled spans instead of preformatted terminal strings.
The buffer sanitizes control sequences, clips by terminal cell width, preserves
Unicode grapheme boundaries, and clears stale continuation cells when content
changes shape.

## Render Spans And Blocks

`RenderSpan` is the smallest styled text unit. `RenderLine` and `RenderBlock`
group spans into terminal-visible rows and blocks. Widgets such as rich text,
tables, scrollback, structured blocks, charts, and command bars use spans so
style survives clipping, wrapping, scrolling, and snapshot generation.

Use render blocks when the artifact is already structured as rows. Use widgets
when the artifact participates in layout, focus, hit targets, accessibility, or
application messages.

## Frame Buffer

`FrameBuffer` is the only supported drawing target for widgets and custom
renderers. It owns clipping, overwrite behavior, wide-cell topology,
sanitization, style preservation, source metadata, and final frame creation.

Built-in renderers, `custom()` renderers, and `canvas()` painters all use the
same buffer path. They must not write to terminal hosts, emit raw ANSI, or
bypass the frame.

## Diff And ANSI Serialization

`diffFrames()` compares frame cells and groups adjacent changes into render
operations. It does not treat a widget tree as the diff unit. Small visual
changes should produce small diff operations.

ANSI serialization is stateful. `renderFrameAnsi()` and `renderDiffAnsi()`
open style and hyperlink state only when needed, close state at safe output
boundaries, and honor terminal color and hyperlink capabilities. Plain and
debug serialization remain separate entrypoints so production output,
snapshot text, and diagnostic control-sequence views do not share hidden flags.

## Themes, Symbols, Layout, Focus, And Hit Targets

Themes resolve semantic tokens to terminal styles. Theme symbols provide
terminal glyph choices for borders, progress, status, and scrollbars. Widgets
may accept local style slots, but renderers decide which slots affect which
parts.

Layout assigns bounds before rendering. Focus targets and hit targets are
renderer-owned data projected from those bounds. The runtime routes keyboard
and mouse input through these targets after rendering; widgets do not inspect
terminal input during render.

## Accessibility And Snapshots

Rendering produces an accessible snapshot beside the visual frame. Built-in
widgets expose roles, labels, values, state, progress, selected rows, and
focused nodes. Custom widgets must expose accessibility or explicitly declare
decorative output.

The testing harness records frames, diffs, focus targets, hit targets, ANSI,
plain text, accessibility JSON, and deterministic preview artifacts. Use these
snapshots to test renderer-visible behavior instead of host-specific terminal
screenshots.

Executable examples:

- `examples/showcase/app.mjs`
- `examples/showcase/preview.mjs`
- `examples/testing/visual-snapshots.mjs`
