# Component Definitions

Use `defineComponent()` when the built-in catalog does not express the UI you
need. Defined and built-in components return the same opaque `Element` values,
compose with the same layouts, and use the same focus, pointer, accessibility,
and frame pipeline.

That shared pipeline does not grant definitions private layout authority.
Definitions draw only inside their allocation and may arrange their declared
children there. Renderer-owned popup construction and hidden implementation
nodes remain available only to built-ins. Package components compose public
layouts such as `overlay()` and `anchored()` when those bounds are known by the
application.

Keep the definition outside `view()`. It is immutable behavior; each call to
the returned factory supplies current options, shared state, and an action mapper.

```ts
import { defineComponent } from '@ismail-elkorchi/terminal-ui/component';
import { measureTextCells } from '@ismail-elkorchi/terminal-ui/text';

interface BadgeOptions {
  readonly label: string;
}

const badge = defineComponent<BadgeOptions>({
  name: 'example-app/components/badge',
  structure: 'leaf',
  semantics: 'semantic',
  decodeOptions(value) {
    if (typeof value !== 'object' || value === null || !('label' in value)
      || typeof value.label !== 'string'
      || Object.keys(value).some((field) => field !== 'label')) {
      throw new TypeError('badge requires only a string label');
    }
    return { label: value.label };
  },
  measure: ({ options, widthProfile }) => {
    const width = measureTextCells(options.label, { widthProfile }).cells;
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth: Math.max(1, width),
      preferredHeight: 1
    };
  },
  render: ({ options, bounds, target }) => {
    target.write(bounds.row, bounds.column, [{ text: options.label }]);
  },
  accessibility: ({ id, options }) => ({
    id,
    role: 'status',
    label: options.label
  })
});

const ready = badge({ id: 'build-status', label: 'Ready' });
```

The optional `parts` array declares stable local style slots. `style()` rejects
undeclared slots at runtime, while TypeScript restricts `meta.styles.parts` to
the declared names.

## Leaf And Composite Components

A leaf measures and draws one element. A composite additionally receives
opaque child measurements and returns one rectangle per child. It may draw
before or after its children.

```ts
import { defineComponent } from '@ismail-elkorchi/terminal-ui/component';

const stack = defineComponent({
  name: 'example-app/components/stack',
  structure: 'composite',
  semantics: 'semantic',
  measure: ({ childCount, measureChild }) => {
    const children = Array.from(
      { length: childCount },
      (_unused, index) => measureChild(index)
    );
    return {
      minWidth: Math.max(0, ...children.map((child) => child.minWidth)),
      minHeight: children.reduce((sum, child) => sum + child.minHeight, 0),
      preferredWidth: Math.max(0, ...children.map((child) => child.preferredWidth)),
      preferredHeight: children.reduce((sum, child) => sum + child.preferredHeight, 0)
    };
  },
  layout: ({ bounds, childCount }) => Array.from(
    { length: childCount },
    (_unused, index) => {
      const offset = Math.min(index, bounds.height);
      return {
        row: bounds.row + offset,
        column: bounds.column,
        width: bounds.width,
        height: index < bounds.height ? 1 : 0
      };
    }
  ),
  accessibility: ({ id, children }) => ({
    id,
    role: 'group',
    label: 'Stack',
    children
  })
});
```

Child rectangles must stay inside the allocated component rectangle. Use
`overlay()`, `anchored()`, `dialog()`, or another layout primitive for content
that intentionally escapes normal flow. That authority belongs to layout, not
to application components.

## Drawing Boundary

The render hook receives a frozen, write-only `RenderTarget`. Writes are
clipped to the intersection of the component bounds and active viewport. Text,
links, source metadata, and styles are sanitized and validated before a frame
is published. The target cannot read frames, emit terminal commands, inspect
private nodes, or move its allocation.

Use `canvas()` instead when you only need bounded drawing through `Canvas2D`.
Canvas coordinates are local and zero-based; `RenderTarget` coordinates are
absolute terminal cells supplied through `bounds`.

Measurement runs before viewport resolution. It receives constraints, theme,
the text-width profile, and child measurements, but not `viewport`. Layout,
rendering, accessibility, focus, and hit-target hooks receive the visible
viewport so large content can be windowed.

## Semantics And Interaction

Semantic definitions require an accessibility hook. Decorative definitions are
leaf components for non-semantic drawing. They use `semantics: 'decorative'`
and cannot define accessibility, children, focus targets, hit targets, keys,
text handlers, pointer behavior, state, or focus metadata. Compose
several decorative leaves with a layout factory. The same rules are checked
for JavaScript callers at runtime.

Semantic definitions declare keyboard, text, paste, pointer, and hit-target
behavior in terms of one reusable action type. Each instance supplies
`onAction`, which maps that action into its application's message type. Return
`ignoreMessage()` from the same `/component` entrypoint when an action is
intentionally ignored; returning `undefined` is rejected.

Shared state uses independent boolean capabilities rather than one overloaded
status value:

- `disabled` suppresses interaction owned by the component;
- `busy` exposes in-progress semantics without disabling cancellation;
- `readOnly` keeps focus and selection available for roles that support immutable values;
- `inert` removes a composite subtree from interaction and accessibility output.

Disabled, busy, and read-only state is added to accessibility output by the
framework. Definition hooks should not duplicate it. Decorative definitions
cannot accept state or actions.

Component-specific options are top-level instance fields. A definition with
custom options supplies `decodeOptions()`, which is the runtime boundary for
JavaScript and other dynamic callers. It should reject unknown fields and
return the canonical options consumed by every hook.

Focus targets and hit targets use stable IDs and bounded rectangles. A hit
target that should transfer keyboard focus names one of the component's focus
targets explicitly. The runtime resolves that ID to the committed focus path.
Accessibility focus must agree with the resolved target; when accessible node
IDs match focus-target IDs, the matching accessible node must be focused.

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
