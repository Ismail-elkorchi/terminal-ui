# Components

Components are typed public factories that return opaque `Element<TMessage>`
values. They are generic UI building blocks, not product-specific recipes.
They own component behavior, interaction messages, and accessibility semantics
such as control roles, values, and relationships. Whether an element has
children does not decide its category.

Use this matrix to choose the narrowest component that matches the job. Add a
component only when it has distinct state, actions, accessibility, or
presentation semantics that current layout and component contracts cannot
express cleanly.

Factories whose primary responsibility is positioning, sizing, clipping,
layering, or geometry-only interaction are documented in
[Layout](./layout.md).

The public catalog is split by abstraction level. Import primitives from
`/components/foundations`, form controls from `/components/forms`, passive and
interactive collections from `/components/collections`, popup surfaces from
`/components/overlays`, charts from `/components/visualizations`, and
application-oriented composites from `/components/patterns`. The
`/components` entrypoint is the complete catalog when that distinction is not
useful to the consumer.

| Component | Role | Not |
| --- | --- | --- |
| `text()` | Static sanitized text with an optional semantic text role. | A text editor, input, or rich styling container. |
| `richText()` | Styled caller-supplied inline content with optional links and accessible symbol fallbacks. | A document model, markdown renderer, or source-metadata escape hatch. |
| `link()` | Focusable navigation or resource reference with a typed activation event. | A button styled like a link. |
| `toolbar()` | Oriented semantic group of compact controls that retain their own focus and actions. | A menu, form, or arbitrary layout row. |
| `toggleButton()` | Pressed/unpressed action control with a distinct accessible name. | A checkbox or persistent switch setting. |
| `textArea()` | Caller-controlled multi-line editable text surface with cursor, selection, gutter, wrapping, and scroll state. | A full IDE editor with syntax services, files, or undo history. |
| `textInput()` | Caller-controlled single-line editable value with cursor, placeholder, validation, and pointer-to-text support. | A command picker, number parser, or multi-line editor. |
| `passwordInput()` | Caller-controlled single-line secret entry that masks rendered content, accessibility output, and TUI transcripts. | Secret storage, validation, or authentication by itself. |
| `numberInput()` | Single numeric field with optional step controls and validation display. | A slider, range selector, or numeric domain model. |
| `tabs()` | Tab header plus selected-panel layout with semantic select, close, and navigation actions. | Navigation routing, persistence, or hidden panel state. |
| `dialog()` | Centered surface with explicit modal focus policy, semantic dismissal, and an optional action area. | A general overlay system, route, or storage for open/closed state. |
| `canvas()` | Safe drawing component with explicit measurement and semantic label or decorative metadata. | Raw ANSI output or an imperative terminal API. |
| `form()` | Semantic grouping of related controls with the form accessibility role. | Retaining values, performing validation, or submitting by itself. |
| `field()` | Label and help grouping around field content. | A second authority for required, validation, or disabled state. |
| `label()` | Visible control label linked to a target control by ID. | Generic metadata or key/value text; use `text()` for that content. |
| `button()` | Discrete action trigger with visual state and caller-provided message. | A toggle, menu item, or navigation link. |
| `checkbox()` | Boolean checked/unchecked control. | Multi-choice selection or a switch animation. |
| `switchControl()` | Boolean on/off control with switch semantics and visual anatomy. | A multi-choice control or status indicator. |
| `slider()` | Single numeric value on a track. | Progress display or range selection. |
| `rangeSlider()` | Two numeric endpoints with a caller-controlled active handle on one track. | Two unrelated sliders or a progress meter. |
| `checkboxGroup()` | Multiple independent choices with an active item and committed multi-selection. | A tree, table, or form validator. |
| `radioGroup()` | One committed choice with selection following the active item. | A menu or arbitrary command list. |
| `combobox()` | Form value popup with independent active option, committed selection, and dismissal state. | A searchable picker, command menu, or context menu. |
| `colorSwatchPicker()` | Compact caller-controlled color choice with semantic navigation and selection actions. | A full color-management tool. |
| `calendar()` | Compact caller-controlled date choice control. | Calendar scheduling or date arithmetic. |
| `menu()` | Inline command/action list with semantic navigation, activation, hierarchy, and scroll actions. | A form value selector or searchable command surface. |
| `menuBar()` | Horizontal top-level command headings with controlled active position and hierarchical menu navigation. | An application toolbar or routing. |
| `contextMenu()` | Controlled contextual command surface anchored to a target or cursor. | Global navigation, a form selector, or persistent sidebar. |
| `menuTrigger()` | Controlled action trigger for a menu, with separate open, active-item, activation, dismissal, and popup-scroll state. | A validated form value control; use `combobox()` for that. |
| `searchPicker()` | Searchable bounded picker for commands or data entries. | A shell, command parser, or application command registry. |
| `commandInput()` | Single-line command entry with history hooks and compact, expanded, or anchored-popup suggestions. | A general message composer, transcript, event log, or command execution engine. |
| `list()` | Passive ordered or unordered semantic list. | A keyboard-managed selector; use `listbox()` for that. |
| `listView()` | Variable-height arbitrary-element collection with independent active item and selection policy. | A fixed-row option selector or virtual data store. |
| `listbox()` | Fixed-row option collection with stable IDs, filtering, active-item navigation, and explicit selection policy. | Passive sequential content or arbitrary nested controls. |
| `table()` | Passive structured rows and columns with optional controlled scrolling and sorting presentation. | A keyboard-managed grid. |
| `dataGrid()` | Row- or cell-navigation grid with explicit active position, selection policy, sorting, resizing, and scrolling. | A spreadsheet engine or database. |
| `tree()` | Expandable immutable hierarchy with caller-owned disclosure, active position, selection, filtering, loading, and scrolling state. | A filesystem API or data-loading state machine. |
| `pagination()` | Page navigation control paired with caller-controlled paging state. | Data loading or page storage. |
| `logViewer()` | Append-heavy structured log viewer with severity, timestamps, metadata, search, folding, selection, and follow-tail actions. | Terminal scrollback, a command input, or a session transcript. |
| `disclosure()` | One caller-controlled expandable section composed from an arbitrary child element. | Durable expansion storage, heterogeneous feed policy, or data loading. |
| `statusBar()` | Passive leading, centered, and trailing text/status items under constrained width. | A command bar, menu bar, or interactive layout frame. |
| `helpBar()` | Grouped keybinding hints with deterministic constrained-width projection. | Keybinding registration or command routing. |
| `activityIndicator()` | Compact caller-driven running or settled process state. | Scheduling, hidden timers, or progress measurement. |
| `progressBar()` | Determinate or indeterminate progress display. | Editable range input or status record. |
| `notificationRegion()` | Bounded live notifications with optional explicit dismissal actions. | A global toast manager, durable notification storage, or expiry policy. |
| `notificationHistory()` | Controlled navigable history of completed notifications. | Durable history storage or notification lifecycle policy. |
| `tooltip()` | Trigger-bound contextual explanation with controlled visibility and shared popup dismissal state. | A general popover or overlay lifecycle manager. |
| `divider()` | Visual separation and section rhythm. | Layout spacing by itself. |
| `sparkline()` | Tiny trend visualization. | Full chart with axes, legend, or interaction. |
| `barChart()` | Compact categorical bars with stable-ID selection and activation actions. | Table replacement or arbitrary canvas drawing. |
| `chart()` | Bounded multi-series chart with sampling, axes, semantic selection, and keyboard window navigation. | A charting application or data analytics engine. |
| `meter()` | Compact scalar meter. | Progress workflow or editable value input. |
| `heatmap()` | Grid of values with value-scale coloring and semantic cell and viewport navigation. | Spreadsheet, calendar, or matrix editor. |

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

Tabs accept `maxTabWidth` when document names must not let one tab consume the
strip. The visible label is clipped, while its full accessible name and close
action remain intact.

Components that expose interactive scrollbars use controlled variants. Scroll
position is caller-owned; content and viewport geometry is derived during
layout. A visible scrollbar routes a semantic scroll transition through the
component's transition callback. Passive collections can still scroll when
given an explicit scroll-state callback; availability and scrolling are
independent concerns.

`listbox()`, `table()`, `dataGrid()`, and `tree()` accept either raw local data or a prepared
collection from the behavior entrypoint. The two inputs are mutually
exclusive. Use raw arrays for small data; retain prepared complete or windowed
collections when projection, identity, or hierarchy flattening must not repeat
on every `view()` call.

`logViewer()` always accepts a prepared `LogHistory`. Create it with
`prepareLogHistory()` and retain it in application state. Add log entries
with `appendLogHistory()` so sanitation, identity, offsets, wrapping,
and search data remain reusable across frames.

Component definitions own their accessibility contract. Callers supply domain
labels and descriptions through declared component fields; they cannot replace
required roles, relationships, or state through metadata. A decorative
definition is statically and dynamically barred from interaction.

`meta.focus` can disable focus traversal, set focus order, or contain focus
inside a subtree. A modal `dialog()` requires an explicit `focusPolicy` for its
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

`meta.styles` is a semantic slot map for local visual overrides. Generic state
slots describe interaction: `focused`, `hovered`, `pressed`, `selected`,
`disabled`, and `active`. Result, validation, notification, and destructive
styling is carried by the component-specific field and part that owns that
meaning.

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
  onAction: () => ({ kind: 'save' })
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
