# Building Polished Components

Polished terminal components are predictable under small viewports, wide
Unicode, themes, focus, pointer input, accessibility, and tests. Public
component factories return opaque elements; renderers translate those elements
into bounded layout, styled cells, interaction targets, and snapshots.

## Component Checklist

For each component:

- define stable input data and keep application state outside the definition;
- measure minimum and preferred size without reading terminal globals;
- render through the framework-provided drawing target;
- use `RenderSpan` values so style survives clipping and wrapping;
- handle tiny widths and heights without throwing;
- expose focus targets only when keyboard interaction exists;
- expose hit targets only for pointer interaction regions;
- provide accessibility or mark pure decoration as decorative;
- support theme tokens and local `meta.styles` slots for visible states;
- test plain text, ANSI, frame cells, focus, hit targets, and accessibility.

## Visual States

Use semantic component states instead of hardcoded colors. Generic state slots
are `focused`, `hovered`, `pressed`, `selected`, `disabled`, and `active`.
Stable component parts such as `root`, `border`, `title`, `label`, `value`,
and `placeholder` remain separate from those states.

Theme defaults should make ordinary components readable. Local `meta.styles`
overrides should affect only the component that receives them and the stable
slots that renderer uses. There is no global style cascade.

Selected and pressed content uses selection colors; focus and active states
add emphasis; hovered content uses the focus background; and disabled content
uses disabled text. Component contracts apply validation, warning, failure,
successful completion, and destructive-action colors directly. Selection,
focus, and disabled states do not inherit destructive styling.

## Layout And Bounds

Every renderer receives bounds from layout. Do not infer screen size from
process state. If a component needs virtual content, use explicit scroll state,
content dimensions, selected item ids, or caller-controlled offsets.

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
pointer event maps to a caller-controlled message. Built-in focusable controls bind
their pointer targets to their single declared focus target. Defined components
declare that relationship explicitly.

Renderer visual focus is a relation: `none`, `self`, or `descendant`.
Accessibility remains exact and marks only the active target as focused.
Layout surfaces do not inherit descendant focus styling. Components that need
an active-pane treatment expose and style that interaction state themselves.

Layer metadata controls z-order. Higher visible layers render above lower
layers and receive pointer hits first. Modal or popover-like compositions can
use focus containment without a special runtime mode.

Transient feedback should be bounded by composition, not app roles. For
example, mount a live `notificationRegion()` inside an overlay child whose
layout bounds are the area where notifications may appear. Live presentation
uses live accessibility and may expose focusable dismissal for dismissible
items. Use `notificationHistory()` only when the application needs a focusable,
selected, keyboard-navigable notification collection. The region
places cards within its bounds and skips cards that cannot fit a minimum useful
shape.

## Component Definitions

Use `defineComponent()` for reusable measurement, drawing, accessibility,
focus targets, and hit targets. A leaf definition draws one element; a
composite definition additionally measures and arranges children.
Use `canvas()` for bounded drawing through `Canvas2D`.

Both paths draw through the same sanitized frame pipeline; neither path writes
raw terminal output. Semantic definitions provide accessibility. Decorative
definitions use `semantics: 'decorative'`; their types and runtime checks reject
interaction hooks and interactive descendants.

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
