# Widgets

Widgets are pure data descriptions. Constructing a widget never writes to the
terminal, reads input, mutates global state, or performs runtime side effects.

Built-in widget factories include text, rich text, text area, box, stack, row,
grid, split panes, tabs, modal, list, table, tree, paginator, input-field,
form, field, label, button, checkbox, radio group, select box, text input,
number input, menu, menu bar, context menu, dropdown, canvas, surface,
absolute placement, overlay, command bar, command palette, status bar, help
bar, activity indicator, progress bar, spinner, sparkline, bar chart, chart,
viewport, and scrollback widgets, plus structured blocks and activity feeds.

Widget metadata drives layout, focus routing, rendering, and accessible
snapshots.

For renderer-facing implementation guidance, see
[Building polished widgets](./building-polished-widgets.md). For the frame,
diff, span, and ANSI pipeline, see
[Rendering internals](./rendering-internals.md).

Accessibility metadata can provide a full accessible node override or lightweight
options such as `label`, `description`, and `decorative`. Decorative widgets are
excluded from their parent's accessibility tree and must not expose keyboard,
text-input, focus, or pointer interaction. Custom widgets must either provide an
accessibility renderer or opt into `decorative: true` for pure visual content.

Widgets can expose pointer hit regions during render/layout. Hit regions carry
stable ids, bounds, optional cursor hints, messages, and z-index metadata. The
runtime routes mouse events to the topmost matching hit region, using layer
order as a deterministic tie-breaker. Hit targets are the pointer interaction
model; widgets should expose pointer behavior through renderer-owned hit
targets or high-level factory options that compile to hit targets.

Every widget factory accepts layer metadata. `zIndex` raises or lowers a widget
relative to its parent stacking context, and higher visible layers render above
lower layers and receive pointer hits first. `visible: false` keeps the widget
in the layout tree for inspection but removes it from rendering, focus, hit
testing, and accessible children. This supports overlays, popovers, modal
surfaces, and temporarily hidden panels without making those concepts special
cases in the renderer.

Widgets with a non-empty `keyMap` are keyboard-focusable controls. The TUI
runtime routes matching normalized key names to the focused widget's message,
so containers such as `box()`, `stack()`, `row()`, `table()`, `statusBar()`,
and `viewport()` can participate in keyboard-only workflows without pretending
to be input fields.

Widgets can also declare focus metadata with `focus`. `focus.disabled` removes
a target from traversal without hiding the widget, `focus.order` gives
deterministic traversal order when visual order is not enough, and
`focus.scope: 'contain'` keeps keyboard traversal inside that widget's
descendants. `modal()` declares a contained focus scope by default; any
composed popover, overlay, or custom surface can opt into the same behavior
without a special runtime path. Custom renderers may expose multiple focus
targets with local ids, bounds, cursor positions, disabled state, and order.

Every widget factory also accepts `styles`, a semantic slot map for local
visual overrides. Slots are named for stable widget parts and states:
`root`, `border`, `title`, `label`, `value`, `placeholder`, `selected`,
`focused`, `disabled`, `error`, `warning`, and `success`. Built-in widgets map
those slots onto theme-backed defaults, then merge caller-provided slots over
the defaults. There is no CSS cascade: a style only affects the widget that
receives it and the specific slots that renderer uses.

```js
const saveButton = button({
  label: 'Save',
  styles: {
    label: { fg: { kind: 'theme', token: 'status.success' }, bold: true },
    focused: { fg: { kind: 'theme', token: 'focus.border' } }
  }
});

const dialog = modal(saveButton, {
  title: 'Confirm',
  styles: {
    border: { fg: { kind: 'theme', token: 'status.warning' } }
  }
});
```

`statusBar()` and `spinner()` expose accessible `status` nodes.
`helpBar()` renders keybinding hints as ordinary status text.
`activityIndicator()` renders compact activity state for reusable app chrome.
`progressBar()` exposes a `progressbar` node, clamps determinate values into
range, and marks omitted values or `indeterminate: true` as indeterminate
progress. Its visual model supports determinate and indeterminate bars,
compact or full metrics, caller-selected bar width, label placement,
percentage display, and semantic status tone.

`richText()` accepts styled text segments and renders sanitized display text.
`textArea()` provides a bounded multi-line text surface with cursor and
selection metadata. Editing behavior stays in application state and shared text
helpers; widgets remain pure data.

`form()` and `field()` are layout containers for general form-like UIs:
installers, setup wizards, settings screens, surveys, and configuration
panels. Controls such as `label()`, `button()`, `checkbox()`,
`radioGroup()`, `selectBox()`, `textInput()`, `textArea()`, and
`numberInput()` render caller-owned state and emit caller-provided messages.
They do not own validation rules or values. Validation text, required state,
disabled state, selected options, cursor positions, and submitted/cancelled
flows stay in application state. Accessibility exposes labels, values,
validation descriptions, required markers, disabled controls, checked/selected
state, and focused controls.

`menu()`, `menuBar()`, `contextMenu()`, and `dropdown()` render generic menu
surfaces. They support disabled items, checked items, shortcuts, caller-owned
selection, nested submenu items through `children`, and expanded submenu state
through `expanded`. Menu items emit caller-provided messages through the same
focus and hit-target routing used by other widgets. A menu can be inline,
placed in a popover or modal by composition, stretched full screen, or used as
a dropdown body; the widget does not own application command semantics.
Accessibility exposes `menu` and `menuitem` roles with selected, checked,
disabled, and expanded state.

`canvas()` lets application code draw styled spans through the safe
`FrameBuffer` API. `surface()` creates a general coordinate-space container,
`absolute()` places one child at a caller-provided relative rectangle, and
`overlay()` stacks children into the same bounds. These primitives are for
games, maps, diagrams, custom editors, dashboards, and drawing tools. They do
not accept raw ANSI output; text still passes through frame-buffer clipping,
Unicode-width handling, sanitization, style preservation, and accessibility
projection.

`viewport()` renders one child through a bounded window. `scrollRow` and
`scrollColumn` choose the visible offset, while `contentRows` and
`contentColumns` describe the virtual content area. Offscreen child cells are
clipped before they enter the frame.

`scrollback()` renders append-heavy text records such as logs, transcripts,
stream output, and event feeds. It follows the tail by default, accepts an
explicit `ScrollState` for controlled navigation, marks omitted rows, sanitizes
terminal control sequences, and exposes only the visible window in the frame and
accessibility tree. It also supports optional wrapping, search match metadata,
timestamps, metadata columns, per-item styling, and pure selected-text
extraction without mutating the terminal clipboard.

`list()` supports selected rows, caller-provided filters, and explicit
`ScrollState`. `table()` supports fixed, fill, percent, and content column
widths, sticky headers, row and cell selection, shared horizontal and vertical
scroll state, alignment, truncation markers, styled cells, per-column renderers,
sort indicators, hidden columns, and empty states. `tree()` renders expandable
nested data with selected paths, disabled nodes, filtering, lazy placeholders,
icons, metadata matching, row mouse targets, clipping, and accessible expanded
state;
use the pure `treeReducer()` helper for expansion state. `paginator()` renders
normalized page state and pairs with the pure `paginationWindow()` helper.
`sparkline()`, `barChart()`, and `chart()` are bounded text-dashboard
primitives for compact terminal metrics.

`structuredBlock()` renders a single titled record with optional summary,
status, fields, body, details, and collapsed state. `activityFeed()` renders a
bounded list of those records with selected-row accessibility. Block status
values cover pending, running, success, warning, error, failed, cancelled,
skipped, and info states through theme tokens; fields align to a shared label
column, and long body/details text wraps within the available row width. These
widgets are generic enough for logs, jobs, tasks, messages, diagnostics, and
event streams; application-specific naming stays outside `terminal-ui`.

`commandBar()` renders a single-line input surface with a prompt, placeholder,
cursor, completion preview, validation line, footer, and optional suggestions
with styled match segments. The pure `commandBarReducer()` helper uses the
shared text edit buffer for editing, history movement, suggestion selection,
and completion acceptance. `palette()` renders a bounded fuzzy-filtered entry
list with highlighted matches, disabled entries, preview/help rows, stable
selection, scroll offsets, and empty states. The pure `filterPaletteEntries()`
and `paletteWindow()` helpers keep filtering and selection independent from
shells or application commands. `commandPalette()` is only a small
command-shaped convenience factory over `palette()`.

`grid()` lays children into row/column tracks. `splitPane()` divides children
along one axis with fixed, percent, content, or fill layout sizes. Stack, row,
grid, split-pane, tabs, viewport, box, and modal compositions use shared layout
flow options such as gap, padding, margin, min/max dimensions, horizontal
alignment, vertical justification, and clipped or visible overflow. `box()` and
`modal()` use the shared border model, including single,
double, rounded, heavy, ascii, and borderless variants. Border titles can align
to the start, center, or end, and focused bordered widgets can use a focused
border style. `tabs()` renders tab labels and lays out only the selected panel,
so hidden panels do not participate in focus traversal. `modal()` centers a
bounded dialog and lays child content inside the border. These are layout
primitives; screen-specific state and application routing stay outside widgets.

Executable examples:

- `examples/tui/forms-settings.mjs`
- `examples/tui/file-browser.mjs`
- `examples/tui/data-table.mjs`
- `examples/tui/log-viewer.mjs`
- `examples/tui/command-palette.mjs`
- `examples/tui/text-editor.mjs`
- `examples/tui/game-board.mjs`
- `examples/tui/custom-widget.mjs`
