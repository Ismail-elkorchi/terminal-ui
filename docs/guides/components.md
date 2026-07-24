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

| Component | Role | Not |
| --- | --- | --- |
| `text()` | Static sanitized text with an optional semantic text role. | A text editor, input, or rich styling container. |
| `richText()` | Styled authored inline content with optional links and accessible symbol fallbacks. | A document model, markdown renderer, or source-metadata escape hatch. |
| `textArea()` | Caller-controlled multi-line editable text surface with cursor, selection, gutter, wrapping, and scroll state. | A full IDE editor with syntax services, files, or undo history. |
| `textInput()` | Caller-controlled single-line editable value with cursor, placeholder, validation, and pointer-to-text support. | A command palette, number parser, or multi-line editor. |
| `numberInput()` | Single numeric field with optional step controls and validation display. | A slider, range selector, or numeric domain model. |
| `tabs()` | Tab header plus selected-panel layout with semantic select, close, and navigation actions. | Navigation routing, persistence, or hidden panel state. |
| `dialog()` | Centered surface with explicit modal focus policy, semantic dismissal, and an optional action area. | A general overlay system, route, or storage for open/closed state. |
| `canvas()` | Safe drawing component for custom diagrams and visualizations. | Raw ANSI output or an imperative terminal API. |
| `form()` | Group controls into a form-like layout. | Form validation, submission, or retained state. |
| `field()` | Label/help/error wrapper around field content. | A value control by itself. |
| `label()` | Accessible label/value text for forms and metadata. | A button or static document paragraph. |
| `button()` | Discrete action trigger with visual state and caller-provided message. | A toggle, menu item, or navigation link. |
| `checkbox()` | Boolean checked/unchecked control. | Multi-choice selection or a switch animation. |
| `toggleSwitch()` | Boolean on/off control with switch visual anatomy. | A multi-choice control or status indicator. |
| `slider()` | Single numeric value on a track. | Progress display or range selection. |
| `rangeSlider()` | Two numeric endpoints with a caller-controlled active handle on one track. | Two unrelated sliders or a progress meter. |
| `checkboxGroup()` | Multiple independent choices with semantic focus, movement, and toggle actions. | A tree, table, or form validator. |
| `radioGroup()` | One selected choice with semantic focus and selection actions. | A menu or arbitrary command list. |
| `select()` | Form value trigger with controlled open, highlight, commit, dismissal, and popup-scroll state. | A command menu, context menu, or searchable palette. |
| `colorSwatchPicker()` | Compact caller-controlled color choice with semantic navigation and selection actions. | A full color-management tool. |
| `calendar()` | Compact caller-controlled date choice control. | Calendar scheduling or date arithmetic. |
| `menu()` | Inline command/action list with semantic navigation, activation, hierarchy, and scroll actions. | A form value selector or searchable command surface. |
| `menuBar()` | Horizontal top-level command headings with controlled heading selection and hierarchical menu navigation. | Application chrome or routing. |
| `contextMenu()` | Controlled contextual command surface anchored to a target or cursor. | Global navigation, a form selector, or persistent sidebar. |
| `dropdownMenu()` | Controlled compact action trigger with separate open, highlight, activation, dismissal, and popup-scroll state. | A validated form value control; use `select()` for required/error form semantics. |
| `palette()` | Searchable bounded picker for commands or data entries. | A shell, command parser, or application command registry. |
| `commandInput()` | Single-line command/composer surface with suggestions and history hooks. | A transcript, event log, or command execution engine. |
| `list()` | Fixed-row selectable/filterable list using an explicit stable item projection. | A table, tree, arbitrary-element collection, or virtual data store. |
| `table()` | Structured rows and columns with selection, scrolling, sorting, resizing, density, and cell semantics. | A spreadsheet engine or database. |
| `tree()` | Expandable hierarchy with selection, filtering, lazy placeholders, and pointer targets. | A filesystem API or storage of expansion state. |
| `paginator()` | Page navigation control paired with caller-controlled paging state. | Data loading or page storage. |
| `scrollback()` | Append-heavy visible window with semantic scroll, search, fold, and follow-tail actions. | A command input or complete session ledger. |
| `structuredBlock()` | One titled record with fields, summary, body, and details. Its `result` is a lifecycle outcome; its independent `level` is informational severity. | A generic layout surface or arbitrary markdown block. |
| `activityFeed()` | Variable-height structured records projected through one measured window with stable-ID selection and expansion actions. | Filtering policy, durable history storage, or job orchestration. |
| `statusBar()` | Passive leading, centered, and trailing text/status items under constrained width. | A command bar, menu bar, or interactive layout frame. |
| `helpBar()` | Grouped keybinding hints with deterministic constrained-width projection. | Keybinding registration or command routing. |
| `statusIndicator()` | Small activity state display. | Progress measurement or task scheduling. |
| `progressBar()` | Determinate or indeterminate progress display. | Editable range input or status record. |
| `spinner()` | Animated process indicator driven by caller-controlled frame state. | A scheduler or hidden runtime timer. |
| `notificationStack()` | Bounded passive live notifications or a controlled navigable notification history. | A global toast manager, durable notification store, or overlay placement policy. |
| `tooltip()` | Small contextual explanation with placement hints. | A focus manager, popover controller, or overlay lifecycle system. |
| `divider()` | Visual separation and section rhythm. | Layout spacing by itself. |
| `sparkline()` | Tiny trend visualization. | Full chart with axes, legend, or interaction. |
| `barChart()` | Compact categorical bars with stable-ID selection and activation actions. | Table replacement or arbitrary canvas drawing. |
| `chart()` | Bounded multi-series chart with sampling, axes, semantic selection, and keyboard window navigation. | A charting application or data analytics engine. |
| `meter()` | Compact scalar meter. | Progress workflow or editable value input. |
| `heatmap()` | Grid of values with value-scale coloring and semantic cell and viewport navigation. | Spreadsheet, calendar, or matrix editor. |

## Shared Contracts

Every component accepts top-level `id` and optional `meta`.

Command-input validation uses `level: 'info' | 'warning' | 'error'`.
Buttons, menu actions, notifications, and tooltips each expose their own
narrow tone values; those contracts are not interchangeable.

Components that expose interactive scroll chrome use controlled variants. A
visible scrollbar requires caller-controlled scroll state and a semantic action or
scroll handler. Passive variants may project a fixed window, but cannot expose
an inert scrollbar.

`list()`, `table()`, and `tree()` accept either raw local data or a prepared
collection from the behavior entrypoint. The two inputs are mutually
exclusive. Use raw arrays for small data; retain prepared complete or windowed
collections when projection, identity, or hierarchy flattening must not repeat
on every `view()` call.

`scrollback()` always accepts a prepared `ScrollbackHistory`. Create it with
`prepareScrollbackHistory()` and retain it in application state. Add records
with `appendScrollbackHistory()` so sanitation, identity, offsets, wrapping,
and search data remain reusable across frames.

`meta.accessibility` can provide a full accessible node override or lightweight
options such as `label`, `description`, and `decorative`. Decorative elements
are excluded from their parent's accessibility tree and must not expose
keyboard, text-input, focus, or pointer interaction.

`meta.focus` can disable focus traversal, set focus order, or contain focus
inside a subtree. A modal `dialog()` requires an explicit `focusPolicy` for its
initial target and focus-return behavior; a non-modal dialog does not create a
focus scope.

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

`richText()` and component adornments use authored inline content rather than
renderer spans. A text segment may carry local style and link data. A symbol
segment supplies Unicode and printable-ASCII renderings plus required
`accessibleText`, so the active theme chooses a deterministic symbol mode
without making accessibility depend on a decorative glyph.

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

Callers do not author frame source metadata. The renderer assigns component,
part, item, and visual-state identity when it compiles inline content into
render spans. Core theme color tokens are a closed vocabulary; application
tokens must use the `custom.*` namespace.

`dialog()` titles accept authored inline content, including start, center, and
end title content. Its `border` option owns geometry only: border kind and
title alignment. Renderer spans, frame source metadata, and border styles
remain renderer-extension concerns.

For app structure and controlled state, see [UI authoring](./ui-authoring.md).
For reusable reducers, see [Behavior helpers](./behavior.md). For custom
renderer escape hatches, see [Renderer extensions](./renderer-extensions.md).
