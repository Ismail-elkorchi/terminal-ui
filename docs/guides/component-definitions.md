# Component Definitions

Use `defineComponent()` when the built-in catalog does not express the UI you
need. Defined and built-in components return the same opaque `Element` values,
compose with the same layouts, and use the same focus, pointer, accessibility,
and frame pipeline.

Keep the definition outside `view()`. It is immutable behavior; each call to
the returned factory supplies the current model and interaction handlers.

```ts
import { defineComponent } from '@ismail-elkorchi/terminal-ui/components';
import { measureTextCells } from '@ismail-elkorchi/terminal-ui/text';

const badge = defineComponent<string>({
  name: 'badge',
  structure: 'leaf',
  semantics: 'semantic',
  measure: ({ model, widthProfile }) => {
    const width = measureTextCells(model, { widthProfile }).cells;
    return {
      minWidth: 1,
      minHeight: 1,
      preferredWidth: Math.max(1, width),
      preferredHeight: 1
    };
  },
  render: ({ model, bounds, target }) => {
    target.write(bounds.row, bounds.column, [{ text: model }]);
  },
  accessibility: ({ id, model }) => ({
    id,
    role: 'status',
    label: model
  })
});

const ready = badge({ id: 'build-status', model: 'Ready' });
```

The optional `parts` array declares stable local style slots. `style()` rejects
undeclared slots at runtime, while TypeScript restricts `meta.styles.parts` to
the declared names.

## Leaf And Composite Components

A leaf measures and draws one element. A composite additionally receives
opaque child measurements and returns one rectangle per child. It may draw
before or after its children.

```ts
import { defineComponent } from '@ismail-elkorchi/terminal-ui/components';

const stack = defineComponent({
  name: 'stack',
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
text handlers, pointer behavior, availability, or focus metadata. Compose
several decorative leaves with a layout factory. The same rules are checked
for JavaScript callers at runtime.

A semantic instance has one of four availability states:

- `active` is the default and permits interaction;
- `passive` keeps semantics and drawing but suppresses interaction;
- `disabled` suppresses interaction and passes that state to every hook;
- `pending` does the same while work is in progress.

Unavailable instances cannot supply keys, text handlers, paste handlers, or
pointer behavior.

The returned element's message type is inferred from definition hit targets,
instance handlers, and composite children. These sources remain independent,
so an instance may add application messages even when its definition emits
none.

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
