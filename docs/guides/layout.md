# Layout

Layout turns a pure element tree into deterministic rectangles, layers, focus
targets, hit targets, and accessible structure.

Layout factories are exported from `@ismail-elkorchi/terminal-ui/layout`.
Their primary responsibility is positioning, sizing, clipping, layering, or
geometry-only interaction. They preserve child behavior and accessibility;
they do not become components merely because they contain children or expose a
scroll or resize action that changes geometry.

| Layout factory | Use it for |
| --- | --- |
| `column()` | Vertical tracks with shared flow options. |
| `row()` | Horizontal tracks with shared flow options. |
| `flow()` | Multi-line horizontal or vertical flow from measured child sizes. |
| `measuredColumn()` | A retained variable-height window rendered as child elements with stable identities. |
| `grid()` | Row/column tracks and named areas for spatial composition. |
| `splitPane()` | Static pane tracks or caller-controlled divider resizing. |
| `surface()` | Single-child visual containment, border and title geometry, and background construction. |
| `overlay()` | Multiple children sharing the same bounds and layer order. |
| `absolute()` | One child placed at a relative rectangle. |
| `anchored()` | One child placed from a cursor or target anchor with fallback sides. |
| `viewport()` | Clipping and caller-controlled offsets over a self-measured child. |

## Component boundaries

Interactive `tabs()` and `dialog()` surfaces are components. Their definitions
participate in ordinary layout, but `tabs()` owns selection actions and the
tablist/tab/tabpanel accessibility relationships. `dialog()` owns dialog
semantics, dismissal, modal focus containment, initial focus, and focus
restoration. Those responsibilities, not their child content, keep them in the
component API.

`inspectElement()` reports `layout` as the factory category for every entry in
the table and `component` for `tabs()` and `dialog()`. It also reports the
stable factory name, input capabilities, metadata, and public child structure.
The category records which public API created the element. Component names are
diagnostic identifiers and never select renderer behavior. Inspection exposes
neither package origin nor private node data.

## Sizing and flow

Layout options include gap, padding, margin, fixed/percent/fill/content sizing,
min/max dimensions, alignment, justification, overflow, z-index, visibility,
and focus scope. Tiny terminal sizes should produce clipped or empty regions,
not crashes.

Factories validate shared flow semantics and own retained inset and track data.
Mutating those input insets or tracks after construction cannot change layout.
Cell counts, gaps, insets, content bounds, and fill weights are safe integers;
counts are non-negative and fill weights are positive. Percent tracks accept
finite values from 0 through 100. `decodeLayoutFlowOptions()` provides the same
shared validation for component authors without decoding unrelated options.

For `surface()`, margin is outside the painted surface, min/max dimensions and
alignment size the surface itself, and padding is inside its border. A shadow
uses the final row and column of the surface's visual bounds.

Without explicit sizes, `column()` stacks children at their measured heights;
use a fill track only for content that should consume remaining rows.

`defineBreakpoints()` returns an owned, deeply frozen map of non-overlapping
column/row ranges. Boundaries and viewport dimensions are non-negative safe
integer cell counts. `viewportVariant()` selects the matching range, and
`responsive()` evaluates its corresponding variant. Direct maps follow the
same validation as defined maps; use a `default` variant for uncovered sizes.

## Large collections and scrolling

Variable-height feeds create their row index outside `view()` and retain it
until item membership or measurements change. `createMeasuredCollection()`
performs the initial linear construction. Append, prepend, replacement, and
removal operations return persistent collection versions, while
`measuredWindow()` queries only the indexed rows intersecting the viewport.
`measuredColumn()` then creates elements only for those visible entries.

Use `createMeasurementState()` with that same collection when heights are initially
estimates. `measurementRequests(state, overscanRows)` selects only unmeasured
visible items and bounded overscan. Each request retains the immutable content
identity and geometry it was issued for. In an effect, `measureElement()` runs
the existing component measurement implementation; return a batch of
`{ request, rows }` through an ordinary completion message and apply it using
`acceptMeasurements()`. Do not measure or start work inside `view()`.

`updateMeasurementState()` reconciles append, prepend, replacement, removal,
viewport changes and scrolling, preserving the logical item/intra-item anchor.
Set `followTail` explicitly to follow appended content. Its geometry includes the
actual `columns` and `rows` constraints passed to `measureElement()`, separately
from `viewportRows`, which selects the visible window. Changing only the window
height retains accepted measurements and valid outstanding requests. Change the
row constraint too when content is measured against the new viewport height;
height-dependent components and vertical flows can produce different heights.
Geometry also includes an owned revision identity: change that identity when the
theme, terminal text-width profile, or other height-affecting policy changes. Content
changes replace the immutable collection value. Invalidation keeps old heights
as estimates without scanning or measuring the full history. Stale replies are
rejected, and accepted unchanged heights produce no further requests.

Pass `request.geometry` to `measureElement()` and the same geometry's `rows` as
`measuredColumn()`'s `measurementRows` option. This retains the preparation height
constraint while validating entries inside the potentially much taller scroll
content. Its actual layout width must match the prepared `columns` constraint.
Without `measurementRows`, entries are measured at the column's layout height.

`measuredColumn()` still requires exact heights. While requested entries are
pending, explicitly display a pending representation, or a previously accepted
window at its original geometry. Never present estimates as measured content.
A single custom measurement callback is synchronous and cannot be preempted;
yield between requested items in effect work and keep each callback bounded.
`examples/tui/measured-feed.ts` demonstrates this ownership and convergence.

A `viewport()` with `onScroll` also participates in focus reveal. Components
inside it publish logical focus targets even when those targets are currently
clipped. When Tab or Shift+Tab reaches one of them, the runtime sends the
viewport a `ScrollRequest` with `source: 'focus'` and the nearest controlled
offset that reveals the target. The caller remains the sole owner of scroll
state; a passive viewport does not become scrollable merely because it clips a
focusable child.

## Rendering output

Rendering starts after layout. Renderers emit styled spans into a `FrameBuffer`;
the buffer handles clipping, wide glyphs, overwrite behavior, and source
metadata. Diffs and ANSI serialization operate on frames rather than on element
objects.

See [Rendering internals](./rendering-internals.md) for the frame, diff, and
serialization pipeline that consumes layout output.
See [Components](./components.md) for factories that own control, document,
feedback, and accessibility behavior.

See the executable [testing harness example](../../examples/testing/harness.mjs)
for layout in a rendered frame.

## Suppressing paint while keeping a live subtree

Set `meta: { paint: 'suppressed' }` on any native component, custom component,
or structural layout element to keep its geometry and behavior without
painting it. Omit `paint` for the ordinary behavior. Suppression is inherited
through the logical subtree, including portals and separately layered children;
a descendant cannot reenable painting.

```ts
import { column, textInput } from '@ismail-elkorchi/terminal-ui';
import { ignoreMessage } from '@ismail-elkorchi/terminal-ui/component';

const retainedEditor = column([
  textInput({
    id: 'retained-editor',
    meta: { accessibleName: 'Retained editor' },
    state: { text: 'Still editable', cursor: 14 },
    onTransition: () => ignoreMessage()
  })
], { meta: { paint: 'suppressed' } });
```

Measurement, layout allocation, focus and Tab traversal, keyboard/text/paste
input, pointer targets, accessibility, controlled state, and accepted `onLayout`
notifications continue normally. A focused suppressed input still receives
input, but contributes neither its hardware cursor nor focus styling. Revealing
it by removing the metadata paints the current controlled value.

Suppressed nodes produce no cells, fills, clears, borders, shadows, graphics,
region underlays, or viewport backdrops, and their component paint hooks do not
run. Visible backing content is preserved. When an already painted subtree is
suppressed, the next accepted frame removes its previous cells and graphics;
revealing it restores the current content through the normal retained renderer.

This is a visual-only policy, not a secrecy or input-blocking boundary: values
remain in application state and accessibility output, and invisible hit targets
remain active. Use ordinary state, focus, and accessibility policies when those
behaviors should change. `meta.layer.visible: false`, inert subtrees, and a
composite slot allocated `null` have different participation semantics; they
are not substitutes for paint-only suppression.

## Viewport layers and clipping

A viewport clips and scrolls content without introducing a stacking context.
Descendants keep their effective layers, so an open combobox popup inside
`viewport(column([combobox(...), text(...)]), { id: 'content' })` paints above
later base-layer text and keeps its option and outside-press targets. Nested
viewports use the intersection of their content rectangles; scrollbar gutters
are excluded from ordinary descendant painting, graphics, pointer targets and focus
geometry. Scroll offsets are applied once during child allocation.

Portals use the terminal-root viewport for placement and clipping, as specified
by the public `portal()` contract. Their anchors retain the original allocation
and scroll translation: a partially clipped trigger can open a popup outside
its crop, but both the owning allocation and anchor must intersect the inherited
clip. A fully clipped owner/anchor or hidden slot cannot spawn a popup. Zero-size
intrinsic portal allocations are checked as insertion points. Portal
regions retain their own target ownership even at the same z-index as a clipped
ancestor. A layer explicitly declaring `backdrop: 'viewport'` still owns a
terminal-wide backdrop. Empty-cell scroll
indicators never replace already occupied cells, including explicit blanks and
wide-grapheme continuation cells.

Clipping an enabled focused control does not implicitly blur it. Its focused
semantic ancestor branch remains in the accessibility snapshot while the
caller prepares new layout or reveals it; unrelated clipped branches remain
omitted. This preserves editing and focus agreement without admitting
offscreen pixels, pointer targets, cursors, or hidden portals. Explicitly
hidden, inert and decorative content keeps its existing exclusion policy.
