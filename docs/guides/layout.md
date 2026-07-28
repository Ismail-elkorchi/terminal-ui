# Layout

Layout turns a pure element tree into deterministic rectangles, layers, focus
targets, hit targets, and accessible structure.

Layout factories are exported from `@ismail-elkorchi/terminal-ui/layout`.
Their primary responsibility is positioning, sizing, clipping, layering, or
geometry-only interaction. They preserve child behavior and accessibility;
they do not become components merely because they contain children or expose a
scroll or resize action that changes geometry.

| Layout factory | Responsibility | Not |
| --- | --- | --- |
| `column()` | Vertical tracks with shared flow options. | A visual panel or semantic control group by itself. |
| `row()` | Horizontal tracks with shared flow options. | A toolbar, menu, or command model. |
| `grid()` | Row/column tracks and named areas for spatial composition. | An accessible data grid or breakpoint policy engine. |
| `splitPane()` | Static pane tracks or caller-controlled divider resizing. | Retaining pane content, persistence, or a window manager. |
| `surface()` | Single-child visual containment, border and title geometry, and background construction. | Multi-child flow; compose children before wrapping. |
| `overlay()` | Multiple children sharing the same bounds and layer order. | Modal behavior or product overlay lifecycle. |
| `absolute()` | One child placed at a relative rectangle. | A layout solver or drag/drop framework. |
| `viewport()` | Clipping and caller-controlled scrolling over one child. | A semantic list, table, editor, or transcript component. |

Interactive `tabs()` and `dialog()` surfaces are components. Their renderers
participate in ordinary layout, but `tabs()` owns selection actions and the
tablist/tab/tabpanel accessibility relationships. `dialog()` owns dialog
semantics, dismissal, modal focus containment, initial focus, and focus
restoration. Those responsibilities, not their child content, keep them in the
component API.

`inspectElement()` reports `layout` for every factory in the table and
`component` for `tabs()` and `dialog()`. This category is private inspection
information; rendering still dispatches by the existing private render-node
kind.

Layout options include gap, padding, margin, fixed/percent/fill/content sizing,
min/max dimensions, alignment, justification, overflow, z-index, visibility,
and focus scope. Tiny terminal sizes should produce clipped or empty regions,
not crashes.

For `surface()`, margin is outside the painted surface, min/max dimensions and
alignment size the surface itself, and padding is inside its border. A shadow
uses the final row and column of the surface's visual bounds.

Without explicit sizes, `column()` stacks children at their measured heights;
use a fill track only for content that should consume remaining rows.

Rendering starts after layout. Renderers emit styled spans into a `FrameBuffer`;
the buffer handles clipping, wide glyphs, overwrite behavior, and source
metadata. Diffs and ANSI serialization operate on frames rather than on element
objects.

See [Rendering internals](./rendering-internals.md) for the frame, diff, and
serialization pipeline that consumes layout output.
See [Components](./components.md) for factories that own control, document,
feedback, and accessibility behavior.

Executable example:

- `examples/testing/harness.mjs`
