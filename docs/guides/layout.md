# Layout

Layout turns a pure widget tree into deterministic rectangles, layers, focus
targets, hit targets, and accessible structure.

Use the shared layout primitives instead of per-widget geometry:

- `stack()` for vertical tracks;
- `row()` for horizontal tracks;
- `grid()` for row/column cells;
- `splitPane()` for resizable-pane shapes;
- `tabs()` for selected-panel layouts;
- `modal()` for centered bounded dialogs;
- `viewport()` for clipped virtual content;
- `surface()`, `absolute()`, and `overlay()` for coordinate-space composition.

Layout options include gap, padding, margin, fixed/percent/fill/content sizing,
min/max dimensions, alignment, justification, overflow, z-index, visibility,
and focus scope. Tiny terminal sizes should produce clipped or empty regions,
not crashes.

Rendering starts after layout. Widgets emit styled spans into a `FrameBuffer`;
the buffer handles clipping, wide glyphs, overwrite behavior, and source
metadata. Diffs and ANSI serialization operate on frames rather than on widget
objects.

Executable examples:

- `examples/tui/render-frame.mjs`
- `examples/tui/installer-wizard.mjs`
- `examples/tui/chat-interface.mjs`
- `examples/tui/monitoring-console.mjs`
