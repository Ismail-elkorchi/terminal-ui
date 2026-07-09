# Public UI Authoring Model

This document defines the boundary between public UI authoring and the internal
renderer representation.

The render pipeline already has the right responsibilities: deterministic
layout, region composition, source-aware frames, frame passes, accessibility,
focus and hit targets, and diffable output. The authoring model keeps those
mechanisms out of ordinary application code.

## Layers

| Layer | Owns | Does not own |
| --- | --- | --- |
| App API | `defineTui`, init/update/view, subscriptions, and runtime lifecycle. | Renderer packets, component prop bags, and frame internals. |
| UI authoring API | Typed layout and component factories returning opaque elements. | Measurement, hit-target construction, accessibility tree construction, and renderer props. |
| Behavior API | Pure reducers and state helpers for controlled components. | Rendering and runtime side effects. |
| Renderer extension API | Render nodes, renderer hooks, measurement, layout, frames, focus targets, hit targets, and accessibility. | Product-specific concepts and application state. |

The core flow is:

```text
view() returns an opaque Element<TMessage> handle
-> internal boundary resolves its private RenderNode<TMessage>
-> renderer lays out and renders the node
-> runtime routes messages back to update()
```

`Element<TMessage>` and `RenderNode<TMessage>` are separate compile-time and
runtime objects. Normal application code cannot inspect renderer fields through
an element.

## Authoring Values

Public component and layout factories return `Element<TMessage>`.
Applications can compose and render elements, but cannot read `kind`, `props`,
children, input maps, renderer hooks, or other node internals.

Component options put stable identity and domain state first:

```ts
import { button } from '@ismail-elkorchi/terminal-ui/components';

type Message = { readonly kind: 'save' };
const state = { saving: false };

button<Message>({
  id: 'save',
  label: 'Save',
  disabled: state.saving,
  onPress: { kind: 'save' },
  meta: {
    accessibility: { description: 'Save the current document' },
    styles: { focused: { bold: true } }
  }
}) satisfies import('@ismail-elkorchi/terminal-ui/components').Element<Message>;
```

Rules:

- `id` remains top-level because it is authored identity for focus, tests,
  accessibility, state association, and event routing.
- Semantic state such as `disabled`, `selected`, `required`, and `error`
  belongs to the component.
- Accessibility overrides, focus policy, layering, and local style slots live
  under `meta`.
- Controlled state remains caller-owned.
- Component-local `keys` are an escape hatch, not the primary interaction API.
- There are no mutable component instances, global style cascade, product
  composites, or app-shell recipes.

## Event Vocabulary

Public event props describe user intent and return caller-owned messages:

| Event prop | Use |
| --- | --- |
| `onPress` | Buttons, menu actions, and direct activation. |
| `onSubmit` | Text controls that commit their current value. |
| `onSelect` | Lists, tables, trees, tabs, palettes, charts, and heatmaps. |
| `onClose` | Closeable tabs and surfaces. |
| `onDismiss` | Dismissible notifications and transient UI. |
| `onDisclosure` | Tree expansion and collapse. |
| `onChange` | Form controls whose next value is computed by the component. |
| `onStep` | Step controls where the caller handles a structured step action. |
| `onInput` | Text editing. |
| `onPaste` | Paste input when handled separately from ordinary text. |
| `onScroll` | Structured scrolling. |
| `onTextPointer` | Pointer-to-text position and selection events. |
| `onContextMenu` | Context-menu activation. |
| `keys` | Component-local key bindings not covered by semantic events. |

Handlers may return `undefined` when a conditional interaction is declined.
Internally, factories compile these events into key maps, input maps, focus
targets, and hit targets. Those mechanisms are not public component state.

## Entry Points

| Entrypoint | Contract |
| --- | --- |
| `./components` | Typed component factories, `Element`, and shared component data contracts. |
| `./layout` | Layout and composition factories plus responsive view selection. |
| `./behavior` | Pure reducers and controlled-state helpers. |
| `./renderer` | Advanced renderer extensions and frame/rendering primitives. |
| `./tui` | App definitions, runtime lifecycle, subscriptions, and session policy. |

The root entrypoint exposes the primary app-authoring path. It does not expose
renderer internals or behavior reducers as ordinary component authoring.

## Internal Representation

Component factories construct private `RenderNode<TMessage>` values and return
opaque element handles through one internal construction path. Layout,
rendering, and runtime code resolve handles only at the renderer boundary.

A render node can contain:

```text
kind
props
children
layer and focus metadata
style slots
key and input maps
accessibility definitions
custom renderer state
```

`props: Record<string, unknown>` is acceptable inside the renderer kernel. It
is not a public authoring contract.

## Canvas And Custom Rendering

`canvas()` remains a public drawing component. Its painter receives `Canvas2D`,
bounds, theme data, source metadata, and caller-owned state. It does not receive
direct frame-buffer or terminal-host access.

`custom()` lives under `./renderer`. It exposes measurement, layout, rendering,
accessibility, focus-target, and hit-target hooks over `RenderNode`; it is an
advanced extension point, not part of the default component vocabulary.

## Testing

Application tests inspect public projections:

- frames and frame diffs;
- plain, ANSI, and accessible output;
- accessibility snapshots;
- focus paths and cursor positions;
- hit targets and interaction transcripts.

They do not inspect private render-node fields through authored elements.

## Invariants

- Public component and layout factories return propertyless, frozen
  `Element<TMessage>` handles.
- Public declarations do not expose `RenderNode` or `props` through components
  and layout.
- Only the renderer extension entrypoint exposes render nodes, frame buffers,
  renderer hooks, focus targets, and hit targets.
- Component option and event names describe authoring intent, not renderer
  machinery.
- Component state remains caller-owned and message types remain generic.
- No compatibility alias preserves the removed structural authoring API.
