# Accessibility

Every prompt, caller-supplied element tree, and TUI frame has an accessible snapshot path.
Snapshots are machine-readable data with roles, labels, values, focus state,
selection state, disabled state, expanded state, checked state, progress state,
diagnostics, and source metadata where the surface can provide them.

Form controls, switches, sliders, numeric inputs, grids, trees, grouped
controls, and navigation controls use their established accessibility roles
and required parent-child relationships. Numeric controls expose current,
minimum, maximum, and indeterminate values where their role permits them.
Snapshot validation rejects unknown fields, fields that are invalid for a
role, and invalid direct-child roles.

Document surfaces can expose `document`, `heading`, `link`, `list`, and
`listitem` nodes.
Headings use a positive, one-based `level` where the source has a heading
level, and links expose their accessible label and focus state.

The public snapshot format accepts the standard structures represented by its
declared roles, not only trees emitted by built-in controls. Tables and grids
may contain rows directly or through row groups. Rows may contain cells, grid
cells, column headers, and row headers. List boxes, menus, radio groups, and
trees may use grouping nodes around their required item roles. Built-in table
headers are emitted as column headers. A separate `label()` element creates a
machine-readable `labelledBy` relationship on its target control. Labels and
descriptions caller-supplied directly on built-in controls remain fields on the node
they describe and do not require separate descriptive children.

Tabs expose a group containing a tab list and its tab panels. Each tab names
the panel it controls, each panel is labelled by its tab, and the selected
panel contains the selected tab's accessible child content. Relationship
validation requires referenced nodes to exist in the same snapshot and rejects
self-references or references to the wrong role.

Positions exposed to accessibility consumers are positive and one-based:
`positionInSet`, `rowIndex`, `columnIndex`, and `level`. Their corresponding
counts are `setSize`, `rowCount`, and `columnCount`.

Collection windows use zero-based `startIndex` values and exclusive
`endIndexExclusive` values. `totalCount`, `omittedBefore`, and `omittedAfter`
describe the full collection. A visible item at internal index 0 therefore has
accessibility position in set 1.

Use `toAccessibleSnapshot()` for standalone accessible payloads and the testing
harness `snapshot()` method for rendered surfaces. Prompt and TUI runs return
snapshots in their typed result objects.

The snapshot source is `prompt`, `tui`, `renderer`, `progress`, or
`test_harness`. Direct renderer output uses `renderer`; snapshots captured
during a TUI run use `tui`; and an empty memory or PTY harness uses
`test_harness` with a group root.

Accessible snapshots are designed for assistive tooling, deterministic tests,
and agent inspection. They are data, not terminal control output.
