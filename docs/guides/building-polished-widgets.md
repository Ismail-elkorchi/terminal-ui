# Building Polished Widgets

Polished terminal widgets are predictable under small viewports, wide Unicode,
themes, focus, pointer input, accessibility, and tests. The public widget API is
pure data; polish comes from how renderers translate that data into bounded
layout, styled cells, interaction targets, and snapshots.

## Widget Checklist

For each widget or custom renderer:

- define stable input data and keep application state outside the renderer;
- measure minimum and preferred size without reading terminal globals;
- render through `FrameBuffer` only;
- use `RenderSpan` values so style survives clipping and wrapping;
- handle tiny widths and heights without throwing;
- expose focus targets only when keyboard interaction exists;
- expose hit targets only for pointer interaction regions;
- provide accessibility or mark pure decoration as decorative;
- support theme tokens and local style slots for visible states;
- test plain text, ANSI, frame cells, focus, hit targets, and accessibility.

## Visual States

Use semantic widget states instead of hardcoded colors. Common state slots are
`root`, `border`, `title`, `label`, `value`, `placeholder`, `selected`,
`focused`, `disabled`, `error`, `warning`, and `success`.

Theme defaults should make ordinary widgets readable. Local `styles` should
override only the widget that receives them. This keeps applications free to
build dashboards, editors, forms, games, monitoring screens, menus, and
document tools without changing renderer internals.

## Layout And Bounds

Every renderer receives bounds from layout. Do not infer screen size from
process state. If a widget needs virtual content, use explicit scroll state,
content dimensions, selected item ids, or caller-owned offsets.

When content is larger than the bounds:

- clip or window the visible region;
- preserve grapheme and wide-cell topology;
- mark omitted content in accessibility when useful;
- keep hit and focus targets inside visible bounds;
- keep diff output proportional to the visible change.

## Interaction

Keyboard behavior comes from widget `keyMap`, `inputMap`, focus metadata, and
renderer focus targets. Pointer behavior comes from hit targets. The runtime
routes input after rendering; renderers should only describe target geometry
and messages.

Layer metadata controls z-order. Higher visible layers render above lower
layers and receive pointer hits first. Modal or popover-like compositions can
use focus containment without a special runtime mode.

## Custom Rendering

Use `custom()` for a full widget protocol: measurement, layout, rendering,
accessibility, focus targets, and hit targets. Use `canvas()` for low-level
drawing inside a bounded rectangle.

Both paths draw through `FrameBuffer`; neither path writes raw terminal output.
Interactive custom widgets must provide accessibility. Decorative output must
opt into `accessibility: { decorative: true }` and cannot expose keyboard,
text-input, focus, or pointer interaction.

## Regression Evidence

A polished widget should have tests that prove:

- visible text is deterministic;
- styled cells preserve semantic style;
- ANSI output is safe for the advertised terminal capabilities;
- accessibility contains the expected role and state;
- focus and hit targets are stable;
- large input data is windowed to viewport size;
- tiny viewports clip instead of crashing;
- raw control sequences are sanitized.

Executable examples:

- `examples/showcase/app.mjs`
- `examples/showcase/scripted.mjs`
- `examples/showcase/preview.mjs`
