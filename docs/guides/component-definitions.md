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
import { defineComponent } from '@ismail-elkorchi/terminal-ui/component';
import { measureTextCells } from '@ismail-elkorchi/terminal-ui/text';

interface BadgeOptions {
  readonly label: string;
}

const badge = defineComponent<BadgeOptions>()({
  name: 'example-app/components/badge',
  identity: 'optional',
  structure: 'leaf',
  semantics: 'semantic',
  accessibleRole: 'status',
  parts: ['value'],
  metadata: ['styles'],
  measure: ({ model, widthProfile }) => {
    const width = measureTextCells(model.label, { widthProfile }).cells;
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth: Math.max(1, width),
      preferredHeight: 1
    };
  },
  render: ({ model, target, style }) => {
    const valueStyle = style({ part: 'value' });
    target.write(0, 0, [{ text: model.label, ...(valueStyle === undefined ? {} : { style: valueStyle }) }]);
  },
  accessibility: ({ id, model }) => ({
    id,
    role: 'status',
    label: model.label
  })
});

const ready = badge({ label: 'Ready', styles: { parts: { value: { bold: true } } } });
```

The first call declares the option type; the definition infers identity,
parts, states, metadata, and slots from its literal fields. Omit
`createModel()` when options already are the component model. Add it when the
component must validate or normalize domain input. Use the same `defineComponent()`
entrypoint for leaves, with `structure: 'leaf'` and the appropriate semantic
discriminant.

The optional `parts` and `visualStates` arrays declare the exact local styling
contract. `style()` rejects undeclared slots at runtime, while TypeScript
restricts the factory's top-level `styles.parts` and `styles.states` to those
names.

## Leaf And Composite Components

A leaf measures and draws one element. A composite additionally receives
opaque child measurements and returns one allocation per child: a rectangle
for a participating child, or `null` to retain a hidden subtree. It may draw
before or after its children.

```ts
import { defineComponent } from '@ismail-elkorchi/terminal-ui/component';
import { text } from '@ismail-elkorchi/terminal-ui/components';
import { renderElementSnapshot } from '@ismail-elkorchi/terminal-ui/testing';

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
  layout: ({ bounds, slots }) => {
    let row = 0;
    return { content: Array.from(
      { length: slots.count('content') },
      (_unused, index) => {
        const preferred = slots.measure('content', index).preferredHeight;
        const height = Math.max(0, Math.min(bounds.height - row, preferred));
        const result = { row, column: 0, width: bounds.width, height };
        row += height;
        return result;
      }
    ) };
  },
  accessibility: ({ id, children }) => ({
    id,
    role: 'group',
    label: 'Stack',
    children
  })
});

const snapshot = renderElementSnapshot({
  element: stack({
    id: 'example-stack',
    slots: { content: [text({ content: 'one\ntwo' }), text({ content: 'three\nfour' })] }
  }),
  terminalSize: { columns: 12, rows: 4 }
});
console.log(snapshot.plainTextFrame);
```

Return `null` for an inactive tab panel, collapsed disclosure, or another
semantically hidden slot child. Its element and model remain available for
later activation, but its layout, paint, focus, pointer, accessibility, and
post-commit layout hooks do not run while hidden. Slot counts and measurement
access remain unchanged; measurement and preparation may still inspect retained
children. Optional slots use `undefined` only when there is no child.
Accessibility slot arrays contain only accessible children, without placeholders
for hidden roots.

A zero-sized rectangle is still a participating allocation, not a visibility
flag. Composite layout hooks run even with an empty allocation so they can
choose which retained children are hidden. Offscreen viewport children retain
their logical geometry for focus reveal.

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

Use `onFocus()` for entry to and exit from the component as a whole. A component
with several logical focus targets can additionally use `onFocusTarget()` to
receive `focusTargetEnter` and `focusTargetLeave` events with the exact target
identifier. `onFocusTarget()` requires that the same definition declare
`focusTargets()`; descendant targets remain the responsibility of their owning
components. Moving between two targets in the same component emits only the
target lifecycle events; it does not fabricate a component leave and re-entry.

Pointer targets declare accepted actions and map routed events to component
actions. The renderer owns transient hover and press feedback; a component can
read that state while painting without duplicating it in application state.

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
[Rendering internals](./rendering-internals.md).

For a reusable component, test an empty or one-cell allocation, wide Unicode,
clipped content, focus and pointer targets, accessibility, and no-color output.
Keep stable part names separate from visual states. Use theme tokens and
top-level `styles` for local overrides; draw only through the provided target.
