# Element And Component Model

This document defines the boundary between the public element API and the
internal renderer representation.

The render pipeline already has the right responsibilities: deterministic
layout, region composition, source-aware frames, frame passes, accessibility,
focus and hit targets, and diffable output. The public element model keeps those
mechanisms out of ordinary application code.

## Layers

| Layer | Responsibilities | Outside its responsibilities |
| --- | --- | --- |
| App API | `defineTui`, init/update/view, subscriptions, and runtime lifecycle. | Renderer packets, component prop bags, and frame internals. |
| Element API | Typed layout and component factories returning opaque elements. | Measurement, hit-target construction, accessibility tree construction, and renderer props. |
| Behavior API | Pure reducers and state helpers for controlled components. | Rendering and runtime side effects. |
| Component definition API | Reusable measurement, drawing, child layout, focus, pointer, and accessibility behavior. | Private render nodes, terminal hosts, and hidden application state. |

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

## Element Values

Public component and layout factories return `Element<TMessage>`.
Applications can compose and render elements, but cannot read `kind`, `props`,
children, input maps, renderer hooks, or other node internals.

Component options put stable identity and domain state first:

```ts
import { button } from '@ismail-elkorchi/terminal-ui/components';

type Message = { readonly kind: 'save' };
const state = { saving: false };

const saveButtonOptions = {
  id: 'save',
  label: 'Save',
  meta: {
    styles: { states: { focused: { bold: true } } }
  }
} as const;

const saveButton = state.saving
  ? button({
      ...saveButtonOptions,
      busy: true,
      onAction: (): Message => ({ kind: 'save' })
    })
  : button({
      ...saveButtonOptions,
      onAction: (): Message => ({ kind: 'save' })
    });

saveButton satisfies import('@ismail-elkorchi/terminal-ui/components').Element<Message>;
```

Rules:

- `id` remains top-level because it is caller-supplied identity for focus, tests,
  accessibility, state association, and event routing.
- Semantic state such as button `busy`, selection, required state, and validation errors
  belongs to the component.
- Permitted focus policy, layering, and typed local style anatomy live under
  `meta`. Definitions own required semantics and do not let callers replace them.
- Controlled state remains caller-controlled.
- There are no mutable component instances, global style cascade, product
  composites, or app-shell recipes.

## Event Vocabulary

Each component defines one typed action union. Its single `onAction(action)`
property maps semantic actions to caller-controlled messages:

| Contract | Use |
| --- | --- |
| `onAction` | Activation, editing, submission, selection, navigation, scrolling, dismissal, context menus, and visualization interaction. The action union states exactly what a component can emit. |
| `ignoreMessage()` | Explicitly declines a handled action without weakening message types or using `undefined`. |

Factories compile definition-owned keyboard, text, pointer, focus, and hit-target
strategies once. Instance handlers only map the resulting semantic action.

## Entry Points

| Entrypoint | Contract |
| --- | --- |
| `./component` | `defineComponent()`, opaque elements, authoring contracts, bounded painting helpers, and component interaction helpers. |
| `./components` | Built-in catalog and component-domain public data contracts. It consumes `./component`. |
| `./layout` | Layout and composition factories plus responsive view selection. |
| `./behavior` | Pure reducers and controlled-state helpers. |
| `./renderer` | Frame construction, diffing, serialization, and drawing primitives. |
| `./tui` | App definitions, runtime lifecycle, subscriptions, and session policy. |

The root entrypoint exposes the primary application path: TUI execution,
built-in component and layout factories, and the behavior namespace. It does
not expose renderer internals as ordinary component APIs.

## Internal Representation

Every definition is compiled once. Each factory call separates framework-owned
fields, performs typed component preparation, and creates the same generic
component runtime node through one private construction path. The node stores
the prepared model opaquely; the compiled hooks retain its real type. Layout,
rendering, and runtime code resolve opaque handles only at the renderer boundary.

A render node can contain:

```text
compiled definition
prepared model and named slots
layer and focus metadata
typed root, part, and visual-state styles
key and input maps
action mapping
```

Public factories validate JavaScript and dynamic caller-supplied values,
sanitize terminal text, and normalize component input once. Renderer code
applies the same geometry, style, source, interaction, and accessibility checks
to every component hook output, regardless of where its definition ships.

The physical dependency direction is enforced by package tests:

```text
foundation and neutral contracts
  -> public component and layout contracts
  -> component definitions and layout factories
  -> one private node construction boundary

foundation, neutral contracts, behavior, public renderer contracts, and private renderer model
  -> renderer implementation
  -> TUI runtime
  -> testing
```

The runtime entrypoint is a facade over lifecycle, state reduction, frame
commit, diagnostics, and change-publication collaborators. There is still one
serialized dispatch path. Component behavior dispatches directly through the
compiled definition attached to its generic runtime node; there is no
component-name registry.

The authoring core alone owns private component-node construction. The built-in
catalog consumes its public contract and cannot import the private renderer
model or implementation. Layout keeps a separate structural boundary. The TUI
directory contains application/runtime lifecycle only.

## Canvas And Defined Components

`canvas()` remains a public drawing component. Its painter receives `Canvas2D`,
bounds, theme data, source metadata, and caller-controlled state. It does not receive
direct frame-buffer or terminal-host access.

`defineComponent()` is owned and exported only by the narrow `./component`
entrypoint. It creates an immutable factory from component-owned preparation,
measurement, painting or composition, accessibility, focus-target, and
hit-target hooks without exposing private node fields. Composite definitions
arrange typed named slots; composed definitions build ordinary element trees
from public component and layout factories.

## Testing

Application tests inspect public descriptions:

- frames and frame diffs;
- plain, ANSI, and accessible output;
- accessibility snapshots;
- focus paths and cursor positions;
- hit targets and interaction transcripts.

They do not inspect private render-node fields through caller-supplied elements.

Use `inspectElement(element)` when component tools or diagnostics need a stable,
read-only description before rendering. The inspection includes caller-supplied
identity, factory category and name, declared capabilities, focus policy,
style metadata, and child structure; it does not expose private props, callback
values, or drawing hooks. Focus inspection applies the same logical
disablement policy as rendering, including disabled controls and inert subtrees.
Busy and read-only controls remain focusable unless separately disabled.
It describes whether an element can produce a focus item or scope before
terminal geometry is known; zero-sized or clipped layout can still leave no
focus path in a particular frame.

## Invariants

- Public component and layout factories return propertyless, frozen
  `Element<TMessage>` handles.
- Public declarations do not expose `RenderNode` or `props` through components
  and layout.
- Private render nodes are not exported by any public entrypoint. Component
  definitions receive a bounded write-only target, focus targets, and hit
  targets through public contracts.
- Component option and event names describe caller intent, not renderer
  machinery.
- Component state remains caller-controlled and message types remain generic.
- Factories infer application messages from `onAction` and bubbled named slots;
  ordinary typed wrappers can adapt the canonical factory while preserving
  per-invocation domain inference.
