# Components

Component model construction, measurement, layout, paint, semantics and interaction
consume available state synchronously. There is no component preparation hook.
Use an effect-owned `createTuiPreparedQuery()` for expensive derived data, then
render its accepted immutable result or an explicit pending/previous-result view.
Include source revision, query and relevant geometry in the request. Accepted
layout notifications can send an ordinary message to request geometry-dependent
work after the frame commits; they do not run that work inside rendering.

Synchronous preparation functions remain useful for deliberate small inputs and
direct rendering. Call them explicitly before constructing the element.

Components are typed public factories that return opaque `Element<TMessage>`
values. They are generic UI building blocks, not product-specific recipes.
They own component behavior, interaction messages, and accessibility semantics
such as control roles, values, and relationships. Whether an element has
children does not decide its category.

Use this matrix to choose the narrowest component that matches the job. Add a
component only when it has distinct state, actions, accessibility, or
visual semantics that current layout and component contracts cannot
express cleanly.

Factories whose primary responsibility is positioning, sizing, clipping,
layering, or geometry-only interaction are documented in
[Layout](./layout.md).

The public catalog is split by abstraction level. Import primitives from
`/components/foundations`, form controls from `/components/forms`, passive and
interactive collections from `/components/collections`, popup surfaces from
`/components/overlays`, progress and notification output from
`/components/feedback`, charts from `/components/visualizations`, and
application-oriented composites from `/components/patterns`. Each focused
entrypoint also owns the actions, state or view types, and required typed
constructors for its component family. The
`/components` entrypoint is the complete catalog when that distinction is not
useful to the consumer.

| Component | Use it for |
| --- | --- |
| `text()` | Static sanitized text with an optional semantic text role. |
| `richText()` | Styled caller-supplied inline content with optional links and accessible symbol fallbacks. |
| `image()` | Accessible raster placement with Kitty/SIXEL negotiation and a text fallback. |
| `link()` | Focusable navigation or resource reference with a typed activation event. |
| `toolbar()` | Semantic wrapper for a caller-owned row, column, or other layout of related controls. |
| `toggleButton()` | Pressed/unpressed action control with the same label, adornment, tone, and density options as a button. |
| `textArea()` | Caller-controlled multi-line editable text surface with cursor, keyboard/pointer selection, bounded undo history, context-menu events, gutter, wrapping, and scroll state. |
| `textInput()` | Caller-controlled single-line editable value with cursor, placeholder, validation, and pointer-to-text support. |
| `passwordInput()` | Caller-controlled single-line secret entry that masks rendered content, accessibility output, and TUI transcripts. |
| `numberInput()` | Single numeric field with optional step controls and validation display. |
| `tabs()` | Tab header plus selected-panel layout with semantic selection, close, and navigation interactions. |
| `dialog()` | Centered surface with explicit modal focus policy, semantic dismissal, and an optional action area. |
| `canvas()` | Safe drawing component with explicit measurement and semantic label or decorative metadata. |
| `form()` | Semantic grouping of related controls with the form accessibility role. |
| `field()` | Label and help grouping around field content. |
| `label()` | Visible control label linked to a target control by ID. |
| `button()` | Discrete action trigger with visual state and caller-provided message. |
| `checkbox()` | Boolean checked/unchecked control. |
| `switchControl()` | Boolean on/off control with switch semantics and visual anatomy. |
| `slider()` | Single numeric value on a track. |
| `rangeSlider()` | Two numeric endpoints with a caller-controlled active handle on one track. |
| `checkboxGroup()` | Multiple independent choices with an active item and committed multi-selection. |
| `radioGroup()` | One committed choice with selection following the active item. |
| `combobox()` | Form value popup with independent active option, committed selection, and an autocomplete mode using the shared editable-text contract. |
| `colorSwatchPicker()` | Compact caller-controlled color choice with semantic navigation and selection actions. |
| `calendar()` | Compact caller-controlled date choice control. |
| `menu()` | Inline command/action list with semantic navigation, activation, hierarchy, and scroll actions. |
| `menuBar()` | Horizontal top-level command headings with controlled active position and hierarchical menu navigation. |
| `contextMenu()` | Controlled contextual command surface anchored to a target or cursor. |
| `menuTrigger()` | Controlled action trigger for a menu, with separate open, active-item, activation, dismissal, and popup-scroll state. |
| `searchPicker()` | Searchable bounded picker for commands or data entries. |
| `commandInput()` | Single-line command entry with history hooks and compact, expanded, or anchored-popup suggestions. |
| `list()` | Passive ordered or unordered semantic list. |
| `listView()` | Variable-height arbitrary-element collection with independent active item and selection policy. |
| `listbox()` | Fixed-row option collection with stable IDs, filtering, active-item navigation, and explicit selection policy. |
| `table()` | Passive structured rows and columns with optional controlled scrolling and sorting state. |
| `dataGrid()` | Row- or cell-navigation grid with explicit active position, selection policy, sorting, resizing, and scrolling. |
| `tree()` | Expandable immutable hierarchy with caller-owned disclosure, active position, selection, filtering, loading, and scrolling state. |
| `pagination()` | Page navigation control paired with caller-controlled paging state. |
| `logViewer()` | Append-heavy structured log viewer with severity, timestamps, metadata, search, pointer selection, context-menu events, and follow-tail actions. |
| `disclosure()` | One caller-controlled expandable section composed from an arbitrary child element. |
| `statusBar()` | Passive leading, centered, and trailing text/status items under constrained width. |
| `helpBar()` | Grouped keybinding hints with deterministic constrained-width layout. |
| `activityIndicator()` | Compact caller-driven running or settled process state. |
| `progressBar()` | Determinate or indeterminate progress display. |
| `notificationRegion()` | Bounded live notifications with optional explicit dismissal actions. |
| `notificationHistory()` | Controlled navigable history of completed notifications. |
| `tooltip()` | Trigger-bound contextual explanation with controlled visibility and shared popup dismissal state. |
| `divider()` | Visual separation and section rhythm. |
| `sparkline()` | Tiny trend visualization. |
| `barChart()` | Compact categorical bars with stable-ID selection and activation actions. |
| `chart()` | Bounded multi-series chart with sampling, axes, semantic selection, and keyboard window navigation. |
| `meter()` | Compact scalar meter. |
| `heatmap()` | Grid of values with value-scale coloring and semantic cell and viewport navigation. |

## Inline hyperlinks and interactive links

Use a linked segment in `richText()` for an inline OSC 8 hyperlink. Without an
`onLinkActivate` callback, activation belongs to the terminal emulator. With a
callback, every logical link becomes one keyboard focus target and accessible
link, with exact pointer targets for each visible fragment. Adjacent segments
that share the same link object form one logical link, allowing style changes
inside a label. An explicit link `id` groups its fragments even when wrapping
or layout separates them. The activation event carries the retained link and
preserves the keyboard or pointer modifiers. Unlinked text never becomes
interactive merely because another segment has a link.

Use `link()` when the application owns activation. It participates in keyboard
focus and pointer routing and reports the triggering key or pointer event,
including pointer button and modifiers, so the application can choose normal,
modified, context, or other navigation behavior. `link()` does not navigate or
open a resource by itself.

## Shared Contracts

Each definition declares whether top-level `id` is required or optional and
which `meta` capabilities it permits. Built-ins expose only the focus, layer,
and typed style metadata that their definitions declare.

`form()` groups related controls and exposes that grouping with the `form`
accessibility role. It does not retain control values, perform validation, or
submit anything by itself. Application values and every validation or
submission action remain caller-controlled.

`field()` owns only its group label, description, and child layout. Required,
validation, disabled, and other interaction state belongs to the child control.
`label()` owns only the visible `labelledBy` relationship; it does not restate
the target control's state.

`label({ id, forId, text })` requires a stable ID for both ends of the
relationship. Rendered accessibility marks the target control with
`labelledBy: id`; it does not encode the association as descriptive prose.
Use `text()` with the `metadata` text role for generic metadata.

Command-input validation uses `level: 'info' | 'warning' | 'error'`.
Buttons, menu actions, notifications, and tooltips each expose their own
narrow tone values; those contracts are not interchangeable.
Buttons use the graphical control shape by default and accept
`density: 'compact' | 'regular'` when a toolbar needs tighter spacing.
Use the `ghost` button tone for toolbar actions that should inherit the bar
until focused, hovered, or pressed.

Comboboxes accept `labelVisibility: 'visible' | 'hidden'` in both select and
autocomplete modes. The default is `'visible'`. Use `'hidden'` for compact
toolbars or an already-labelled field: it removes the entire visible label,
required marker, and `: ` prefix and reclaims their width for the value or
placeholder. The `label` string is still required and continues to name the
control and its popup accessibly. Required/error semantics, the disclosure
marker, and interaction behavior are unchanged; autocomplete cursor and pointer
positions follow the visible input starting at the first cell.

Tabs accept `maxTabWidth` when document names must not let one tab consume the
strip. The visible label is clipped, while its full accessible name and close
action remain intact. Inactive panel elements and their caller-owned state are
retained, but their layout, paint, interaction, and accessibility hooks do not
run until the panel is selected. Collapsed disclosures apply the same rule to
their content.

Components that expose interactive scrollbars use controlled variants. Scroll
position is caller-owned; content and viewport geometry is derived during
layout. A visible scrollbar routes a semantic scroll transition through the
component's transition callback. Passive collections can still scroll when
given an explicit scroll-state callback; availability and scrolling are
independent concerns.

`listbox()`, `table()`, `dataGrid()`, and `tree()` accept either raw local data or a retained
collection from the behavior entrypoint. The two inputs are mutually
exclusive. Use raw arrays for small data; retain complete or windowed collection
snapshots when filtering, identity indexing, or hierarchy flattening must not repeat
on every `view()` call. The raw `items` plus `toOption` convenience path
maps the complete supplied array each time the component factory is called,
so its construction cost is `O(n)` even when only a small viewport is visible.

`logViewer()` always accepts a retained `LogHistory`. Create it with
`createLogHistory()` and retain it in application state. Add log entries
with `appendLogHistory()` so sanitation, identity, offsets, wrapping,
and search data remain reusable across frames.

Pass its prepared `view` to both `logViewer()` and `logViewerReducer()`. Use
`view: null` while preparation is pending. Plain, unwrapped output without a
search can also use `null`; it reads only the visible source rows. For search or
wrapping, use `prepareLogViewerView()` in an existing replaceable effect.
`onLayout` supplies the exact committed allocation and data dependencies, so one
`createTuiPreparedQuery` lifecycle handles search, source changes, folding and
resize. The live component never computes missing query or wrapped geometry.
See [prepared log views](./log-preparation.md) for the complete pattern.

### Preparing a large wrapped editor

For a cold or large `textArea()`, opt into its explicit pending representation
with `preparedLayout: null` and `onLayoutRequest`. The accepted-frame callback
provides an opaque `TextAreaLayoutRequest` containing the actual measurement
widths, allocation, theme and width profile. The component derives projection,
line-number gutter, error-row and scrollbar space internally. The same pattern
works inside columns and split panes; do not guess a terminal or content width.

Use the existing prepared-query/effect lifecycle:

```ts
import { createTuiCooperativeWorkContext, createTuiPreparedQuery } from '@ismail-elkorchi/terminal-ui/tui';
import { createTextAreaState, type TextAreaTransition } from '@ismail-elkorchi/terminal-ui/behavior';
import { textArea, prepareTextAreaLayout, type TextAreaLayoutRequest } from '@ismail-elkorchi/terminal-ui/components/forms';

const preparation = createTuiPreparedQuery({
  id: 'editor-layout',
  prepare: (request: TextAreaLayoutRequest, context) =>
    prepareTextAreaLayout(request, createTuiCooperativeWorkContext(context)),
  toMessage: result => ({ kind: 'layoutPrepared' as const, result }),
});

const state = {
  editor: createTextAreaState({ value: 'Document contents' }),
  preparation: preparation.init(),
};

type EditorMessage =
  | { readonly kind: 'layoutRequested'; readonly request: TextAreaLayoutRequest }
  | { readonly kind: 'editorTransition'; readonly transition: TextAreaTransition };

// In view(), retain the last admitted result even while the next effect runs.
textArea<EditorMessage>({
  id: 'editor',
  meta: { accessibleName: 'Document editor' },
  state: state.editor,
  wrap: true,
  preparedLayout: state.preparation.result,
  onLayoutRequest: request => ({ kind: 'layoutRequested' as const, request }),
  onTransition: (transition: TextAreaTransition): EditorMessage => ({ kind: 'editorTransition', transition }),
});
```

Initialize the query with `preparation.init()`. In the ordinary update handler,
pass `layoutRequested.request` to `preparation.request()` and pass
`layoutPrepared.result` to `preparation.update()`, lifting their state/effect
contributions back into application state. Admit completion only for the
current document; never restore the prepared document as an editor snapshot.
The query's revision rejects replaced work. Keep text, paste, selection and edit
messages on their ordinary reliable update path. If applying an edit at a cold,
deep source position would force normalization, queue that edit in normal
application state and drain it in order once the matching source is prepared.
Preparation completion is data, never a replacement for those ordered edits.

While required measurements or geometry are missing, the editor shows
“Preparing editor…” and exposes busy accessibility with no claim to rendered
source content. Focus and ordinary text/paste transitions remain available;
source-dependent pointer and visual-row navigation wait for ready geometry.
Stable pending frames do not issue duplicate requests. Content-sized parents
may need a second accepted request after exact preferred measurements change
the allocation. Ordinary `onLayout` runs only for ready, source-exact geometry.

The result owns its document, exact measurements and final layout without
retaining option callbacks or prior request/result chains. Current caret,
selection, scroll and placement still come from current component state. A
changed document, decoration set, wrap/gutter/error policy, theme, width profile
or allocation returns controlled preparation to pending. Supplying a mismatched
capability without `onLayoutRequest` throws rather than doing cold synchronous
work. Omitting `preparedLayout` deliberately keeps the existing synchronous
mode; both modes drive the same computation.

Cooperative work checkpoints source boundaries, projection, numeric geometry,
wrapped-row construction, resizing and row-offset observations. Cancellation
does not publish a partial capability. Native string/segmentation operations and
an indivisible enormous grapheme are still synchronous; checkpoints cannot
preempt a native callback already running.

Component definitions own their accessibility contract. Callers supply domain
labels and descriptions through declared component fields; they cannot replace
required roles, relationships, or state through metadata. A decorative
definition is statically and dynamically barred from interaction.

`meta.focus` can disable focus traversal or set focus order where a component
declares that capability. A modal `dialog()` requires an explicit `focusPolicy` for its
initial target and focus-return behavior; a non-modal dialog does not create a
focus scope. Without an explicit width or height, a dialog uses its measured
content size and remains centered. Padding is inside its border. Modal dialogs
create their own layer and dim the lower canvas; callers do not need to build a
separate backdrop.

`meta.layer` controls visibility, z-index, lower-layer handling, and overflow
priority. Its `underlay` field clears lower cells with `clear`, leaves them in
place with `preserve`, or copies a lower background into an upper cell that has
none with `inheritBackground`. Higher visible layers render above lower layers
and receive pointer hits first.

Top-level `styles` is the local visual override matrix. `root` is the common
base for every rendered part, `parts` targets the component's exact anatomy,
and `states` can override the whole component or individual parts while that
state is active. Components expose only states they can render, including
`focused`, `hovered`, `pressed`, `selected`, `active`, `disabled`, `busy`, or
`readOnly` as appropriate. Result, validation, notification, and destructive
styling remains owned by the component-specific field and part that carries
that meaning.

The generated [component styling anatomy](../api/reference.md#component-styling)
lists the exact parts and visual states accepted by every built-in factory.
`inspectElement()` exposes the same available contract separately from the
overrides configured on one element instance.

`textRole` describes structure only: title, heading, body, caption, metadata,
metric, or badge. Validation, warning, failure, and success are not text roles.

## Inline Content And Adornments

`richText()` and component adornments use caller-supplied inline content rather than
renderer spans. A text segment may carry local style and link data. A symbol
segment supplies Unicode and printable-ASCII renderings plus required
`accessibleText`, so the active theme chooses a deterministic symbol mode
without making accessibility depend on a decorative glyph.
Inline content is adopted in one operation: text is sanitized, styles and links
are detached, symbol fallbacks are checked, and the resulting segments are
immutable. Components retain that owned value instead of separately testing and
then rebuilding the caller's segments.

```ts
import { button } from '@ismail-elkorchi/terminal-ui/components';

button({
  id: 'save',
  label: 'Save',
  leading: [{
    kind: 'symbol',
    unicode: '✓',
    ascii: '+',
    accessibleText: 'confirm'
  }],
  onPress: () => ({ kind: 'save' })
});
```

Callers do not supply frame source metadata. The renderer assigns component,
part, item, and visual-state identity when it converts inline content into
render spans. Core theme color tokens are a closed vocabulary; application
tokens must use the `custom.*` namespace.

`dialog()` titles accept caller-supplied inline content. A `BorderTitleSlots` object
places title content in its `start`, `center`, and `end` slots. Its `border`
option owns geometry only: border kind and title alignment. Render spans,
frame source metadata, and border styles remain component implementation
concerns. Title strings, inline arrays, and slotted titles use the same border-title
adoption boundary.

For app structure and controlled state, see [Building terminal apps](./building-terminal-apps.md).
For reusable reducers, see [Behavior helpers](./behavior.md). For reusable
component authoring, see [Component definitions](./component-definitions.md).

`radioGroup()` and `checkboxGroup()` also accept
`labelVisibility: 'hidden'`. This removes the complete visual group-label row,
including its required marker, so a single option can occupy one terminal row.
Option descriptions, validation errors and pointer targets move up with the
option rows. The `label` remains required and names the accessible group; the
default `'visible'` policy preserves the existing layout.
