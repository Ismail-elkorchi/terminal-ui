# Widgets

Widgets are pure data descriptions. Constructing a widget never writes to the
terminal, reads input, mutates global state, or performs runtime side effects.

Built-in widget factories include text, rich text, text area, box, stack, row,
grid, split panes, tabs, modal, list, table, tree, paginator, input-field,
command bar, command palette, status bar, help bar, activity indicator,
progress bar, spinner, sparkline, bar chart, chart, viewport, and scrollback
widgets, plus structured blocks and activity feeds.

Widget metadata drives layout, focus routing, rendering, and accessible
snapshots.

Widgets with a non-empty `keyMap` are keyboard-focusable controls. The TUI
runtime routes matching normalized key names to the focused widget's message,
so containers such as `box()`, `stack()`, `row()`, `table()`, `statusBar()`,
and `viewport()` can participate in keyboard-only workflows without pretending
to be input fields.

`statusBar()` and `spinner()` expose accessible `status` nodes.
`helpBar()` renders keybinding hints as ordinary status text.
`activityIndicator()` renders compact activity state for reusable app chrome.
`progressBar()` exposes a `progressbar` node, clamps determinate values into
range, and marks omitted values or `indeterminate: true` as indeterminate
progress.

`richText()` accepts styled text segments and renders sanitized display text.
`textArea()` provides a bounded multi-line text surface with cursor and
selection metadata. Editing behavior stays in application state and shared text
helpers; widgets remain pure data.

`viewport()` renders one child through a bounded window. `scrollRow` and
`scrollColumn` choose the visible offset, while `contentRows` and
`contentColumns` describe the virtual content area. Offscreen child cells are
clipped before they enter the frame.

`scrollback()` renders append-heavy text records such as logs, transcripts,
stream output, and event feeds. It follows the tail by default, accepts an
explicit `ScrollState` for controlled navigation, marks omitted rows, sanitizes
terminal control sequences, and exposes only the visible window in the frame and
accessibility tree. It also supports optional wrapping, search match metadata,
and pure selected-text extraction without mutating the terminal clipboard.

`list()` supports selected rows, caller-provided filters, and explicit
`ScrollState`. `table()` supports constrained columns and selected rows or
cells. `tree()` renders visible expanded nodes with selected-row accessibility;
use the pure `treeReducer()` helper for expansion state. `paginator()` renders
normalized page state and pairs with the pure `paginationWindow()` helper.
`sparkline()`, `barChart()`, and `chart()` are bounded text-dashboard
primitives for compact terminal metrics.

`structuredBlock()` renders a single titled record with optional summary,
status, fields, body, details, and collapsed state. `activityFeed()` renders a
bounded list of those records with selected-row accessibility. These widgets are
generic enough for logs, jobs, tasks, messages, diagnostics, and event streams;
application-specific naming stays outside `terminal-ui`.

`commandBar()` renders a single-line command entry surface with optional
suggestions. The pure `commandBarReducer()` helper uses the shared text edit
buffer for editing, history movement, suggestion selection, and completion
acceptance. `commandPalette()` renders a bounded fuzzy-filtered entry list; the
pure `filterCommandPaletteEntries()` and `commandPaletteWindow()` helpers keep
filtering and selection independent from shells or application commands.

`grid()` lays children into row/column tracks. `splitPane()` divides children
along one axis with fixed, percent, or fill tracks. `tabs()` renders tab labels
and lays out only the selected panel, so hidden panels do not participate in
focus traversal. `modal()` centers a bounded dialog and lays child content
inside the border. These are layout primitives; screen-specific state and
application routing stay outside widgets.
