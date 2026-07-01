# Custom Widgets

`terminal-ui` has two extension paths:

- `custom()` for a full widget renderer contract;
- `canvas()` for low-level drawing inside a bounded rectangle.

Use `custom()` when built-in widgets are not the right shape and the widget
needs to own measurement, layout, rendering, accessibility, focus targets, or
hit targets. A custom renderer can:

- measure or lay out itself;
- render styled spans through `FrameBuffer`;
- expose accessibility;
- expose focus targets;
- expose hit targets;
- receive caller-owned state.

Custom widgets must not write directly to terminal hosts and must not emit raw
ANSI. Rendering goes through the same buffer, clipping, Unicode-width,
sanitization, diff, and accessibility pipeline as built-in widgets.
When a custom renderer provides `measure()`, `content` layout tracks use that
measurement the same way they use built-in widget measurements. If a custom
renderer omits measurement, it is treated as a fixed no-measure visual and
contributes zero intrinsic size.

Interactive custom widgets must provide accessibility. Pure decoration may opt
into `accessibility: { decorative: true }`, but decorative widgets cannot expose
keyboard, text input, focus, or pointer interaction.

Hit targets are routed pointer targets. A target declares stable bounds and a
`message(event)` function that receives the normalized pointer event. Targets
can opt into event kinds such as `contextMenu`, `scroll`, `dragStart`, `drag`,
or `dragEnd`; targets without an explicit event list use normal click
activation.

Use `canvas()` when application code only needs to paint cells. A canvas painter
receives `FrameBuffer`, bounds, theme, and optional state. It cannot measure,
lay out children, expose custom focus targets, or emit pointer targets. Canvas
output is still clipped, sanitized, styled, diffed, and projected into
accessibility through the canvas widget's label or explicit accessibility
options.

For the frame and diff pipeline shared by built-in widgets, custom renderers,
and canvas painters, see [Rendering internals](./rendering-internals.md). For
state, focus, hit-target, and style-slot expectations, see
[Building polished widgets](./building-polished-widgets.md).

Executable examples:

- `examples/showcase/app.mjs`
- `examples/showcase/preview.mjs`
- `examples/testing/visual-snapshots.mjs`
