# Rendering Internals

`terminal-ui` renders through data structures, not terminal side effects.
Public elements describe intent, layout assigns rectangles, renderers write
styled cells into frame buffers, and serializers turn frames or diffs into
terminal output only at the boundary.

The rendering path is:

1. Each opaque element is resolved to its private render node, then the tree is
   measured and laid out into layout nodes.
2. Renderers write `RenderSpan` data into a `FrameBuffer`.
3. The buffer produces a `Frame` with styled cells, clipped graphic placements,
   source metadata, focus targets, hit targets, and an accessible snapshot.
4. `diffFrames()` compares cells and graphic placements and emits changed runs.
5. `renderFramePlain()`, `renderFrameAnsi()`, `renderFrameDebug()`, and
   `renderDiffAnsi()` serialize the chosen frame representation.

The renderer contains its private node model and implementation kernel.
The component authoring core is the single private construction boundary for
generic component nodes. The built-in catalog consumes that public authoring
contract exactly like a package component. Layout factories retain a separate
structural construction boundary. Renderer implementation modules never import those factories
or the TUI runtime. The
renderer resolves each opaque element to its private node before measuring,
arranging, and rendering it. The `tui` source directory contains application and
terminal-session lifecycle rather than frame, layout, or render-node rendering.

The renderer package exposes frame construction and frame/diff serialization.
Leaf and composite definitions use `defineComponent()` from the component
entrypoint, which exposes bounded `RenderTarget`, geometry, measurement,
accessibility, focus, and hit-target contracts. `Canvas2D` remains available
through the canvas component and renderer drawing APIs.
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

## Explicit background inheritance

`TerminalStyle.bg: null` removes an earlier background from style composition
without dropping other style fields. It remains distinct from an omitted `bg`
through validation, canonicalization, equality, and theme resolution. A later
style can restore a concrete or semantic background color.

At each frame-buffer write, `null` resolves to that destination cell's current
background. A wide glyph and its continuation cells use the leading
destination cell's background, preserving the buffer's wide-cell topology.
Only the background is inherited: old foregrounds, attributes,
text, and provenance do not leak into the new cell. With no destination
background, the resulting cell has no explicit background rather than storing
`null` as a color. Both `write()` and `writeCell()` honor the policy; a direct
`createFrameBuffer()` still keeps its existing overwrite semantics for omitted
backgrounds.

This is cell-background inheritance, not paint suppression. Glyphs and padding
continue to paint. It is also separate from region composition: a layer or portal
needs `underlay: 'inheritBackground'` to receive backgrounds from a lower region.
A style cannot bypass that boundary. Ordinary-part overrides can clear native
control fills while later focused or selected styles retain meaningful cues;
see [Themes](./themes.md#inheriting-painted-backgrounds).

Frame snapshots and transcripts preserve the resolved cell colors. An unresolved
`null` in a style sent directly to ANSI serialization has no destination to
sample and behaves as no explicit background, including resetting a prior
background when necessary. It is never interpreted as a terminal color.

## Source Metadata

`FrameCellSource` is the renderer-produced provenance contract for visible
cells. It identifies the producing element (`elementId`, `elementKind`), the
renderer family, cell role, visual part name and type, optional item identity or
zero-based item index, interaction state, and a human-readable description when
that information is available.

Source metadata is JSON-serializable, sanitized before it enters a frame, and
included in frame equality. Private row fingerprints may reject unequal rows
quickly, but an equal fingerprint is always confirmed by exact cell comparison.
Its optional interaction state is limited to focused, hovered, pressed,
selected, disabled, and active; cleanup and transcript validation reject other
values.
Component renderers should create source metadata through
`ComponentRenderInput.frameSource()`, which binds the component identity and accepts
only semantic cell and part metadata. Low-level renderer extensions can use
`frameCellSource()` when they already own the complete provenance record.
Render-node identity and derived-part helpers are renderer implementation
details rather than public authoring contracts.

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
All component definitions receive its write-only
`RenderTarget` contract; frame snapshotting remains inside the renderer kernel.

Every component definition and `canvas()` painter uses that buffer path.
They must not write to terminal hosts, emit raw ANSI, or bypass the frame.

Raster resources are immutable, renderer-owned identities. Graphic placements
remain separate from cells so plain snapshots and accessibility always retain
the component fallback. Region composition clips placements against viewports
and later layers. Terminal commit owns protocol selection, image upload caches,
placement deletion, and session cleanup; portable frame serialization never
guesses terminal graphics support. See [Terminal graphics](./graphics.md).

## Diff And ANSI Serialization

`diffFrames()` compares frame cells and groups adjacent changes into render
operations. It does not treat an element tree as the diff unit. Small visual
changes should produce small diff operations.

ANSI serialization is stateful. `renderFrameAnsi()` and `renderDiffAnsi()`
open style and hyperlink state only when needed, close state at safe output
boundaries, and honor terminal color, text-attribute, and hyperlink capabilities.
Zero color depth does not suppress basic attributes, while depth `1` does not
pretend to provide the sixteen-color palette. Bold and dim are transitioned as
one SGR intensity group because reset `22` clears both. Plain and
debug serialization remain separate entrypoints so production output,
snapshot text, and diagnostic control-sequence views do not share hidden flags.

Runtime frame commits pass the portable `RenderDiff` through a private terminal
output planner. The planner compares absolute and relative cursor movement and
safe line-clear encodings by UTF-8 byte size, then writes one selected payload.
Direct ANSI serialization uses synchronized output only when a host probe or
explicit capability override reports support. Managed full-screen frame commits
also attempt it when support is unknown but terminal-protocol output is available;
unsupported terminals ignore the private mode, while capable terminals avoid
displaying partially applied frames. An explicit unsupported result remains
authoritative. A failed synchronized write that may have committed bytes causes
the runtime to use recovery output for a frame-local cleanup suffix. The suffix closes only state that the selected plan
could have opened: synchronization, a scrolling region, OSC 8, or SGR. A write
reported as failed before starting does not emit cleanup. The terminal baseline
remains untrusted after an indeterminate write and the next successful commit is
a full rewrite. Render diffs and transcripts remain terminal-neutral.

## Themes, Symbols, Layout, Focus, And Hit Targets

Themes resolve semantic tokens to terminal styles. Theme symbols provide
terminal glyph choices for borders, progress, status, and scrollbars.
Components may accept typed root, part, and visual-state styles through their
top-level `styles` option; each component contract defines its available part
and state names.
Scrollbar helpers use one shared grammar: track cells, thumb cells,
axis, producing element, and interaction state are source-marked in the frame,
while the theme supplies only the generic track/thumb symbols and tokens.

Layout assigns bounds before rendering. Focus targets and hit targets are
definition- or layout-produced data derived from those bounds. The runtime routes keyboard
and mouse input through these targets after rendering; component hooks do not inspect
terminal input during render.

## Accessibility And Snapshots

Rendering produces an accessible snapshot beside the visual frame. Semantic
components expose roles, labels, values, state, progress, selected rows, and
focused nodes. Decorative components are noninteractive leaves and do not enter
the accessibility tree.

The testing harness records frames, diffs, focus targets, hit targets, ANSI,
plain text, accessibility JSON, and deterministic preview artifacts. Use these
snapshots to test renderer-visible behavior instead of host-specific terminal
screenshots.

Executable example:

- `examples/testing/harness.mjs`

## Region ownership through clipping boundaries

One renderer-owned traversal paints all descendants through the region
compositor, including children of a viewport. Layout resolves the viewport's
scrollbar-adjusted content clip in the same pass as child allocation. Ordinary region
transitions preserve that clip and its graphics; they do not switch to a
cell-only offscreen traversal. Portals explicitly reset placement and clipping
to the retained terminal-root viewport after checking their anchor against the
inherited clip. They own regions even when their effective z-index is unchanged. Hit and focus targets belong to the exact region
that produced their layout, even when several overlapping regions share a
z-index. Retained leaf paint invokes the same bounded, auto-closed paint scope
as a fresh leaf. Reusing visual storage does not retain old message callbacks.

Viewport indicators query only descendant region cells and shared-buffer
write coverage instead of flattening content into a temporary frame. Unrelated
siblings neither suppress indicators nor add snapshot work. Publication remains transactional: layout
lifecycle callbacks and accepted interaction state follow successful terminal
output, and failed candidates cannot mutate the previously accepted frame.
