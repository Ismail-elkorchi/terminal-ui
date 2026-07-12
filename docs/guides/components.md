# Components

Components are typed public factories that return opaque `Element<TMessage>`
values. They are generic UI building blocks, not product-specific recipes.

Use this matrix to choose the narrowest component that matches the job.

| Component | Role | Not |
| --- | --- | --- |
| `text()` | Static sanitized text with an optional semantic text role. | A text editor, input, or rich styling container. |
| `richText()` | Styled inline spans with preserved style, link, and source metadata. | A document model or markdown renderer. |
| `textArea()` | Caller-owned multi-line editable text surface with cursor, selection, gutter, wrapping, and scroll state. | A full IDE editor with syntax services, files, or undo history. |
| `textInput()` | Caller-owned single-line editable value with cursor, placeholder, validation, and pointer-to-text support. | A command palette, number parser, or multi-line editor. |
| `numberInput()` | Single numeric field with optional step controls and validation display. | A slider, range selector, or numeric domain model. |
| `stack()` | Vertical composition with shared flow options. | A visual panel or scroll container by itself. |
| `row()` | Horizontal composition with shared flow options. | A toolbar semantic model or menu. |
| `grid()` | Row/column layout, including named areas, for explicit spatial composition. | A responsive app shell or breakpoint policy engine. |
| `splitPane()` | Axis-based pane division with caller-owned sizes. | A file explorer, workbench frame, or resizable window manager. |
| `surface()` | Single-child visual container for hierarchy, border/title grammar, state tone, and accessible naming. | A multi-child layout primitive; compose children before wrapping. |
| `tabs()` | Tab header plus selected-panel layout with semantic select, close, and navigation actions. | Navigation routing, persistence, or hidden panel state. |
| `modal()` | Centered contained dialog with optional action area and focus containment. | A general overlay system or application-level route. |
| `overlay()` | Layer multiple children in the same bounds. | A positioning engine with product semantics. |
| `absolute()` | Place one child at a relative rectangle. | A layout solver or drag/drop framework. |
| `viewport()` | Bounded window over one child with caller-owned scroll offsets. | A semantic list, table, editor, or transcript component. |
| `canvas()` | Safe drawing component for custom diagrams and visualizations. | Raw ANSI output or an imperative terminal API. |
| `form()` | Group controls into a form-like layout. | Form validation, submission, or state ownership. |
| `field()` | Label/help/error wrapper around field content. | A value control by itself. |
| `label()` | Accessible label/value text for forms and metadata. | A button or static document paragraph. |
| `button()` | Discrete action trigger with visual state and caller-provided message. | A toggle, menu item, or navigation link. |
| `checkbox()` | Boolean checked/unchecked control. | Multi-choice selection or a switch animation. |
| `toggleSwitch()` | Boolean on/off control with switch visual anatomy. | A checkbox list or status indicator. |
| `slider()` | Single numeric value on a track. | Progress display or range selection. |
| `rangeSlider()` | Two numeric endpoints on one track. | Two unrelated sliders or a progress meter. |
| `checkboxList()` | Multiple independent choices with semantic focus, movement, and toggle actions. | A tree, table, or form validator. |
| `radioGroup()` | One selected choice with semantic focus and selection actions. | A menu or arbitrary command list. |
| `selectBox()` | Form-style single value choice with semantic focus and selection actions. | A command menu, context menu, or searchable palette. |
| `colorPicker()` | Compact caller-owned color choice with semantic navigation and selection actions. | A full color-management tool. |
| `datePicker()` | Compact caller-owned date choice control. | Calendar scheduling or date arithmetic. |
| `menu()` | Inline command/action list with semantic navigation, activation, hierarchy, and scroll actions. | A form value selector or searchable command surface. |
| `menuBar()` | Horizontal top-level commands using the menu action contract. | Application chrome ownership or routing. |
| `contextMenu()` | Contextual command surface for a target. | Global navigation or persistent sidebar. |
| `dropdown()` | Compact action surface with separate open, highlight, and committed selection state. | A validated form value control; use `selectBox()` for required/error form semantics. |
| `palette()` | Searchable bounded picker for commands or data entries. | A shell, command parser, or application command registry. |
| `commandBar()` | Single-line command/composer surface with suggestions and history hooks. | A transcript, event log, or command execution engine. |
| `list()` | Simple selectable/filterable row list. | A table, tree, or virtual data store. |
| `table()` | Structured rows and columns with selection, scrolling, density, and cell semantics. | A spreadsheet engine or database. |
| `tree()` | Expandable hierarchy with selection, filtering, lazy placeholders, and pointer targets. | A filesystem API or ownership of expansion state. |
| `paginator()` | Page navigation control paired with caller-owned paging state. | Data loading or page storage. |
| `scrollback()` | Append-heavy visible window with semantic scroll, search, fold, and follow-tail actions. | A command input or complete session ledger. |
| `structuredBlock()` | One titled status record with fields, summary, body, and details. | A generic layout surface or arbitrary markdown block. |
| `activityFeed()` | Bounded structured records with semantic selection, filtering, and expansion actions. | Durable history storage or job orchestration. |
| `statusBar()` | Compact status line for app/system state. | A command bar, menu bar, or layout frame. |
| `helpBar()` | Keybinding and hint display. | Keybinding registration or command routing. |
| `activityIndicator()` | Small activity state display. | Progress measurement or task scheduling. |
| `progressBar()` | Determinate or indeterminate progress display. | Editable range input or status record. |
| `spinner()` | Animated process indicator driven by caller-owned frame state. | A scheduler or hidden runtime timer. |
| `notificationStack()` | Transient bounded notifications within caller-chosen layout bounds. | A global toast manager or overlay placement policy. |
| `tooltip()` | Small contextual explanation with placement hints. | A focus manager, popover controller, or overlay lifecycle system. |
| `divider()` | Visual separation and section rhythm. | Layout spacing by itself. |
| `sparkline()` | Tiny trend visualization. | Full chart with axes, legend, or interaction. |
| `barChart()` | Compact categorical bar visualization. | Table replacement or arbitrary canvas drawing. |
| `chart()` | Bounded multi-series chart with sampling, axes, semantic selection, and keyboard window navigation. | A charting application or data analytics engine. |
| `gauge()` | Compact scalar gauge. | Progress workflow or editable value input. |
| `heatmap()` | Grid of values with value-scale coloring and semantic cell and viewport navigation. | Spreadsheet, calendar, or matrix editor. |

## Shared Contracts

Every component accepts top-level `id` and optional `meta`.

`meta.accessibility` can provide a full accessible node override or lightweight
options such as `label`, `description`, and `decorative`. Decorative elements
are excluded from their parent's accessibility tree and must not expose
keyboard, text-input, focus, or pointer interaction.

`meta.focus` can disable focus traversal, set focus order, or contain focus
inside a subtree. `modal()` declares a contained focus scope by default.

`meta.layer` controls visibility, z-index, opacity, and overflow priority.
Higher visible layers render above lower layers and receive pointer hits first.

`meta.styles` is a semantic slot map for local visual overrides. Slots are
named for stable component parts and states: `root`, `border`, `title`,
`label`, `value`, `placeholder`, `selected`, `focused`, `disabled`, `error`,
`warning`, and `success`.

For app structure and controlled state, see [UI authoring](./ui-authoring.md).
For reusable reducers, see [Behavior helpers](./behavior.md). For custom
renderer escape hatches, see [Renderer extensions](./renderer-extensions.md).
