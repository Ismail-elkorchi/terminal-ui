# Widgets

Widgets are pure data descriptions. Constructing a widget never writes to the
terminal, reads input, mutates global state, or performs runtime side effects.

Built-in widget factories include text, box, stack, row, list, table,
input-field, status bar, progress bar, spinner, and viewport widgets.

Widget metadata drives layout, focus routing, rendering, and accessible
snapshots.

Widgets with a non-empty `keyMap` are keyboard-focusable controls. The TUI
runtime routes matching normalized key names to the focused widget's message,
so containers such as `box()`, `stack()`, `row()`, `table()`, `statusBar()`,
and `viewport()` can participate in keyboard-only workflows without pretending
to be input fields.

`statusBar()` and `spinner()` expose accessible `status` nodes.
`progressBar()` exposes a `progressbar` node, clamps determinate values into
range, and marks omitted values or `indeterminate: true` as indeterminate
progress.

`viewport()` renders one child through a bounded window. `scrollRow` and
`scrollColumn` choose the visible offset, while `contentRows` and
`contentColumns` describe the virtual content area. Offscreen child cells are
clipped before they enter the frame.
