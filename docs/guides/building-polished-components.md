# Building Polished Components

Polished terminal components are predictable under small viewports, wide
Unicode, themes, focus, pointer input, accessibility, and tests. Public
component factories return opaque elements; renderers translate those elements
into bounded layout, styled cells, interaction targets, and snapshots.

## Component Checklist

For each component or renderer extension:

- define stable input data and keep application state outside the renderer;
- measure minimum and preferred size without reading terminal globals;
- render through `FrameBuffer` only;
- use `RenderSpan` values so style survives clipping and wrapping;
- handle tiny widths and heights without throwing;
- expose focus targets only when keyboard interaction exists;
- expose hit targets only for pointer interaction regions;
- provide accessibility or mark pure decoration as decorative;
- support theme tokens and local `meta.styles` slots for visible states;
- test plain text, ANSI, frame cells, focus, hit targets, and accessibility.

## Visual States

Use semantic component states instead of hardcoded colors. Common state slots
are `root`, `border`, `title`, `label`, `value`, `placeholder`, `selected`,
`focused`, `disabled`, `error`, `warning`, and `success`.

Theme defaults should make ordinary components readable. Local `meta.styles`
overrides should affect only the component that receives them and the stable
slots that renderer uses. There is no global style cascade.

## Layout And Bounds

Every renderer receives bounds from layout. Do not infer screen size from
process state. If a component needs virtual content, use explicit scroll state,
content dimensions, selected item ids, or caller-owned offsets.

When content is larger than the bounds:

- clip or window the visible region;
- preserve grapheme and wide-cell topology;
- mark omitted content in accessibility when useful;
- keep hit and focus targets inside visible bounds;
- keep diff output proportional to the visible change.

## Interaction

Keyboard behavior comes from component event props, `keys`, editable-text
handlers, focus metadata, and renderer focus targets. Pointer behavior comes
from hit targets. The runtime routes input after rendering; renderers describe
target geometry, accepted pointer event kinds, focus intent, and how a routed
pointer event maps to a caller-owned message. Built-in focusable controls bind
their pointer targets to their single declared focus target. Custom renderers
must declare that relationship explicitly.

Renderer visual focus is a relation: `none`, `self`, or `descendant`.
Accessibility remains exact and marks only the active target as focused.
`surface({ focusWithin: true })` may use descendant focus for an active-pane
treatment; passive surfaces do not inherit focus styling.

Layer metadata controls z-order. Higher visible layers render above lower
layers and receive pointer hits first. Modal or popover-like compositions can
use focus containment without a special runtime mode.

Transient feedback should be bounded by composition, not app roles. For
example, mount a live `notificationStack()` inside an overlay child whose
layout bounds are the area where notifications may appear. Live presentation
is a passive accessibility region and may expose pointer dismissal for
dismissible items. Use history presentation only when the application needs a
focusable, selected, keyboard-navigable notification collection. The stack
places cards within its bounds and skips cards that cannot fit a minimum useful
shape.

## Renderer Extensions

Use `custom()` for a full renderer protocol: measurement, layout, rendering,
accessibility, focus targets, and hit targets. Use `canvas()` for bounded
drawing through `Canvas2D`.

Both paths draw through the same sanitized frame pipeline; neither path writes
raw terminal output. Interactive custom renderers must provide accessibility.
Decorative output must opt into `meta: { accessibility: { decorative: true } }`
and cannot expose keyboard, text-input, focus, or pointer interaction.

## Regression Evidence

A polished component should have tests that prove:

- visible text is deterministic;
- styled cells preserve semantic style;
- ANSI output is safe for the advertised terminal capabilities;
- accessibility contains the expected role and state;
- focus and hit targets are stable;
- large input data is windowed to viewport size;
- tiny viewports clip instead of crashing;
- raw control sequences are sanitized.

Executable example:

- `examples/testing/harness.mjs`
