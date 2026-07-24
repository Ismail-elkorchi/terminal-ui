# Public UI Authoring Model

This document defines the boundary between public UI authoring and the internal
renderer representation.

The render pipeline already has the right responsibilities: deterministic
layout, region composition, source-aware frames, frame passes, accessibility,
focus and hit targets, and diffable output. The authoring model keeps those
mechanisms out of ordinary application code.

## Layers

| Layer | Responsibilities | Outside its responsibilities |
| --- | --- | --- |
| App API | `defineTui`, init/update/view, subscriptions, and runtime lifecycle. | Renderer packets, component prop bags, and frame internals. |
| UI authoring API | Typed layout and component factories returning opaque elements. | Measurement, hit-target construction, accessibility tree construction, and renderer props. |
| Behavior API | Pure reducers and state helpers for controlled components. | Rendering and runtime side effects. |
| Renderer extension API | Custom renderer hooks, measurement, layout, frames, focus targets, hit targets, and accessibility. | Private render nodes, product-specific concepts, and application state. |

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

button({
  id: 'save',
  label: 'Save',
  state: state.saving ? 'pending' : 'idle',
  onPress: (): Message => ({ kind: 'save' }),
  meta: {
    accessibility: { description: 'Save the current document' },
    styles: { states: { focused: { bold: true } } }
  }
}) satisfies import('@ismail-elkorchi/terminal-ui/components').Element<Message>;
```

Rules:

- `id` remains top-level because it is authored identity for focus, tests,
  accessibility, state association, and event routing.
- Semantic state such as button `state`, selection, required state, and validation errors
  belongs to the component.
- Accessibility overrides, focus policy, layering, and typed local style anatomy live
  under `meta`.
- Controlled state remains caller-controlled.
- Component-local `keys` are an escape hatch, not the primary interaction API.
- There are no mutable component instances, global style cascade, product
  composites, or app-shell recipes.

## Event Vocabulary

Public event props describe user intent and return caller-controlled messages:

| Event prop | Use |
| --- | --- |
| `onPress` | Direct activation for buttons and other single-action controls. |
| `onSubmit` | Text controls that commit their current value. |
| `onSelect` | Palette entry selection where the selected domain value is the event payload. |
| `onChange` | Scalar controls such as checkboxes, switches, and sliders whose next value is computed by the component. |
| `onStep` | Step controls where the caller handles a structured step action. |
| `onAction` | Structured controlled-component actions for editable controls, navigation surfaces, multi-choice controls, lists, tables, trees, documents, charts, notifications, command inputs, and palettes. Editable-control actions include text edits, pointer caret/selection gestures, and scrolling where applicable. |
| `onScroll` | Structured scrolling for layout viewport and palette surfaces that retain a direct scroll contract. |
| `onContextMenu` | Context-menu activation. |
| `keys` | Component-local key bindings not covered by semantic events. |

Handlers may return `undefined` when a conditional interaction is declined.
Internally, factories convert authored callbacks into key maps and input maps,
then the renderer derives focus targets and hit targets from the private render
node. Those mechanisms are not public component state.

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
typed root, part, and visual-state styles
key and input maps
accessibility definitions
custom renderer state
```

Each built-in render-node kind has explicit normalized render props. Renderer
code may validate untrusted values at extension or serialization boundaries,
but the internal model does not derive its prop shape from authored component
options and does not use a generic authored-props alias.

The physical dependency direction is enforced by package tests:

```text
foundation and neutral contracts
  -> private renderer model
  -> shared private node construction and callback adaptation
  -> component and layout factories

foundation, neutral contracts, behavior, and private renderer model
  -> renderer implementation
  -> TUI runtime
  -> testing
```

Component/layout authoring and renderer implementation are sibling consumers
of the private renderer model. The renderer implementation does not import
component factories, layout factories, the private authoring helpers, or the
TUI runtime. The TUI directory contains application/runtime lifecycle only.

## Canvas And Custom Rendering

`canvas()` remains a public drawing component. Its painter receives `Canvas2D`,
bounds, theme data, source metadata, and caller-controlled state. It does not receive
direct frame-buffer or terminal-host access.

`custom()` lives under `./renderer`. It exposes bounded measurement, rendering,
accessibility, focus-target, and hit-target inputs without exposing private
render-node fields; it is an advanced extension point, not part of the default
component vocabulary.

## Testing

Application tests inspect public projections:

- frames and frame diffs;
- plain, ANSI, and accessible output;
- accessibility snapshots;
- focus paths and cursor positions;
- hit targets and interaction transcripts.

They do not inspect private render-node fields through authored elements.

Use `inspectElement(element)` when authoring tools or diagnostics need a stable,
read-only description before rendering. The projection includes authored
identity, whether the element came from the component, layout, or renderer
extension API, input capabilities, focus policy, visual state, and child
structure; it does not expose renderer props, callback values, or render-node
hooks. The category describes the authoring entrypoint only and does not
participate in render dispatch.

## Invariants

- Public component and layout factories return propertyless, frozen
  `Element<TMessage>` handles.
- Public declarations do not expose `RenderNode` or `props` through components
  and layout.
- Private render nodes are not exported by any public entrypoint. The renderer
  extension entrypoint exposes a bounded write-only render target,
  custom-renderer hooks, focus targets, and hit targets.
- Component option and event names describe authoring intent, not renderer
  machinery.
- Component state remains caller-controlled and message types remain generic.
- Factories infer a union across independent callbacks, direct messages, local
  key bindings, and child elements; ordinary heterogeneous composition does
  not require a factory message type argument.
- No compatibility alias preserves the removed structural authoring API.
