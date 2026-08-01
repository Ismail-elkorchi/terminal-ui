# Rendering Internals

`terminal-ui` renders through data structures, not terminal side effects.
Public elements describe intent, layout assigns rectangles, renderers write
styled cells into frame buffers, and serializers turn frames or diffs into
terminal output only at the boundary.

The rendering path is:

1. Each opaque element is resolved to its private render node, then the tree is
   measured and laid out into layout nodes.
2. Renderers write `RenderSpan` data into a `FrameBuffer`.
3. The buffer produces a `Frame` with styled cells, source metadata, focus
   targets, hit targets, and an accessible snapshot.
4. `diffFrames()` compares cells and emits changed runs.
5. `renderFramePlain()`, `renderFrameAnsi()`, `renderFrameDebug()`, and
   `renderDiffAnsi()` serialize the chosen frame representation.

The renderer contains its private node model and implementation kernel.
Component and layout factories construct private render nodes through shared
element conversion and metadata helpers; they convert callbacks into internal
input handlers. Renderer implementation modules never import those factories
or the TUI runtime. The
renderer resolves each opaque element to its private node before measuring,
arranging, and rendering it. The `tui` source directory contains application and
terminal-session lifecycle rather than frame, layout, or render-node rendering.

The renderer package exposes frame construction, frame/diff serialization, and
output projection. Leaf and composite component extensions use `custom()` from
the component entrypoint, which exposes bounded `RenderTarget`, geometry,
measurement, accessibility, focus, and hit-target contracts. `Canvas2D`
remains available through the canvas component and renderer drawing APIs.
Private render nodes and region target indexes remain implementation details.

The ordinary public render function returns only a frame. Focus regions,
pointer regions, private render nodes, and region target indexes are produced
only by the renderer's internal render path and are not properties of the
public result.

## Styled Cells

A frame cell carries visible text, display width, continuation metadata for
wide glyphs, terminal style, optional hyperlink data, and optional source
metadata. The renderer compares these fields structurally, so style-only,
link-only, source-only, and wide-glyph changes are visible to the diff engine.

Renderers should write styled spans instead of preformatted terminal strings.
The buffer sanitizes control sequences, clips by terminal cell width, preserves
Unicode grapheme boundaries, and clears stale continuation cells when content
changes shape.

## Source Metadata

`FrameCellSource` is the renderer-produced provenance contract for visible
cells. It identifies the producing element (`elementId`, `elementKind`), the
renderer family, cell role, visual part name and type, optional item identity or
zero-based item index, interaction state, and a human-readable description when
that information is available.

Source metadata is JSON-serializable, sanitized before it enters a frame, and
included in frame equality and fingerprinting.
Its optional interaction state is limited to focused, hovered, pressed,
selected, disabled, and active; cleanup and transcript validation reject other
values.
Use `renderNodeFrameSource()` for cells produced from a render node,
`frameCellSource()` for cells produced by the renderer without a render node, and `frameSourcePart()` when
deriving a more specific part from an existing source.

## Render Spans And Blocks

`RenderSpan` is the smallest styled text unit. `RenderLine` and `RenderBlock`
group spans into terminal-visible rows and blocks. Renderers for rich text,
tables, log viewers, structured blocks, charts, and command bars use spans so
style survives clipping, wrapping, scrolling, and snapshot generation.

The shared span helpers measure spans by terminal cell width, clip and wrap by
grapheme boundaries, pad and align lines, and compact adjacent spans only when
style, hyperlink, and source metadata match.
`clipRenderSpans()` supports end and middle ellipsis modes. Use middle clipping
for compact identifiers or hierarchical labels where both the start and end are
useful; use wrapping for prose.

## Measurement

`Measurement` is the canonical measurement shape for renderers. The
measurement helpers normalize, clamp, and combine minimum, preferred, and
optional maximum sizes for vertical, horizontal, overlay, and bounded layout
pressure. Text, span, line, and block measurement use the same terminal cell
rules as rendering.

Use render blocks when the artifact is already structured as rows. Use
components when the artifact participates in layout, focus, hit targets,
accessibility, or application messages.

## Frame Buffer

`FrameBuffer` owns clipping, overwrite behavior, wide-cell topology,
sanitization, style preservation, source metadata, and final frame creation.
Built-in renderers and custom renderers receive its write-only `RenderTarget`
contract; frame snapshotting remains inside the renderer kernel.

Built-in renderers, `custom()` renderers, and `canvas()` painters all use that
same buffer path. They must not write to terminal hosts, emit raw ANSI, or
bypass the frame.

## Diff And ANSI Serialization

`diffFrames()` compares frame cells and groups adjacent changes into render
operations. It does not treat an element tree as the diff unit. Small visual
changes should produce small diff operations.

ANSI serialization is stateful. `renderFrameAnsi()` and `renderDiffAnsi()`
open style and hyperlink state only when needed, close state at safe output
boundaries, and honor terminal color and hyperlink capabilities. Plain and
debug serialization remain separate entrypoints so production output,
snapshot text, and diagnostic control-sequence views do not share hidden flags.

Runtime frame commits pass the portable `RenderDiff` through a private terminal
output planner. The planner compares absolute and relative cursor movement and
safe line-clear encodings by UTF-8 byte size, then writes one selected payload.
Synchronized output is conservative: it is used only when a host probe or
explicit capability override reports support. A failed synchronized write
causes the runtime to attempt the matching end sequence before surfacing the
write failure. Render diffs and transcripts remain terminal-neutral.

## Themes, Symbols, Layout, Focus, And Hit Targets

Themes resolve semantic tokens to terminal styles. Theme symbols provide
terminal glyph choices for borders, progress, status, and scrollbars.
Components may accept typed root, part, and visual-state styles through
`meta.styles`; each component contract defines its available part names.
Scrollbar renderers use one shared grammar: track cells, thumb cells,
axis, producing element, and interaction state are source-marked in the frame,
while the theme supplies only the generic track/thumb symbols and tokens.

Layout assigns bounds before rendering. Focus targets and hit targets are
renderer-produced data derived from those bounds. The runtime routes keyboard
and mouse input through these targets after rendering; renderers do not inspect
terminal input during render.

## Accessibility And Snapshots

Rendering produces an accessible snapshot beside the visual frame. Built-in
components expose roles, labels, values, state, progress, selected rows, and
focused nodes. Custom renderers must expose accessibility or explicitly
declare decorative output.

The testing harness records frames, diffs, focus targets, hit targets, ANSI,
plain text, accessibility JSON, and deterministic preview artifacts. Use these
snapshots to test renderer-visible behavior instead of host-specific terminal
screenshots.

Executable example:

- `examples/testing/harness.mjs`
