# Layout

Layout turns a pure element tree into deterministic rectangles, layers, focus
targets, hit targets, and accessible structure.

Use the shared layout primitives instead of per-component geometry:

- `column()` for vertical tracks;
- `row()` for horizontal tracks;
- `grid()` for row/column cells;
- `splitPane()` for static pane tracks or controlled divider resizing;
- `viewport()` for clipped virtual content;
- `surface()`, `absolute()`, and `overlay()` for coordinate-space composition.

Interactive `tabs()` and `dialog()` surfaces are components. Their renderers
participate in ordinary layout, but they remain components because of their
selection, focus, and action semantics.

Layout options include gap, padding, margin, fixed/percent/fill/content sizing,
min/max dimensions, alignment, justification, overflow, z-index, visibility,
and focus scope. Tiny terminal sizes should produce clipped or empty regions,
not crashes.

Rendering starts after layout. Renderers emit styled spans into a `FrameBuffer`;
the buffer handles clipping, wide glyphs, overwrite behavior, and source
metadata. Diffs and ANSI serialization operate on frames rather than on element
objects.

See [Rendering internals](./rendering-internals.md) for the frame, diff, and
serialization pipeline that consumes layout output.

Executable example:

- `examples/testing/harness.mjs`
