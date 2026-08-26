# Component Definitions

Use `defineComponent()` when the built-in catalog does not express the UI you
need. Defined and built-in components return the same opaque `Element` values,
compose with the same layouts, and use the same focus, pointer, accessibility,
and frame pipeline.

That shared pipeline does not grant definitions private layout authority.
Definitions draw only inside their allocation and may arrange declared slots
there. Painted and composed definitions can use the same public layout,
portal, anchor, clipping, scrolling, and focus-scope primitives as the built-in
catalog. Neither path can construct private renderer nodes.

Keep the definition outside `view()`. It is immutable behavior; each call to
the returned factory supplies current input, declared state capabilities, and
an action mapper.

```ts
import { defineSemanticLeafComponent } from '@ismail-elkorchi/terminal-ui/component';
import { measureTextCells } from '@ismail-elkorchi/terminal-ui/text';

interface BadgeOptions {
  readonly label: string;
}

const badge = defineSemanticLeafComponent<BadgeOptions, BadgeOptions>({
  name: 'example-app/components/badge',
  identity: 'required',
  accessibleRole: 'status',
  createModel(value) {
    if (typeof value.label !== 'string') throw new TypeError('badge requires a string label');
    return { label: value.label };
  },
  measure: ({ model, widthProfile }) => {
    const width = measureTextCells(model.label, { widthProfile }).cells;
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth: Math.max(1, width),
      preferredHeight: 1
    };
  },
  render: ({ model, target }) => {
    target.write(0, 0, [{ text: model.label }]);
  },
  accessibility: ({ id, model }) => ({
    id,
    role: 'status',
    label: model.label
  })
});

const ready = badge({ id: 'build-status', label: 'Ready' });
```

`defineSemanticLeafComponent()` and `defineDecorativeLeafComponent()` only
supply the invariant leaf structure fields. They use the same component kernel,
model construction, constrained measurement, inspection, and hook-result boundaries as
`defineComponent()`. Use `defineComponent()` directly for composite or composed
components.

The optional `parts` and `visualStates` arrays declare the exact local styling
contract. `style()` rejects undeclared slots at runtime, while TypeScript
restricts the factory's top-level `styles.parts` and `styles.states` to those
names.

## Leaf And Composite Components

A leaf measures and draws one element. A composite additionally receives
opaque child measurements and returns one rectangle per child. It may draw
before or after its children.

```ts
import { defineComponent } from '@ismail-elkorchi/terminal-ui/component';

const stack = defineComponent({
  name: 'example-app/components/stack',
  identity: 'required',
  structure: 'composite',
  semantics: 'semantic',
  accessibleRole: 'group',
  slots: {
    content: { cardinality: 'many', owner: 'caller', messages: 'bubble' }
  },
  measure: ({ slots }) => {
    const children = Array.from(
      { length: slots.count('content') },
      (_unused, index) => slots.measure('content', index)
    );
    return {
      minWidth: Math.max(0, ...children.map((child) => child.minWidth)),
      minHeight: children.reduce((sum, child) => sum + child.minHeight, 0),
      preferredWidth: Math.max(0, ...children.map((child) => child.preferredWidth)),
      preferredHeight: children.reduce((sum, child) => sum + child.preferredHeight, 0)
    };
  },
  layout: ({ bounds, slots }) => ({
    content: Array.from(
      { length: slots.count('content') },
      (_unused, index) => {
        const offset = Math.min(index, bounds.height);
        return {
          row: offset,
          column: 0,
          width: bounds.width,
          height: index < bounds.height ? 1 : 0
        };
      }
    )
  }),
  accessibility: ({ id, children }) => ({
    id,
    role: 'group',
    label: 'Stack',
    children
  })
});
```

Child rectangles must stay inside the allocated component rectangle. Use
`overlay()`, `anchored()`, `portal()`, or another layout primitive for content
that intentionally escapes normal flow. That authority belongs to layout, not
to application components.

## Drawing Boundary

The render hook receives a frozen, write-only `RenderTarget`. Writes are
clipped to the intersection of the component bounds and active viewport. Text,
links, source metadata, and styles are sanitized and validated before a frame
is published. The target cannot read frames, emit terminal commands, inspect
private nodes, or move its allocation.

Use `canvas()` instead when you only need bounded drawing through `Canvas2D`.
Canvas and `RenderTarget` coordinates are local and zero-based. The runtime
translates them into the component allocation, clips them to active viewports,
and validates styles and source metadata before publication.

Measurement runs before viewport resolution. It receives constraints, theme,
the text-width profile, and child measurements, but not `viewport`. Layout,
rendering, accessibility, focus, and hit-target hooks receive the visible
viewport so large content can be windowed.

## Semantics And Interaction

Semantic definitions require an exact `accessibleRole` and an accessibility
hook. Use a role resolver when the component model changes the root role, as
`text()` does for headings. Rendering rejects a hook whose root role disagrees
with the declaration, so inspection and rendered accessibility cannot drift.
Decorative definitions are
leaf components for non-semantic drawing. They use `semantics: 'decorative'`
and cannot define accessibility, children, focus targets, hit targets, keys,
text handlers, pointer behavior, state, or focus metadata. Compose
several decorative leaves with a layout factory. The same rules are checked
for JavaScript callers at runtime.

Semantic definitions declare keyboard, text, paste, pointer, and hit-target
behavior in terms of one reusable action type. Each instance supplies
`onAction`, which maps that action into its application's message type. Return
`ignoreMessage()` from the same `/component` entrypoint when an action is
intentionally ignored. Component messages are non-null values; returning
`undefined` or `null` is rejected so ignored actions are always explicit.
Semantic leaf definitions that own keyboard, text, paste, or focus behavior
must also declare `focusTargets()`. Without a logical target, those hooks could
never receive focused input. Pointer-only leaves may remain unfocusable.

A pointer declaration without `state` always emits its declared pointer
actions. When `state` is provided, returning `undefined` disables that optional
controlled channel for the instance; returning a pointer state enables the
hover and press lifecycle on its clickable targets.

Shared state uses independent boolean capabilities rather than one overloaded
status value:

- `disabled` suppresses interaction owned by the component;
- `busy` exposes in-progress semantics without disabling cancellation;
- `readOnly` keeps focus, caret movement, selection, and scrolling available,
  while editable components reject insertion, deletion, replacement, history
  replacement, completion acceptance, and other value-changing actions;
- `inert` removes a composite subtree from interaction and accessibility output.

Disabled, busy, and read-only state is added to accessibility output by the
framework. Definition hooks should not duplicate it. Decorative definitions
cannot accept state or actions.

Component-specific inputs are top-level instance fields. `createModel()` is their
typed construction step. Validate values the component consumes when JavaScript
callers could otherwise corrupt behavior, enforce cross-field rules, and build
the model used by every later phase. Do not maintain a second list of option
names just to reject unused properties. TypeScript checks the declared option
type for typed callers, while the framework validates its shared fields.

Model construction owns retained data. Copy caller arrays or objects that later hooks
will retain; freeze those owned values when mutation would violate the
component's behavior. The framework does not recursively inspect or freeze a
component model, and models may use domain objects rather than only plain JSON
records. Omit `createModel()` only when the supplied component options already are
the owned model.

Focus targets and hit targets use stable IDs and bounded rectangles. A hit
target that should transfer keyboard focus names one of the component's focus
targets explicitly. The runtime resolves that ID to the committed focus path.
Hit-target bounds, accepted event kinds, and focus intent are copied and
validated together before pointer routing; later mutation of hook-owned data
cannot change the committed interaction regions.

Use `mergeTerminalStyles()` from `/component` when a custom component needs
right-biased style composition. The helper validates, owns, and freezes the
result rather than retaining mutable caller style objects.
Accessibility focus must agree with the resolved target; when accessible node
IDs match focus-target IDs, the matching accessible node must be focused.

## Publishing A Component Package

Elements are opaque capabilities owned by one installed terminal-ui instance.
A component package must share the application's instance rather than bundling
or installing a private copy:

```json
{
  "peerDependencies": {
    "@ismail-elkorchi/terminal-ui": "^0.1.4"
  },
  "devDependencies": {
    "@ismail-elkorchi/terminal-ui": "^0.1.4"
  }
}
```

Mark `@ismail-elkorchi/terminal-ui` as external in the package bundler. The
peer dependency supplies the runtime copy; the development dependency supplies
types and tests while authoring the package. Passing an element between two
installed copies is rejected with a package-instance diagnostic; renderer
internals are never shared through a global registry.

## What To Test

Test the contract visible to callers:

- measured size and tiny bounds;
- plain and styled cells;
- Unicode width and control-sequence sanitization;
- clipping and viewport windows;
- focus and pointer targets;
- accessibility, including exact focus;
- high-contrast and no-color output where relevant.

For frame construction and diffing, see
[Rendering internals](./rendering-internals.md). For component conventions, see
[Building polished components](./building-polished-components.md).
